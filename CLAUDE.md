# RiceCal

A calorie diary for Malaysian eating. Photograph a plate, get calories and
macros; or search a catalogue of ~457k dishes and log by hand.

```
apps/mobile      Expo / React Native app (expo-router, NativeWind, react-query)
apps/supabase    Postgres schema, RLS, pgTAP tests, Deno edge functions
packages/shared  the few constants both sides need
```

Deeper docs live next to what they describe, and they are the authority on
their own area:

| where | what |
|---|---|
| `apps/supabase/README.md` | the declarative schema workflow, the catalogue import, why nothing seeds `foods` |
| `apps/mobile/src/ui/README.md` | the design system, and which prop targets which box |
| `apps/mobile/AGENTS.md` | Expo 57 changed; read the versioned docs before writing Expo code |

## Commands

```bash
pnpm check        # typecheck + jest + biome, across the workspace
pnpm db:start     # local Supabase (ports 544xx — API 54421, db 54422, Mailpit 54424)
pnpm db:reset     # apply every migration to an empty database
pnpm db:test      # pgTAP
pnpm db:diff <n>  # capture schema edits as a migration — never hand-write one
pnpm start        # Metro (dev client)
```

Edge functions are Deno and outside the pnpm workspace, so `pnpm check` does
not see them. `deno check --no-lock --config <fn>/deno.json <fn>/index.ts` is
their typecheck, and CI runs it over every function. `--no-lock` matters: a
lockfile left in a function directory gets bundled and triples the deployed
script.

## How a photo becomes calories

The client never talks to a model and never sees the OpenRouter key. It
uploads a photo and calls an edge function, which does everything else and
writes the entry itself as `service_role` — it has to, because some tiers
create catalogue rows and no client may do that.

A meal can also be TYPED — "nasi lemak with fried chicken and a teh tarik" —
and that is the same endpoint and the same cascade. Only the first model call
differs: `describeMeal` instead of `analysePhoto`, both answering in the same
`Vision` shape. The difference between them is who the authority is. A photo
has one witness and it is the model, so everything it says is inference the
catalogue then checks. A sentence was written by the person who ate the meal,
so what it states — the dish, the number of them, the size, a calorie figure —
is the answer, and the model's job is only to name it searchably and price the
portion it was told about. `source` on the row is the only place the two part
company. The shared parts of both prompts are shared CONSTANTS in `llm.ts`;
the size anchors in them were expensive to derive and a second prompt with its
own copy would have relearned them wrong.

**Client** — `apps/mobile/src/data/snap.ts`

1. The shutter puts a *pending snap* on the day immediately
   (`data/pending-snaps.tsx`). There is no row to insert yet, so it lives in
   context and MMKV, and `useDayLog` merges it into the day.
2. It also **schedules** the "your plate is counted" notice right there. iOS
   suspends a backgrounded app within seconds, so code that runs when the
   answer arrives may never run; a notification already scheduled still fires.
   Cancelled if the app is awake when the scan lands.
3. Upload first, then invoke — the function reads the photo out of the bucket,
   so there is nothing to recognise until the object exists.
4. On success the pending row is dropped and the day refetches into the real
   entries.

**Server** — `apps/supabase/functions/scan-meal/index.ts`, cascade in
`_shared/cascade.ts`, model calls in `_shared/llm.ts`

One vision call returns queries, per-component sizing and a kcal *range* —
never nutrients. Then, in order:

- **Nutrition panel** → read the figures off the label and stop. Nothing is
  searched or estimated; somebody photographing a panel is saying the answer is
  printed here.
- **No food** → answer `{ok: true, food: false}`, write nothing. A blurred
  plate is still a meal; a photo of a cat is not.
- **Tier 2, components** — when the model *listed* ≥2 parts. Each part resolves
  to its own catalogue row (or a per-unit estimate row), and the entry is the
  sum of them. Gated on the list, not on `scene`: a banana leaf of satay came
  back "single" with three components on it.
- **Count** — several of one countable thing. Three durian are three, priced
  per unit, count in the portion where the stepper reaches it.
- **Tier 1/3, dish** — `search_foods` (specific → generic → head noun), a
  verifier picks one, a wide ratio gate accepts it. Identity is what a vision
  model is good at; calories are what it is worst at.
- **Tier 4, estimate** — a second model call, Atwater-checked, written as a
  shared `is_estimate` row deduped on name **and size**.
- **Tier 5, archetype** — classification over ~60 seeded generic rows,
  bottoming out at a terminal "Mixed meal" at a hardcoded id that needs no
  model and no network.

`food_scan_items` records what the model claimed and where it landed;
`food_scan_misses` is the catalogue-widening backlog.

**Correcting it** — `scan-refine/index.ts`

Free text against a logged entry becomes one of: decline, rescale the quantity,
adjust a part, or re-describe the dish and re-run the same cascade. A
correction never silently loses the breakdown.

Those four are a LADDER, ordered by how much of the entry survives them, and
the interpreter's prompt is written as one — stop at the first that fits.
Offered as a flat menu it reached for `redescribe` whenever it was unsure,
which is the one answer that throws away everything the user has already
accepted: "this was more like 500 calories" re-guessed a dish nobody said was
wrong, and "it was rendang chicken not fried chicken" binned the rice, the
sambal and the egg to fix one side. A correction that comes back as a
different meal is the failure this feature has to avoid.

Two consequences worth knowing. A part that turned out to be a different food
is a SWAP — one row out, one row in, the rest untouched — and it is priced by
asking what the new food costs, never by asking how it differs from the old
one: as a delta the model put rendang chicken 172 kcal below fried chicken.
And the interpreter is shown each part's count and calories, because "I left
half the rice" cannot be answered by a model that has only been told the word
"rice".

