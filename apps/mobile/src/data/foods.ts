import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { lookupPacket } from './barcodes'
import { catalogueGet } from './catalogue'
import { unwrap } from './client'
import { keys } from './keys'
import { type FoodStats, toFood } from './mappers'
import { useUserId } from './session'
import { packetCode } from './snapshot'
import type { Food, FoodDetailsRow } from './types'

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

// Three hooks used to live here and none of them has a screen any more.
//
// `useTopFoods` read `user_food_stats` by frequency for the nutrition screen's
// "top foods", `useUsualFoods` was its per-meal twin for the quick selector,
// and `useRecentFoods` was the recency answer that replaced them — the LAST
// LOGGED block under the quick selector's five buttons.
//
// `user_food_stats` and the history are both still there, so a future screen
// that wants "what I eat most" can have this back out of git rather than
// inheriting a hook nothing calls.
