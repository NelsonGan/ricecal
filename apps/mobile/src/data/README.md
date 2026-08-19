# The data layer

Everything the screens read and write goes through this folder. Most of it goes
to Supabase; the catalogue goes straight to the Cloudflare Worker in front of
D1, and photographs go to R2 through an edge function.

## Files

| file | what it holds |
|---|---|
| `types.ts` | the domain. `Entry`, `Food`, `Targets`, and the enums, named off the generated `Database` |
| `mappers.ts` | row shapes to domain shapes, and the only place `?? 0` is allowed |
| `client.ts` | `unwrap` / `unwrapOne` / `unwrapMaybe`, and `dateKey` |
| `keys.ts` | every query key in the app |
| `session.tsx` | who is signed in |
| `auth.ts` | Apple, Google and email sign-in |
| `profile.ts`, `settings.ts`, `goals.ts` | the account |
| `day.ts`, `entries.ts` | logging: one day's reads, and the writes to `food_logs` |
| `catalogue.ts` | the Worker, reached directly with the user's own JWT |
| `foods.ts` | search and dish detail, over `catalogue.ts` |
| `barcodes.ts` | a packet by its code, through the `barcode` function |
| `snapshot.ts` | the numbers an entry carries, built once for every write path |
| `snap.ts`, `pending-snaps.tsx`, `scan.ts`, `refining.tsx` | the scan path: the call, the row that exists before the answer, the parts a plate resolved to, and the entries with a correction in flight |
| `recipes.ts` | home cooking. Two writes are RPCs rather than updates, because publishing may only ever move a recipe to `pending` and saving a copy has to bump a counter on somebody else's row |
| `weight.ts`, `trends.ts` | progress |
| `reviews.ts` | a finished week or month, folded four ways. Read-only, and the one area with no invalidation of its own: a review is of a period that is OVER, so nothing a user does today can move one, and the 30-second stale time covers a meal backdated into last week. `useReviewPeriods` serves three readers — the list, a story's comparison chart, and a story resolving the `week-latest` id a report notification links to |
| `activity.ts`, `health-sync.ts` | movement: the read side, and the phone-to-Postgres sync |
| `photos.ts` | every image — upload, signed read, delete — through the `photos` function, since R2 has no idea who a user is. Bytes are cached against the key and asked for from the disk first, so a signature is only fetched for a picture this device has not seen |
| `purchases.ts`, `subscription.ts` | money. `purchases.ts` buys and restores and can never grant; `subscription.ts` reads the mirror the RevenueCat webhook fills, and `useEntitlement` is the ONE answer to "is this account Pro" that every gate in the app reads. It no longer answers "may this account log a meal": a free account logs, within the ceilings in CLAUDE.md |
| `refusals.ts` | the two ways the server refuses, read back off the wire, and what the user is told about each. A non-2xx from `functions.invoke` hides the body inside the error, so telling "this needs Pro" from "you have used today's scans" is done once here rather than at each of the four call sites — and so is the answer, since a spent free allowance opens the paywall while a spent Pro one must not |
| `selected-date.tsx` | the one piece of genuine client state |

## The three rules

**1. Screens never compute domain numbers.** A calorie total, a macro split and
a day's budget come from views — `food_log_details`, `daily_nutrition`,
`current_daily_goals` — so the arithmetic is in one place, and it is the same
place a reminder or report job will read. What is left in `src/lib/nutrition.ts`
is presentation (a bar's fill, which meal a tap means) and one projection: the
budget onboarding previews before there is a row to read.

**2. Every mutation is a hook.** `useLogFood`, `useAddWater`, `useLogWeight`,
`useUpdateProfile` — each owns what it invalidates, so a screen never has to
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
trigger recomputes it when the profile or the newest weigh-in changes, and stops
dead if `is_custom` is set. Onboarding writes a body and a weigh-in; the budget
appears on its own. A screen that finds no row shows an empty state rather than
a ring against a made-up number.

**An entry carries its own numbers.** `food_logs` holds `item_name`,
`base_kcal` and the rest, because a foreign key cannot cross into D1. Every
write path builds that snapshot through `snapshot.ts` and no other way — a
catalogue dish, a packet, a recipe and a scan tier all land in the same columns.
`food_id` is a nullable, unconstrained note about where the numbers came from,
and null is ordinary.

**A pending snap is not in the cache.** A photographed plate is on the day the
moment the shutter fires, but there is no row until the server answers, so it
lives in `pending-snaps.tsx` and `useDayLog` merges it in. That is also what
makes a failed snap survivable: a refetch cannot delete a photo the user is
about to fix by hand. `refining.tsx` is the same shape for a correction, which
outlives the screen that started it in the same way.

**The catalogue is read-only, and there is exactly one of it.** Nothing here
writes a dish: the app's JWT reaches `/search` and `/food` on the Worker and
nothing else, and asking for anything further gets a 404. `toFood` takes no
user — there is no "mine" to compute. Rows arrive from the loader in
`apps/supabase/scripts`, which holds the shared secret.

**Unreachable is not empty.** `catalogue.ts` throws for anything that is not a
clean answer, so react-query reaches its error state and the search panel says
so. Returning `[]` for a Worker that is down tells somebody their dish does not
exist.

## Still approximate

- **Fibre and sugar** fall back to a proportion of carbohydrate where the
  catalogue rows are null.
