# The mock data layer

Everything the screens read and write goes through this folder. There is no
`fetch`, no Supabase client and no `react-query` call anywhere inside it, and no
screen imports a fixture directly. That is the whole point: when the backend
exists, this folder is what changes.

## Files

| file | what it holds |
|---|---|
| `types.ts` | the domain. `Food`, `Entry`, `DayLog`, `Profile`, `Targets`, … |
| `foods.ts` | the food catalogue, with `getFood` / `findFood` / `getServing` |
| `fixtures.ts` | seed data, dated relative to the day the app starts |
| `derive.ts` | pure functions: budgets, totals, BMI, goal dates |
| `store.tsx` | one `useReducer` behind a context, plus the read hooks |
| `index.ts` | the barrel every screen imports from |

## The three rules that make the swap cheap

**1. Screens never compute domain numbers.** A calorie total, a macro split, a
goal date and a day's remaining budget all come from `derive.ts`. When those
move to Postgres — as a view, a generated column or an RPC — the call sites do
not change, only what is behind them.

**2. Every mutation is an action.** A screen never edits state; it dispatches
`addEntry`, `updateEntry`, `removeEntry`, `setWater`, `logWeight`,
`updateProfile`, `updateTargets`, `setReminders`, `setConnections`,
`setPrivacy`, `setSubscription`. That list is the write API, and it is already
shaped like a set of mutations. Each one becomes a `useMutation` with the same
name and the same argument.

**3. Reads go through hooks, not through the state object.** `useSelectedDay`,
`useDay`, `useDayBurn` and `useAppState(selector)` are the only ways in. Each
becomes a `useQuery` with the same signature and the same return type.

## What the swap actually looks like

```
useSelectedDay()            →  useQuery(['day', date], () => api.getDay(date))
dispatch({type:'addEntry'}) →  useMutation(api.createEntry, { onMutate: … })
FOODS / getFood(id)         →  useQuery(['food', id]) over the foods table
computeTargets(profile)     →  unchanged, or a Postgres function
```

Three things are deliberately already true so that swap does not need a
redesign:

- **Ids are strings, generated on write.** `newEntryId()` hands out
  `entry-1`, `entry-2`; a server hands out uuids. Nothing parses an id or
  assumes it is ordered.
- **Days are keyed by `yyyy-MM-dd`, not by index.** That is the same key a
  `log_days` table would use, and the same one a date-range query would filter
  on.
- **`Entry` stores `foodId` and `servingId`, never a copy of the macros.** A
  correction to the catalogue reaches every entry that used it, and an entry row
  is a foreign key plus a quantity, which is what it will be in the database.

## What is knowingly fake

- `useDayBurn` credits today's workouts only. Real sessions arrive per-day from
  HealthKit / Health Connect.
- `search` filters an in-memory array with `includes`. Real search is a
  trigram index, and the 96% match badge is a placeholder for a real score.
- The camera and voice flows wait, then log a fixed dish. Neither calls a
  recognition service.
- Fibre and sugar on the nutrition screen are derived from carbohydrate, because
  the catalogue does not carry them per food yet.

Each of those is a single function, and each is commented at the site.
