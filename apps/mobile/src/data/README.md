# The data layer

Everything the screens read and write goes through this folder, and everything
here goes through Supabase. It replaced `src/mock`, and it kept that folder's
three rules — the point of them was always that this swap would be cheap.

## Files

| file | what it holds |
|---|---|
| `types.ts` | the domain. `Entry`, `Food`, `Targets`, and the enums, named off the generated `Database` |
| `mappers.ts` | row shapes to domain shapes, and the only place `?? 0` is allowed |
| `client.ts` | `unwrap` / `unwrapOne` / `unwrapMaybe`, `dateKey`, `datesBetween` |
| `keys.ts` | every query key in the app |
| `session.tsx` | who is signed in |
| `auth.ts` | Apple, Google and email-link sign-in |
| `profile.ts`, `settings.ts`, `goals.ts` | the account |
| `day.ts`, `entries.ts`, `foods.ts` | logging |
| `weight.ts`, `trends.ts` | progress |
| `photos.ts`, `snap.ts`, `pending-snaps.tsx` | the camera and typing paths |
| `scan.ts`, `refining.tsx` | a scanned plate's parts, and fix-by-typing |
| `activity.ts`, `health-sync.ts` | movement: reading it, and everything drawn from it |
| `purchases.ts`, `subscription.ts` | money |
| `selected-date.tsx` | the one piece of genuine client state |

## The three rules, still

**1. Screens never compute domain numbers.** A calorie total, a macro split and
a day's budget come from views — `food_log_details`, `daily_nutrition`,
`current_daily_goals` — so the arithmetic is in one place, and it is the same
place the reminder and report jobs will read. What is left in
`src/lib/nutrition.ts` is presentation (a bar's fill, a ring's progress) and one
projection: the budget onboarding previews before there is a row to read.

**2. Every mutation is a hook.** `useLogFood`, `useSetWater`, `useLogWeight`,
`useUpdateProfile` … each owns what it invalidates, so a screen never has to
know what its write affects.

**3. Reads go through hooks, not through a client.** No screen imports
`supabase` directly.

## Decisions worth knowing

**Every view column is nullable.** Postgres cannot promise otherwise through a
join, so the generated types say `T | null` for columns that are never null in
practice. `mappers.ts` coalesces once, at the edge; everything inland is
ordinary. A screen that writes `?? 0` is a sign something skipped a mapper.

**Three unwrap helpers, not one.** PostgREST answers in three shapes — `T[]`
for a select, `T` for `.single()`, `T | null` for `.maybeSingle()` — and one
generic covering all three infers the element type of a list and hands back a
row. That type-checks at the call site and explodes at the first `.map`.

**The budget is the database's.** Nothing here computes `daily_goals`: a
trigger recomputes it when the profile or the newest weigh-in changes, and
stops dead if `is_custom` is set. Onboarding writes a body and a weigh-in; the
budget appears on its own. A screen that finds no row shows an empty state
rather than a ring against a made-up number.

**The catalogue is read-only, and there is exactly one of it.** `foods` has no
per-user rows and `authenticated` holds `select` and nothing else on it, so
nothing in this folder writes a dish. `useFoodSearch` goes through the
`search_foods` RPC and never by owner, and `toFood` takes no user — there is no
"mine" to compute. Rows arrive from an import loader running as `service_role`,
or from the scan edge functions, which are also `service_role`.

**Absent is not zero, for fibre, sugar and sodium.** Those three columns are
null across most of the imported catalogue, and null there means nobody recorded
it. `optionalNumber` in `mappers.ts` is the one place that returns `undefined`
instead of coalescing, and `ExtraNutrients` marks all three optional so a screen
has to handle "unknown" rather than printing "0 g of sugar" on a slice of cake.
There used to be a fallback deriving them from carbohydrate; it is gone.

## The camera and typing paths

`snap.ts` is the whole client half of scanning, and both entry points — a
photograph and a typed sentence — call the same private hook. The difference is
one field in the request body.

**A pending snap is not in the cache.** A photographed plate becomes a row on
the day the moment the shutter fires, but `food_logs.food_id` is not null and
there is no dish yet, so it lives in `pending-snaps.tsx` (context plus MMKV) and
`useDayLog` merges it into the day. That is also what makes a failed snap
survivable: a refetch cannot delete a photo the user is about to fix by hand.

**Upload first, then invoke.** The `scan-meal` function reads the photo out of
the `meal-photos` bucket, so there is nothing to recognise until the object
exists. A typed meal skips the upload and is one round trip shorter.

**The notification is booked before the answer is asked for.** iOS suspends a
backgrounded app within seconds, so code that runs when the scan lands may never
run — but a notification already scheduled still fires. `scheduleScanNotice` is
called at the shutter and cancelled if the app is still awake when the entries
arrive.

**A landed snap is recognised, not waited for.** The client drops its own
pending row when the request resolves, but the day can refetch first (on focus,
or when a notification brings the app forward), and for a second the meal shows
twice. `useDayLog` matches an unclaimed entry by `source` (`camera` vs `text`)
and a timestamp at or after the shutter, and drops the placeholder.

**A correction in flight is the same idea one layer up.** `refining.tsx` holds
the ids of entries whose `scan-refine` call is still running, so `EntryList` can
draw that row as busy after the user has navigated back to Today. In memory
only — an interrupted refine just shows the entry as it was, and the next day
fetch tells the truth either way.

**Ingredients are edited through RPCs, not table writes.** `authenticated` holds
`select` on `food_log_ingredients` and nothing else, so `useUpdateIngredient` and
`useRemoveIngredient` call `set_ingredient_quantity` and `remove_ingredient`.
Neither touches the parent entry: `food_log_details` sums the parts, so the
entry's totals follow from the part row changing and nothing else is written.

## Movement

`health-sync.ts` is the one place in the app that writes `activity_days`,
`activity_sessions` and `activity_hours`, and the only bulk write
`authenticated` makes anywhere. It needs no edge function because there is no
secret and nothing to authenticate against — the data is already on the device.

It reads a **rolling window**, not a cursor: a year-deep backfill on connect,
then the last seven days re-read on every foreground. Health data arrives late
and arrives edited, so "everything since the last sync" misses it permanently.
Every key in the schema exists to make that repetition free. See the header
comment in the file, and `src/lib/health/README.md` for what each store gives us.

`activity.ts` is the read side, and `keys.activityAll` is what a meal write
invalidates — the balance chart and the deficit sentence read what was eaten as
well as what was burned.
