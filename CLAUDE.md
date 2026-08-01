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

Free text against a logged entry becomes one of: rescale the quantity, adjust a
part, re-describe the dish and re-run the same cascade, or decline. A
correction never silently loses the breakdown.

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
