# RiceCal

A calorie diary for Malaysian eating. Photograph a plate, describe it in words,
or search a catalogue of ~457k dishes — and get calories and macros back.

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
| `apps/mobile/src/data/README.md` | the data layer, file by file |
| `apps/mobile/src/ui/README.md` | the design system, and which prop targets which box |
| `apps/mobile/src/lib/health/README.md` | what each health store actually gives you, and what Android is missing |
| `apps/mobile/AGENTS.md` | Expo 57 changed; read the versioned docs before writing Expo code |

---

## The shape of the whole thing

Three layers, and the boundary between them is the same in every feature.

**Postgres owns every number.** A day's calories, an entry's macros, the budget
in force, "days under goal" — each is a view or a function, so the arithmetic
happens once, in the place a future reminder job or weekly report can read
without a client. `src/lib/nutrition.ts` holds what is left: presentation, and
one projection of a budget that does not exist yet because onboarding has not
finished.

**The client reads through hooks.** Everything in `src/data` is a react-query
hook, one file per area, and no screen imports `supabase` directly. Every
mutation owns what it invalidates, so a screen never has to know what its write
touches. `keys.ts` holds every query key in the app, in one file, so a mutation
invalidating "the day" cannot spell it differently from the query that reads it
— the failure mode there is a screen that silently does not refresh, which
looks like a caching bug and is really a typo.

**Edge functions own the model.** The client never talks to OpenRouter and never
sees the key. It uploads a photo (or a sentence) and invokes a function, which
does everything else and writes the row itself as `service_role` — it has to,
because some tiers create catalogue rows and no client may do that.

Cached queries persist to MMKV, so a relaunch has yesterday's answers before the
first request returns. `SCHEMA_VERSION` in `packages/shared` is the persister's
cache buster: bump it whenever the shape of anything persisted changes, or old
data rehydrates into new code.

---

## Launching, and where a user lands

`app/index.tsx` is a redirect, not a screen, so there is never a back-stack
entry pointing at nothing. It asks three questions in order — is the keychain
read still in flight, is there a session, does the profile have `onboarded_at` —
and the order is the flow. The questions come BEFORE the account: a visitor
answers seven onboarding screens, is asked for an email at the end, and so the
local draft rather than the session is what says how far they got. The draft is
in MMKV and outlives the account it was flushed for, which is why a signed-out
relaunch starts at the top rather than resuming.

`app/_layout.tsx` stacks the providers, and the nesting is load-bearing:
`ThemeProvider` above the navigator so every screen and Modal inherits the
palette (the CSS-variable scope follows the React tree, not the native view
hierarchy); `SessionProvider` inside the query provider because signing in and
out clears the cache, and one account's diary must never appear under another's
name even for a frame; `ToastProvider` outside the navigator so a "saved"
confirmation survives the screen that fired it popping.

Routes come in two shapes. **Full pages push** — settings, the reports, search,
the dish detail — and carry a chevron in their own `AppBar`. **Modals present** —
the quick selector, the paywalls — and carry a cross. Every screen draws its own
title bar; the native header is off everywhere.

The tab bar is the headless `expo-router/ui` Tabs rather than a styled
navigator, because the raised centre FAB is not a tab: it opens a modal and has
to sit between the second and third slots without being one.

---

## What the database holds

```
auth.users
  └── profiles ────────────── body + goal: the inputs to the calorie budget
       ├── user_settings ──── display, notifications, privacy
       ├── meal_times ─────── when each meal is, and whether to remind
       ├── daily_goals ────── the budget, effective-dated
       ├── subscriptions ──── read-only mirror of RevenueCat
       ├── food_logs ──────── what was eaten          → foods, food_servings
       │    └── food_log_ingredients   what a scanned plate was made of
       ├── daily_logs ─────── water and a day note
       ├── weight_logs ────── the source of truth for current weight
       └── health_connections  which health store, and how far back it has read
            ├── activity_days ───── one day of movement, keyed by local date
            ├── activity_sessions  one workout, keyed by the store's own id
            └── activity_hours ──── steps by local hour, last month only

foods ──── food_servings      the shared catalogue, read-only to clients
food_scan_items               what the model claimed, and where it landed
food_scan_misses              the catalogue-widening backlog
```

