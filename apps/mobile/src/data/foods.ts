import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe } from './client'
import { keys } from './keys'
import { type FoodStats, toFood } from './mappers'
import { useUserId } from './session'
import type { Food, FoodDetailsRow } from './types'

/**
 * The catalogue.
 *
 * One kind of row: shared, read-only, the same for every user. Users cannot
 * create dishes, so nothing here filters by owner and nothing writes — the
 * client holds `select` on `foods` and nothing else.
 */

const FOOD_COLUMNS = '*'

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

      const rows = unwrap(
        await supabase.rpc('search_foods', {
          q: needle,
          match_limit: 50,
        }),
      ) as FoodDetailsRow[]

      const stats = await statsFor(
        userId,
        rows.flatMap((row) => (row.id ? [row.id] : [])),
      )

      return rows.map((row) => toFood(row, row.id ? stats.get(row.id) : undefined))
    },
  })
}

export function useFood(id: string | undefined) {
  return useQuery({
    queryKey: keys.food(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Food | null> => {
      const row = unwrapMaybe(
        await supabase
          .from('food_details')
          .select(FOOD_COLUMNS)
          .eq('id', id as string)
          .maybeSingle(),
      ) as FoodDetailsRow | null
      return row ? toFood(row) : null
    },
  })
}

/**
 * The last few dishes this user logged at this meal, newest first.
 *
 * Recency rather than frequency, which is what `useUsualFoods` did: "what I had
 * for breakfast lately" is a much better guess at what is on the plate now than
 * "what I have had for breakfast most often since I installed this", and it
 * responds the same week rather than after a dozen repeats.
 *
 * Deduplicated here rather than in SQL. `distinct on (food_id)` needs the ordering
 * to lead with `food_id`, so getting the three most RECENT distinct dishes out of
 * Postgres means a subquery or a window — against a window of rows this small it
 * is cheaper to read the last thirty entries and walk them.
 */
export function useRecentFoods(limit = 3) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.recentFoods(userId, limit),
    queryFn: async (): Promise<Food[]> => {
      const rows = unwrap(
        await supabase
          .from('food_log_details')
          .select('food_id, logged_at')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false })
          // Enough history to find `limit` different dishes through a run of
          // repeats, and few enough to stay one index scan.
          .limit(30),
      )

      const ids: string[] = []
      for (const row of rows) {
        if (row.food_id && !ids.includes(row.food_id)) ids.push(row.food_id)
        if (ids.length === limit) break
      }
      if (ids.length === 0) return []

      const foods = unwrap(
        await supabase.from('food_details').select(FOOD_COLUMNS).in('id', ids),
      ) as FoodDetailsRow[]

      const byId = new Map(foods.map((row) => [row.id, row]))
      // Ordered by when they were last eaten, not by whatever order the ids came
      // back in.
      return ids.flatMap((id) => {
        const row = byId.get(id)
        return row ? [toFood(row)] : []
      })
    },
  })
}

// Two hooks used to live here and neither has a screen any more.
//
// `useTopFoods` read `user_food_stats` by frequency for the nutrition screen's
// "top foods", and `useUsualFoods` was its per-meal twin for the quick selector.
// The selector asks for the last few dishes instead — see `useRecentFoods` — and
// the nutrition screen is gone. `user_food_stats` is still there, and a future
// screen that wants "what I eat most" can have this back out of the history
// rather than inheriting a hook nothing calls.
