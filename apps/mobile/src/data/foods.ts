import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { lookupPacket } from './barcodes'
import { catalogueGet } from './catalogue'
import { unwrap } from './client'
import { keys } from './keys'
import { type FoodStats, toEntry, toFood } from './mappers'
import { useUserId } from './session'
import { packetCode } from './snapshot'
import type { Entry, Food, FoodDetailsRow, FoodLogRow } from './types'

/**
 * The catalogue, which is no longer in this database.
 *
 * The row shape is unchanged on purpose. `toFood` still reads what
 * `food_details` used to return, because a move of where the data lives should
 * not become a rewrite of what it looks like — and it has now survived two
 * moves on that basis.
 */

/**
 * How often this user has logged each of the given dishes.
 *
 * Fetched alongside a result set rather than joined into it: `user_food_stats`
 * is per-user and `food_details` is shared, so joining them in the database
 * would mean a view that cannot be cached across users.
 */
async function statsFor(userId: string, foodIds: string[]): Promise<Map<string, FoodStats>> {
  if (foodIds.length === 0) return new Map()

  const rows = unwrap(
    await supabase
      .from('user_food_stats')
      .select('food_id, times_logged')
      .eq('user_id', userId)
      .in('food_id', foodIds),
  )

  return new Map(
    rows.flatMap((row) =>
      row.food_id ? [[row.food_id, { timesLogged: row.times_logged ?? 0 }] as const] : [],
    ),
  )
}

/**
 * Search, by name.
 *
 * A ranked search rather than a substring match, because the catalogue is
 * 48,000 searchable rows and `ilike '%kopi%'` matches "Kopi O" and "Non-Dairy
 * Coffee Whitener" equally well. The Worker fuses four arms — exact name, exact
 * alias, full text, trigram — which is also what makes "char kway teow" and
 * "teh tarek" find anything at all. See `apps/cloudflare/workers/catalogue/src/index.ts`.
 *
 * An empty query returns nothing rather than the first fifty rows of the
 * catalogue, and it returns it WITHOUT asking: fifty arbitrary dishes out of
 * 48,000 is not a browse, and the field is focused on mount, so the panel
 * renders one keystroke before there is anything to ask about.
 */
export function useFoodSearch(query: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.foodSearch(userId, query),
    queryFn: async (): Promise<Food[]> => {
      const needle = query.trim()
      if (!needle) return []

      const { foods: rows } = await catalogueGet<{ foods: FoodDetailsRow[] }>('/search', {
        q: needle,
        limit: 50,
      })

      const stats = await statsFor(
        userId,
        rows.flatMap((row) => (row.id ? [row.id] : [])),
      )

      return rows.map((row) => toFood(row, row.id ? stats.get(row.id) : undefined))
    },
  })
}

/**
 * One food, whichever kind of thing it turns out to be.
 *
 * A dish is a catalogue row and comes straight from the Worker. A
 * SCANNED PACKET is not: it lives in D1's barcode-keyed table, it has no
 * `foods.id`, and the endpoint that knows how to find it is the scanner's —
 * which also falls back to Open Food Facts live and remembers what it gets.
 *
 * Both land here so the food detail screen stays one screen. It is handed an
 * id, it shows what comes back, and whether that meant a probe on an index or a
 * round trip to another continent is not its business.
 */
