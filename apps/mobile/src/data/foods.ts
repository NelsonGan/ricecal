import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe } from './client'
import { keys } from './keys'
import { type FoodStats, toFood } from './mappers'
import { useUserId } from './session'
import type { Food, FoodDetailsRow, Meal } from './types'

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
      .select('food_id, times_logged, meals')
      .eq('user_id', userId)
      .in('food_id', foodIds),
  )

  return new Map(
    rows.flatMap((row) =>
      row.food_id
        ? [
            [
              row.food_id,
              { timesLogged: row.times_logged ?? 0, meals: (row.meals ?? []) as Meal[] },
            ] as const,
          ]
        : [],
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
 * What this user usually eats at this time of day.
 *
 * Ordered by how often they have logged it, which is a fact about them and not
 * about the dish — the reason `times_logged` is a view over their own entries
 * rather than a column on the shared catalogue.
 */
export function useUsualFoods(meal: Meal, limit = 3) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.usualFoods(userId, meal),
    queryFn: async (): Promise<Food[]> => {
      const stats = unwrap(
        await supabase
          .from('user_food_stats')
          .select('food_id, times_logged, meals')
          .eq('user_id', userId)
          .contains('meals', [meal])
          .order('times_logged', { ascending: false })
          .limit(limit),
      )

      const ids = stats.flatMap((row) => (row.food_id ? [row.food_id] : []))
      if (ids.length === 0) return []

      const rows = unwrap(
        await supabase.from('food_details').select(FOOD_COLUMNS).in('id', ids),
      ) as FoodDetailsRow[]

      const byId = new Map(rows.map((row) => [row.id, row]))
      // Ordered by the stats query, not by whatever order the ids came back in.
      return stats.flatMap((stat) => {
        const row = stat.food_id ? byId.get(stat.food_id) : undefined
        if (!row) return []
        return [
          toFood(row, {
            timesLogged: stat.times_logged ?? 0,
            meals: (stat.meals ?? []) as Meal[],
          }),
        ]
      })
    },
  })
}

/**
 * The dishes this user logs most, all meals.
 *
 * Same view as `useUsualFoods` without the meal filter — "what I eat" rather
 * than "what I eat at this hour".
 */
export function useTopFoods(limit = 4) {
  const userId = useUserId()

  return useQuery({
    queryKey: ['top-foods', userId, limit],
    queryFn: async (): Promise<Array<{ food: Food; timesLogged: number }>> => {
      const stats = unwrap(
        await supabase
          .from('user_food_stats')
          .select('food_id, times_logged, meals')
          .eq('user_id', userId)
          .order('times_logged', { ascending: false })
          .limit(limit),
      )

      const ids = stats.flatMap((row) => (row.food_id ? [row.food_id] : []))
      if (ids.length === 0) return []

      const rows = unwrap(
        await supabase.from('food_details').select(FOOD_COLUMNS).in('id', ids),
      ) as FoodDetailsRow[]
      const byId = new Map(rows.map((row) => [row.id, row]))

      return stats.flatMap((stat) => {
        const row = stat.food_id ? byId.get(stat.food_id) : undefined
        if (!row) return []
        return [{ food: toFood(row), timesLogged: stat.times_logged ?? 0 }]
      })
    },
  })
}