The ~60 archetype rows are not a table: they are `foods` rows written by
`seed_archetype_foods()`, a function rather than inserts because schema files
only shape the shadow database during a diff, and data written there would never
reach a migration.

Read shapes are views, all `security_invoker`: `food_details`,
`food_log_details`, `food_log_ingredient_details`, `daily_nutrition`,
`user_food_stats`, `current_daily_goals`. Plus `goals_on(date)`,
`logging_streak()`, `day_marks(from, to)`, and two range families —
`trend_days` / `trend_series` / `trend_summary` for the diary, and
`activity_days_range` / `activity_series` / `activity_summary` for movement.

Three things are effective-dated or keyed in a way worth knowing. `daily_goals`
is one row per change rather than one mutable row, so a target tightened on
Thursday does not redraw Monday. `activity_sessions` is keyed by the store's own
id, because two badminton games can start in the same minute. And
`meal_times.at` is a `time` rather than a timestamp, because "08:00 in the
user's own clock" stays true when they fly somewhere else.

The schema is DECLARATIVE: `apps/supabase/schemas/*.sql` is the source of truth
and migrations are generated from it, never hand-written. The exceptions are
documented in `apps/supabase/README.md` — storage buckets, which the diff cannot
see, and the `auth` trigger, which it sees too well.

---

## Logging a meal

Three ways in, and the FAB opens all of them in one sheet (`app/log/index.tsx`):
**Snap** a photo, **Describe** it in words, or **Search** the catalogue. Whatever
the route, the entry is written against `selectedDate` — the day the strip on
Today has selected, not necessarily today.

Search and quick-add are ordinary writes. The other two run the cascade.

### The cascade

**Client** — `src/data/snap.ts`

1. The shutter (or the send button) puts a *pending snap* on the day
   immediately, in context and MMKV (`data/pending-snaps.tsx`), because there is
   no row to insert yet. `useDayLog` merges it into the day.
2. It also **schedules** the "your plate is counted" notice right there. iOS
   suspends a backgrounded app within seconds, so code that runs when the answer
   arrives may never run; a notification already scheduled still fires. It is
   cancelled if the app is awake when the scan lands.
3. Upload first, then invoke — the function reads the photo out of the bucket,
   so there is nothing to recognise until the object exists. A typed meal skips
   this and is one call shorter.
4. On success the pending row is dropped and the day refetches into the real
   entries. A pending row whose entry arrived by another route (a refetch on
   focus) is recognised by SOURCE and timestamp and dropped, or the meal appears
   twice for a second.

**Server** — `apps/supabase/functions/scan-meal/index.ts`, cascade in
`_shared/cascade.ts`, model calls in `_shared/llm.ts`

One vision call returns queries, per-component sizing and a kcal *range* — never
nutrients. Then, in order:

- **Nutrition panel** → read the figures off the label and stop. Nothing is
  searched or estimated; somebody photographing a panel is saying the answer is
  printed here.
- **No food** → answer `{ok: true, food: false}`, write nothing. A blurred plate
  is still a meal; a photo of a cat is not.
- **Tier 2, components** — when the model *listed* ≥2 parts. Each resolves to its
  own catalogue row (or a per-unit estimate row) and the entry is their sum.
  Gated on the list, not on `scene`: a banana leaf of satay came back "single"
  with three components on it.
- **Count** — several of one countable thing. Three durian are three, priced per
  unit, counted in the portion where the stepper reaches it.
- **Tier 1/3, dish** — `search_foods` (specific → generic → head noun), a
  verifier picks one, a wide ratio gate accepts it. Identity is what a vision
  model is good at; calories are what it is worst at.
- **Tier 4, estimate** — a second model call, Atwater-checked, written as a
  shared `is_estimate` row deduped on name **and size**.
- **Tier 5, archetype** — classification over the seeded generic rows, bottoming
  out at a terminal "Mixed meal" at a hardcoded id that needs no model and no
  network.