export function useFood(id: string | undefined) {
  const code = packetCode(id)

  return useQuery({
    queryKey: keys.food(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Food | null> => {
      if (code) return lookupPacket(code)

      const { food } = await catalogueGet<{ food: FoodDetailsRow | null }>('/food', {
        id: id ?? '',
      })
      return food ? toFood(food) : null
    },
    // One retry on the packet path, where the app's default is two.
    //
    // Somebody is standing in a shop holding the box up to the camera, and this
    // lookup already allows six seconds for Open Food Facts before it gives up
    // — so a second and third attempt with backoff behind it is most of a
    // minute of a screen doing nothing. Failing sooner is kinder here, because
    // what it fails to has a Scan again button on it.
    //
    // Spread rather than a ternary with a number in the other arm: writing
    // `retry: code ? 1 : 2` restates the default, and restating a default is
    // how it silently stops following the one in `lib/query.ts`.
    ...(code ? { retry: 1 } : {}),
  })
}

/**
 * How far back "recently eaten" reads, and how much of it is kept.
 *
 * The fetch is a window over the rows rather than a window over the calendar: a
 * diary with three meals a day has about two months in it at this size, and one
 * with twenty has a fortnight, which is the right shape either way — somebody
 * who logs more has more recent food to choose from.
 *
 * `KEPT` is what survives folding the window down to one row per dish. It is
 * smaller than the fetch on purpose: the fold is what makes this list useful,
 * and a list long enough to scroll past what you recognise is a search field
 * with extra steps.
 */
const HISTORY_ROWS = 200
const KEPT = 60

/**
 * One dish, however many times it has been eaten.
 *
 * Name, portion and per-serving calories together: "Nasi lemak" at a hawker
 * portion and "Nasi lemak" off a packet are two different foods that share a
 * word, and folding them would offer one of them under the other's calories.
 * Lowercased because the same dish reaches the diary from a search result, a
 * scan and a typed sentence, each with its own idea of capitals.
 */
const dishKey = (entry: Entry) =>
  `${entry.foodName.trim().toLowerCase()}|${entry.base.kcal}|${entry.servingLabel}`

/**
 * The diary, folded to one row per dish, newest first.
 *
 * Exported for its own test. The rule is short and every part of it has a way of
 * being wrong that shows up as a list rather than as an error: fold too hard and
 * a packaged drink hides the hawker one it shares a name with, fold too little
 * and this is the diary again.
 *
 * The input is assumed to arrive newest first, which is how the query orders it,
 * so the first of each key is the one kept.
 */
export function foldToDishes(entries: readonly Entry[], keep: number): Entry[] {
  const seen = new Set<string>()
  const recent: Entry[] = []
  for (const entry of entries) {
    // A row the scan wrote with no name yet, or one whose dish came back blank.
    // There is nothing to offer and nothing to fold it against.
    if (!entry.foodName.trim()) continue
    const key = dishKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    recent.push(entry)
    if (recent.length >= keep) break
  }
  return recent
}

/**
 * WHAT THIS ACCOUNT HAS EATEN BEFORE, newest first.
 *
 * The second half of the log sheet's search, beside the catalogue. What it is
 * for is the meal somebody has already had a dozen times: the catalogue can
 * find "nasi lemak", but not the nasi lemak this person eats, at the portion
 * they eat it in, with the photograph they took of it.
 *
 * FOLDED TO ONE ROW PER DISH, keeping the most recent of each. Unfolded it is
 * the diary again, and a diary is what the user was looking at before they
 * opened this — three weeks of the same breakfast, in order, is not a list of
 * foods. Which one survives matters: the newest carries the portion and the
 * picture the user last accepted, and the older ones are earlier drafts of the
 * same answer.
 *
 * A pending snap is not in here. This reads `food_log_details`, so a row exists
 * only once the cascade has named a dish, which is exactly the point at which
 * it is worth offering again.
 */
export function useRecentFoods() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.recentFoods(userId),
    queryFn: async (): Promise<Entry[]> => {
      const rows = unwrap(
        await supabase
          .from('food_log_details')
          .select('*')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false })
          .limit(HISTORY_ROWS),
      ) as FoodLogRow[]

      return foldToDishes(rows.map(toEntry), KEPT)
    },
  })
}

// Three hooks used to live here and two of them still have no screen.
//
// `useTopFoods` read `user_food_stats` by frequency for the nutrition screen's
// "top foods", and `useUsualFoods` was its per-meal twin for the quick
// selector. The third was `useRecentFoods`, the recency answer that replaced
// both — the LAST LOGGED block under the quick selector's five buttons — and it
// is above, in a shape that owes nothing to that block: a tab of its own beside
// the catalogue, folded per dish, carrying the photograph.
//
// `user_food_stats` is still there, so a future screen that wants "what I eat
// most" can have that back out of git.
