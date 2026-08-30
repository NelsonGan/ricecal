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
 * The catalogue, which is no longer in this database. The row shape is unchanged
 * on purpose: `toFood` still reads what `food_details` used to return, and that
 * has survived two moves.
 */

/**
 * How often this user has logged each of the given dishes. Fetched alongside a
 * result set rather than joined into it: `user_food_stats` is per-user and
 * `food_details` is shared, so a join would be a view nothing can cache.
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
 * Search, by name. Ranked rather than a substring match, because `ilike '%kopi%'`
 * matches "Kopi O" and "Non-Dairy Coffee Whitener" equally well over 48,000 rows.
 * The Worker fuses exact name, exact alias, full text and trigram, which is what
 * makes "char kway teow" find anything at all.
 *
 * An empty query returns nothing without asking: fifty arbitrary dishes is not a
 * browse, and the field is focused on mount.
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
 * One food, whichever kind it turns out to be. A dish is a catalogue row from the
 * Worker; a scanned packet lives in D1's barcode-keyed table, has no `foods.id`,
 * and is found by the scanner's endpoint, which also falls back to Open Food
 * Facts and remembers what it gets.
 *
 * Both land here so the food detail screen stays one screen.
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
    // One retry on the packet path, where the app's default is two. Somebody is
    // standing in a shop holding the box up, and this lookup already allows six
    // seconds for Open Food Facts, so a second and third attempt with backoff is
    // most of a minute of a screen doing nothing.
    //
    // Spread rather than a ternary with the default in the other arm, which is
    // how a restated default stops following `lib/query.ts`.
    ...(code ? { retry: 1 } : {}),
  })
}

/**
 * How far back "recently eaten" reads, and how much of it is kept. A window over
 * the rows rather than the calendar, so a diary with three meals a day holds
 * about two months and one with twenty holds a fortnight.
 *
 * `KEPT` is what survives folding down to one row per dish, and is smaller than
 * the fetch on purpose: a list long enough to scroll past what you recognise is a
 * search field with extra steps.
 */
const HISTORY_ROWS = 200
const KEPT = 60

/**
 * One dish, however many times it has been eaten. Name, portion and per-serving
 * calories together, because "Nasi lemak" at a hawker portion and off a packet
 * are two foods sharing a word. Lowercased, since the same dish reaches the diary
 * from a search result, a scan and a typed sentence.
 */
const dishKey = (entry: Entry) =>
  `${entry.foodName.trim().toLowerCase()}|${entry.base.kcal}|${entry.servingLabel}`

/**
 * The diary, folded to one row per dish, newest first. Exported for its own test:
 * fold too hard and a packaged drink hides the hawker one it shares a name with,
 * fold too little and this is the diary again.
 *
 * The input arrives newest first, which is how the query orders it, so the first
 * of each key is the one kept.
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
 * What this account has eaten before, newest first: the second half of the log
 * sheet's search. The catalogue can find "nasi lemak" but not the nasi lemak this
 * person eats, at their portion, with their photograph of it.
 *
 * Folded to one row per dish, keeping the most recent of each. Unfolded it is the
 * diary again, and the newest carries the portion and the picture the user last
 * accepted.
 *
 * A pending snap is not in here: this reads `food_log_details`, so a row exists
 * only once the cascade has named a dish.
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

// `useTopFoods` and `useUsualFoods` read `user_food_stats` by frequency for the
// nutrition screen and the quick selector, and both are gone. `useRecentFoods`
// replaced them and is above, in a shape that owes nothing to that block.
//
// `user_food_stats` is still there, so a screen wanting "what I eat most" can
// have those back out of git.