Once the caller is authenticated and the body parses, this endpoint does not
return an HTTP error: every failure falls to the archetype floor, because a
diary that refuses the meal is worse than one that logs it roughly.
`food_scan_items` records what the model claimed and where it landed;
`food_scan_misses` is the catalogue-widening backlog.

### Typed and photographed are the same pipeline

A meal can be TYPED — "nasi lemak with fried chicken and a teh tarik" — and that
is the same endpoint and the same cascade. Only the first model call differs:
`describeMeal` instead of `analysePhoto`, both answering in the same `Vision`
shape. `food_logs.source` (`text` vs `camera`) is the only place the two part
company afterwards.

The difference between the two prompts is WHO THE AUTHORITY IS. A photo has one
witness and it is the model, so everything it says is inference the catalogue
then checks. A sentence was written by the person who ate the meal, so what it
states — the dish, the number of them, the size, a calorie figure — is the
answer, and the model's job is only to name it searchably and price the portion
it was told about. The shared parts of both prompts are shared CONSTANTS in
`llm.ts`; the size anchors in them were expensive to derive and a second prompt
with its own copy would have relearned them wrong.

The client mirrors that difference only where it has to: a typed row wears the
sentence until the dish lands, because a snapped row has its photograph and a
typed one would otherwise be a spinner over an empty line.

### Correcting it

There are two ways to change a logged entry, and they are separated because
they cost different things.

**By hand, on `app/log/food/[id].tsx`.** The detail screen is a FORM: the
portion, the serving, a typed figure, the name, the picture and each part of a
decomposed plate all stage in local state, and the Save button in the footer
writes the lot in one go. It used to write as it was edited, on a debounce,
which was honest about the moment and impossible to think in — a plate corrected
in four places was four round trips, and changing your mind meant changing the
control back. The staging is what makes the number on screen a preview: the
totals card reads `entryTotals` over the staged values, so what Save commits is
what was being read. Leaving with something staged asks first, since the back
chevron is now a discard.

**By describing it to the model**, through the sparkle button beside Save. That
opens a sheet with the field and the suggested chips
(`features/logging/FixSheet.tsx`), and it is a sheet rather than a card on the
page because it is not one more staged control — the words go to the server,
come back as a different meal, and leave the screen behind. Anything staged is
written BEFORE the correction is sent: the server interprets the words against
the entry as it stands there, so "and half the rice" against a plate already
changed on screen would correct a meal neither of them is looking at.

There is ONE behaviour here, not one per source. `scan-refine` reads `scan_id`
as optional everywhere it touches it, so a hand-logged entry corrects exactly
like a photographed one — and the chips are instructions to the model rather
than text the client acts on, which is why "Half portion" is no longer a serving
swap the screen performs itself. There was briefly a second variant that saved
the words as a note on the row instead; it was a different feature wearing this
one's clothes, and nothing in the app displayed the note it wrote.

**`scan-refine/index.ts`** — free text against a logged entry becomes one of
four things, and they are a LADDER ordered by how much of the entry survives.
The interpreter's prompt is written as one, and it is told to stop at the first
rung that fits:

```
none        not a correction, or has no calories in it ("extra spicy")
quantity    only the amount changed — rescale the entry and every part under it
adjust      one part added, removed, resized or SWAPPED; re-price from the parts
redescribe  the food itself was wrong — re-run the whole cascade
```

Offered as a flat menu instead, the model reached for `redescribe` whenever it
was unsure, which is the one answer that throws away everything the user has
already accepted: "this was more like 500 calories" re-guessed a dish nobody
said was wrong, and "it was rendang chicken not fried chicken" binned the rice,
the sambal and the egg to fix one side. A correction that comes back as a
different meal is the failure this feature exists to avoid.

Three consequences worth knowing:

- A part that turned out to be a different food is a **swap** — one row out, one
  row in, the rest untouched — and it is priced by asking what the NEW food
  costs, never by asking how it differs from the old one. As a delta the model
  put rendang chicken 172 kcal below fried chicken.
- The interpreter is shown each part's **count and calories**, not just its name:
  "I left half the rice" cannot be answered by a model that has only been told
  the word "rice".
