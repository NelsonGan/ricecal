# The data layer

Everything the screens read and write goes through this folder, and everything
here goes through Supabase. It replaced `src/mock`, and it kept that folder's
three rules — the point of them was always that this swap would be cheap.

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
| `day.ts`, `entries.ts`, `foods.ts` | logging |
| `weight.ts` | progress |
| `snap.ts`, `pending-snaps.tsx` | the camera path |
| `photos.ts` | every image — upload, signed read, delete — through the `photos` edge function, since R2 has no idea who a user is. The signature is fetched per hour; the bytes are cached against the key |
| `purchases.ts`, `subscription.ts` | money |
| `selected-date.tsx` | the one piece of genuine client state |

## The three rules, still

**1. Screens never compute domain numbers.** A calorie total, a macro split and
a day's budget come from views — `food_log_details`, `daily_nutrition`,
`current_daily_goals` — so the arithmetic is in one place, and it is the same
place the reminder and report jobs will read. What is left in
`src/lib/nutrition.ts` is presentation (a bar's fill, which meal a tap means)
and one projection: the budget onboarding previews before there is a row to
read.

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

**A pending snap is not in the cache.** A photographed plate becomes a row the
moment the shutter fires, but `food_logs.food_id` is not null and there is no
dish yet, so it lives in `pending-snaps.tsx` and `useDayLog` merges it in. That
is also what makes a failed snap survivable: a refetch cannot delete a photo
the user is about to fix by hand.

**The catalogue is read-only, and there is exactly one of it.** `foods` has no
per-user rows and `authenticated` holds `select` and nothing else on it, so
nothing in this folder writes a dish. `useFoodSearch` ranks by name through the `search_foods` RPC
and never by owner, and `toFood` takes no user — there is no "mine" to compute.
Rows arrive from an import loader running as `service_role`.

## What is knowingly still fake

- **Recognition.** `recogniseDish` in `src/features/logging/recognise.ts`
  waits, then picks a catalogue dish by slug. Everything around it is built for
  a slow, failable call — the row is written first, it is worth zero calories
  until it settles, and it resolves or fails in place.
- **The 96% match badge** on the top search hit is a placeholder for a real
  score, and search is `ilike` rather than the trigram index the schema builds:
  reaching `similarity()` from PostgREST needs an RPC.
- **The miss.** `recogniseDish` always resolves to a dish. A real one has to be
  able to say "nothing in the catalogue looks like this", and with no per-user
  rows there is nowhere for such a plate to land — that case needs a wider
  catalogue or a "pick it yourself" path, not a private food.
- **Fibre and sugar** fall back to a proportion of carbohydrate where the
  catalogue rows are still null.