`pnpm eval:prompts` grades both this prompt and the typed-meal one against
~45 written-down cases. It imports the prompts rather than copying them.

## How movement extends the budget

Apple Health on iOS, Health Connect on Android. Both are on-device stores, so
the phone is the reader and Postgres is the record — a figure that only exists
on one handset cannot take part in a budget computed in the database, a chart
computed in the database, or a report job with no client to ask.

**Reading** — `apps/mobile/src/lib/health/` (and its README, which is the
authority on what each store actually gives you, and on what Android is missing)

Three providers behind one interface: `apple.ts`, `androidHealth.ts`, and
`demo.ts` — generated, deterministic, dev-only, and a `health_provider` enum
value rather than a flag so every query and delete treats it like a real one.
Both native libraries are `require`d lazily; a top-level import of a Nitro
module throws on a dev client built before the dependency landed, and the
symptom is a white screen rather than a broken tab.

**Syncing** — `apps/mobile/src/data/health-sync.ts`

A year-deep backfill on connect, then the last SEVEN DAYS re-read on every
foreground. Not a cursor, and that is the decision the file is shaped around:
health data arrives late and arrives edited — a watch out of range writes
Tuesday on Wednesday, Strava back-dates an upload, Apple recomputes a day when a
second source appears. "Everything since the last sync" misses all three
permanently. Every key in the schema exists to make that repetition free.

**Storing** — `apps/supabase/schemas/41_activity.sql`, read side in `93_activity.sql`

`activity_days` keyed by date, `activity_hours` by date and hour,
`activity_sessions` by the STORE'S OWN id — which is the only one that needed
thinking about, since two badminton games can start in the same minute.

## Invariants

Break these and the feature is wrong in ways tests may not catch.

- **An entry with a breakdown IS its breakdown.** `food_log_details` coalesces
  three sources in order: what the user typed (`override_*`), what the parts
  add up to, what the dish costs at this portion. `lib/nutrition.ts`'s
  `entryTotals` is the client's copy of that same rule — they must agree.
  Scaling one parent row moves all four macros in lockstep, which is why
  editing an ingredient once changed only the calories.
- **`food_logs.food_id` stays NOT NULL.** Every scan resolves to a real row.
- **An LLM figure is never averaged with a catalogue figure**, and the
  nutrition call is never told the vision call's guess — anchored, the model
  answered 450 kcal for a plate of apple slices, and 120 without.
- **Only edge functions write the catalogue**, as `service_role`.
- **Adjust the amount, never the macros**, when a row is the right dish at the
  wrong size.
- **Burned calories extend the budget; they never shrink what was eaten.** The
  arithmetic is `goal + active - eaten`, written as an addition on screen. Every
  app in this category has at some point shipped the subtraction, and it turns a
  diary into a scoreboard people play by eating less.
- **Only ACTIVE energy reaches the budget.** The goal is already Mifflin-St Jeor
  with an activity multiplier, so adding the store's resting figure would credit
  a user ~1,500 kcal for being alive twice. Resting is stored beside it, and is
  read only by the burn breakdown.
- **Null is not zero in `activity_days`.** Health Connect has no stand hours at
  all and often no resting energy; a confident zero there is a claim about the
  user rather than about the provider.
- **The OpenRouter key never reaches the client.**
- No embeddings.

## Things that will bite you

- **`supabase db diff` misses function grants.** Against the full local stack
  it reports no changes for `revoke`/`grant` deltas; the CI `migrations` job
  catches them. Five functions shipped executable by `PUBLIC` this way. After
  touching grants, check the CI job or query `pg_proc.proacl` directly — a
  leading `=X/postgres` means PUBLIC still has EXECUTE.
- **NativeWind only styles React Native's own components.** A third-party one
  takes `className` as an ordinary prop and drops it silently. `Screen.tsx`
  registers `cssInterop` for gesture-handler's ScrollView for exactly this.
- **`flex-1` names an axis you cannot see.** In a row it shares the width; in a
  column it takes the leftover *height* from a basis of nothing, and collapses
  when that height is bounded — which is what a keyboard does to a card. Let
  the caller ask for it rather than baking it into a component.
- **A `TextInput` crops to its line box where `Text` does not.** Copying a text
  variant's `leading-*` onto an input slices tall glyphs. Let the font choose
  its line box and pin the row's height instead.
- **A current iOS simulator has a Health store with nothing in it.** It is
  widely documented as having no Health app; that stopped being true. iOS 26
  reports `isHealthDataAvailable()` as true and shows the real permission sheet,
  then reads a year and returns nothing — which looks like a broken feature
  rather than an empty device. The Activity tab offers generated data once a
  connected store turns out to have no days in it.
- **Mock AI** is on whenever `OPENROUTER_API_KEY` is unset (or `MOCK_AI=true`),
  so a local stack scans with no config and production can never mock
  silently. Requests may steer it via `body.mock`, honoured in mock mode only.
- Adding or renaming an edge function needs `supabase stop && supabase start`;
  the running edge runtime does not pick it up.
- `supabase db push` and other networked CLI commands block on an invisible
  login prompt when `~/.supabase/` has no access token. The Supabase MCP tools
  work regardless.

## Conventions

Comments explain *why*, in prose, and are worth the space when the reason is
not recoverable from the code — a bug that motivated a shape, a constraint that
looks arbitrary. Match the density around you rather than adding a header to
everything.

Commit subjects are a sentence about what changed, not a conventional-commits
prefix.