- A stated calorie total **rescales** rather than overrides. `override_kcal`
  would hit the number exactly, but it sits above the parts in
  `food_log_details`, so an entry with a breakdown would show the typed figure
  over an ingredient list adding to something else. Rescaling keeps the two in
  lockstep and pays for it in granularity — hence twentieths in
  `refineQuantity`, where quarters rounded small corrections back to no change
  at all.

`pnpm eval:prompts` grades the typed-meal prompt and this one against close to
sixty written-down cases. It imports the prompts rather than copying them — a
harness with its own copy grades a prompt nobody ships.

---

## Which day Today is showing

A week strip above the ring, Monday to Sunday, paged back a year — one page per
calendar week, each fetching only its own seven days as it scrolls into view.
Picking a day moves `selectedDate` (`data/selected-date.tsx`, the one piece of
genuinely client-owned state), and everything below follows it: the ring, the
water, the entry list, and anything logged while it is selected. The heading
stops saying "Today" the moment it is used, and the two present-tense lines
under the ring switch tense with it.

The dot under each number is that day's verdict, and there are three of them
plus silence: under goal, over goal, a hollow ring for a past day with nothing
on it — and NOTHING for today-before-breakfast or a day still ahead. That last
distinction is the one worth keeping: a day nobody has had yet has not been
missed, and marking it would be the app inventing a failure.

`day_marks(from, to)` returns the three facts a dot needs — what was eaten, the
goal effective THAT day, what movement added — and no verdict. It takes dates
rather than a named range, unlike the trend families, because a calendar week
has no window for `local_today()` to name. `features/logging/week.ts` turns
those facts into a dot and is unit-tested, because the ORDER is the whole thing:
ahead-of-today and not-yet-loaded both mean "say nothing", and only then does an
empty past day mean "missed".

---

## How movement extends the budget

Apple Health on iOS, Health Connect on Android. Both are on-device stores, so
the phone is the reader and Postgres is the record — a figure that only exists
on one handset cannot take part in a budget computed in the database, a chart
computed in the database, or a report job with no client to ask.

**Reading** — `src/lib/health/`. Three providers behind one interface:
`apple.ts`, `androidHealth.ts`, and `demo.ts` — generated, deterministic,
dev-only, and a `health_provider` enum value rather than a flag, so every query
and delete treats it like a real one. Both native libraries are `require`d
lazily; a top-level import of a Nitro module throws on a dev client built before
the dependency landed, and the symptom is a white screen rather than a broken
tab.

**Syncing** — `src/data/health-sync.ts`. A year-deep backfill on connect, then
the last SEVEN DAYS re-read on every foreground. Not a cursor, and that is the
decision the file is shaped around: health data arrives late and arrives edited
— a watch out of range writes Tuesday on Wednesday, Strava back-dates an upload,
Apple recomputes a day when a second source appears. "Everything since the last
sync" misses all three permanently. Every key in the schema exists to make that
repetition free.

**Storing** — `schemas/41_activity.sql`, read side in `93_activity.sql`.

---

## Money, and reminders

**Entitlement is the store's to decide and RevenueCat's to report.**
`subscriptions` is a read-only mirror with no client write grant at all, filled
by webhook; `data/purchases.ts` buys and restores but can never grant. A client
that could write that table is not a paywall. Every SDK in `lib/startup.ts` is
gated on its key being real — RevenueCat is additionally disabled in code, and
says so plainly rather than failing at the tap.

**Reminders are all local.** A meal reminder is "every day at 08:00 in the
user's own timezone", which both platforms express as a repeating calendar
trigger: no server, no push token, nothing to deliver if the phone is offline at
breakfast. Push, when it exists, is for what the phone cannot know by itself.

---

## The interface

`src/ui` is the design system and knows nothing about RiceCal;
`src/features/*` knows about meals, foods and targets; `app/*` is routes. A
`FoodRow` could not go in the design system without dragging the domain in with
it.

