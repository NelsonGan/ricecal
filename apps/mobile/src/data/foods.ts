import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { lookupPacket } from './barcodes'
import { unwrap } from './client'
import { keys } from './keys'
import { type FoodStats, toFood } from './mappers'
import { useUserId } from './session'
import { packetCode } from './snapshot'
import type { Food, FoodDetailsRow } from './types'

/**
 * The catalogue, which is no longer in this database.
 *
 * `foods` and its portions used to be tables in the same Postgres the session
 * authenticates against, so a search was an RPC and a dish was a select. They
 * are in Cloudflare D1 now — 3.2 million packaged products keyed by barcode and
 * ~47,000 searchable dishes — behind a Worker holding a shared secret.
 *
 * A secret in a phone is not a secret, so the client does not talk to that
 * Worker. It invokes the `catalogue` edge function, which authenticates the
 * user the way every other function does and asks on their behalf. One extra
 * hop, and it buys a catalogue ten times the size that no longer shares a disk
 * quota with anybody's diary.
 *
 * The row shape is unchanged on purpose. `toFood` still reads what
 * `food_details` used to return, because a move of where the data lives should
 * not become a rewrite of what it looks like.
 */

/** One call to the catalogue function, unwrapped the way `unwrap` does it. */
async function catalogue<T>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean } & T>('catalogue', {
    body,
  })
  if (error) throw error
  if (!data?.ok) return null
  return data as T
}

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
 * The `search_foods` RPC rather than `ilike`, because the catalogue is ~460,000
 * rows and substring matching cannot rank. `ilike '%kopi%'` matches "Kopi O" and
 * "Non-Dairy Coffee Whitener" equally well, so the fifty rows PostgREST returns
 * first are the fifty the user sees. The RPC fuses an exact, a full-text and a
 * trigram arm, which is also what makes "char kway teow" and "teh tarek" find
 * anything at all — see apps/supabase/schemas/91_food_search.sql.
 *
 * An empty query returns nothing rather than the first fifty rows of the
 * catalogue. Fifty arbitrary dishes out of half a million is not a browse, and
 * the field is focused on mount, so the user is typing anyway.
 *
 * No place filter. The screen used to offer All / Mamak / Kopitiam / Packaged
 * chips, but `place` describes where a dish is *typically* eaten, not what the
 * user is looking for — filtering a ranked result set by it mostly hid the
 * right answer. The RPC still accepts `p_place`; nothing passes it.
 */
export function useFoodSearch(query: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.foodSearch(userId, query),
    queryFn: async (): Promise<Food[]> => {
      const needle = query.trim()
      if (!needle) return []

      const result = await catalogue<{ foods: FoodDetailsRow[] }>({
        action: 'search',
        q: needle,
        limit: 50,
      })
      const rows = result?.foods ?? []

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
 * A dish is a catalogue row and comes back from the `catalogue` function. A
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

      const result = await catalogue<{ food: FoodDetailsRow | null }>({
        action: 'food',
        id,
      })
      return result?.food ? toFood(result.food) : null
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
// That block is gone. It sat between the way in and the day behind the sheet,
// it was a guess at what somebody was about to log made from what they logged
// before, and the five buttons above it already say what to do next. What it
// cost was a second query on every open of the sheet and, on a slow connection,
// one round trip per dish in it.
//
// `user_food_stats` and the history are both still there, so a future screen
// that wants "what I eat most" can have this back out of git rather than
// inheriting a hook nothing calls.