Colour is a role (`bg-pandan`, `text-muted`), never a literal. `ThemeProvider`
swaps the whole palette through CSS variables, so dark mode is not `dark:`
variants — the same `bg-surface` means white or `#1A2220` depending on the mode.
`Squish` is the press mechanic every raised control shares, and its slab is a
real view rather than a shadow, which is why a control's outer box is `depth`
taller than its visible surface.

`app/gallery.tsx` renders every component in every state, in both modes, on a
real device.

---

## Invariants

Break these and the feature is wrong in ways tests may not catch.

- **An entry with a breakdown IS its breakdown.** `food_log_details` coalesces
  three sources in order: what the user typed (`override_*`), what the parts add
  up to, what the dish costs at this portion. `lib/nutrition.ts`'s `entryTotals`
  is the client's copy of that same rule — they must agree. Scaling one parent
  row moves all four macros in lockstep, which is why editing an ingredient once
  changed only the calories.
- **`food_logs.food_id` stays NOT NULL.** Every scan resolves to a real row.
- **An LLM figure is never averaged with a catalogue figure**, and the nutrition
  call is never told the vision call's guess — anchored, the model answered
  450 kcal for a plate of apple slices, and 120 without.
- **No client writes the catalogue.** `authenticated` holds `select` on `foods`
  and `food_servings` and nothing else — no grant, not merely no policy. Every
  writer is `service_role`: the edge functions, and the two loaders
  (`scripts/import-catalogue.sql` for the CSV export, `public.import_foods` for
  researched JSON).
- **Adjust the amount, never the macros**, when a row is the right dish at the
  wrong size.
- **Burned calories extend the budget; they never shrink what was eaten.** The
  arithmetic is `goal + active - eaten`, written as an addition on screen. Every
  app in this category has at some point shipped the subtraction, and it turns a
  diary into a scoreboard people play by eating less. The week strip's dots are
  drawn against that same sum, because the ring and the dot under it describe
  one day and must not disagree about it.
- **Only ACTIVE energy reaches the budget.** The goal is already Mifflin-St Jeor
  with an activity multiplier, so adding the store's resting figure would credit
  a user ~1,500 kcal for being alive twice. Resting is stored beside it and read
  only by the burn breakdown.
- **Null is not zero in `activity_days`.** Health Connect has no stand hours at
  all and often no resting energy; a confident zero there is a claim about the
  user rather than about the provider.
- **The OpenRouter key never reaches the client.**
- No embeddings.

---

## Things that will bite you

- **`supabase db diff` misses function grants.** Against the full local stack it
  reports no changes for `revoke`/`grant` deltas; the CI `migrations` job catches
  them. Five functions shipped executable by `PUBLIC` this way. After touching
  grants, check that job or query `pg_proc.proacl` directly — a leading
  `=X/postgres` means PUBLIC still has EXECUTE. `tests/02_rls.test.sql` asserts
  the ones that matter.
- **NativeWind only styles React Native's own components.** A third-party one
  takes `className` as an ordinary prop and drops it silently. `Screen.tsx`
  registers `cssInterop` for gesture-handler's ScrollView for exactly this.
- **`flex-1` names an axis you cannot see.** In a row it shares the width; in a
  column it takes the leftover *height* from a basis of nothing, and collapses
  when that height is bounded — which is what a keyboard does to a card. Let the
  caller ask for it rather than baking it into a component.
- **A `TextInput` crops to its line box where `Text` does not.** Copying a text
  variant's `leading-*` onto an input slices tall glyphs. Let the font choose its
  line box and pin the row's height instead.
- **A sheet with a text field in it is `fullHeight`. Every time.** This has been
  got wrong repeatedly, so it is a rule rather than a judgement call. A capped
  panel is PADDED UP off the bottom edge by `KeyboardAvoidingView` when the
  keyboard opens, and the strip left behind shows the scrim through the curve of
  the keyboard's top corners — the sheet stops reading as attached to the bottom
  of the screen and starts reading as floating over it. `fullHeight` keeps the
  panel where it is and lets the scroll view inset its own content instead
  (`automaticallyAdjustKeyboardInsets`). The picture picker, the quick selector's
  search and describe panels, and `FixSheet` are all this shape.
  Two corollaries, both learnt the hard way. Such a sheet has NO `footer`: a
  footer sits outside the scroll view, so at full height it lands at the bottom
  of the panel behind the keyboard. Put the button in the body, after the field.
  And if the content is SHORT — a field, some chips, a button, rather than a
  list — pass `scrollable={false}` as well. A scroll view scrolls itself to
  reveal the first responder when the keyboard opens, and on the first open,
  before the keyboard's real height is known, it overshoots and carries the
  field clean off the top of the panel. A full-height sheet lays its content out
  at the top and lets the keyboard cover the empty part below; with nothing to
  scroll there is no scroll to get wrong.
- **`autoFocus` inside a `Modal` is dropped.** The field mounts with the window,
  before the platform has presented it, and the keyboard never comes up. `Sheet`
  takes an `onShow` for this — fire `ref.focus()` there. `SheetSurface` is a
  route rather than a window and needs none of this, which is why `autoFocus`
  works in the quick selector and not in a `Sheet`.
- **A current iOS simulator has a Health store with nothing in it.** It is widely
  documented as having no Health app; that stopped being true. iOS 26 reports
  `isHealthDataAvailable()` as true and shows the real permission sheet, then
  reads a year and returns nothing — which looks like a broken feature rather
  than an empty device. The Activity tab offers generated data once a connected
  store turns out to have no days in it.
- **Mock AI** is on whenever `OPENROUTER_API_KEY` is unset (or `MOCK_AI=true`),
  so a local stack scans with no config and production can never mock silently.
  Requests may steer it via `body.mock`, honoured in mock mode only.
- **Adding or renaming an edge function** needs a full stop and start of the
  local stack; the running edge runtime does not pick it up.
- **Edge functions are Deno and outside the pnpm workspace**, so the workspace
  check does not see them. `deno check --no-lock --config <fn>/deno.json
  <fn>/index.ts` is their typecheck, and CI runs it over every function.
  `--no-lock` matters: a lockfile left in a function directory gets bundled and
  triples the deployed script.
- **`supabase db push` and other networked CLI commands** block on an invisible
  login prompt when `~/.supabase/` has no access token. The Supabase MCP tools
  work regardless.

---

## What is not wired up

Worth knowing before wondering where the handler went.

- **Voice.** `app/log/voice.tsx` is routable and complete, but its
  "transcription" is `recogniseDish` — a fake that picks a dish out of the
  catalogue by slug — and nothing in the UI points at the route. Typing covers
  the same ground with real recognition, which is what the sheet offers instead.
- **RevenueCat** is disabled in `lib/startup.ts` by an explicit list rather than
  by a missing key, so the log does not blame `.env.local` for something a
  comment did.

---

## How it is checked

`pnpm check` is typecheck + jest + biome across the workspace, and CI runs it on
every push. Two more workflows guard the database. `supabase-migrations` rebuilds
a throwaway Postgres from every migration, runs the pgTAP suite in
`apps/supabase/tests`, and deno-checks each edge function.

`supabase-drift` is the interesting one: it diffs the DEPLOYED schema against
the committed migrations nightly, and it exists because there is no hosted
toggle to make the dashboard read-only. Anything applied through the SQL editor
— or through the Supabase MCP server, which is connected with write access and
is indistinguishable from a dashboard edit as far as the database is concerned —
bypasses migrations entirely, and this job is the only thing that notices. So a
migration applied that way needs its file committed at the SAME version, or the
job goes red on a change that is genuinely in the repo.

The RLS-sensitive pgTAP files run as `authenticated` with a forged JWT claim,
which is what PostgREST does on every request. Run as `postgres` the table owner
bypasses RLS and every assertion passes while proving nothing.

The catalogue is not seeded, and the tests are written to pass both on an empty
one and on a loaded one — assertions about it are written against its actual
size rather than a fixture count, because a developer who has run the import has
half a million rows in that table.

---

## Conventions

Comments explain *why*, in prose, and are worth the space when the reason is not
recoverable from the code — a bug that motivated a shape, a constraint that looks
arbitrary. Match the density around you rather than adding a header to
everything.

Commit subjects are a sentence about what changed, not a conventional-commits
prefix.
