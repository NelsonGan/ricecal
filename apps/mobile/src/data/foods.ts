import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { type FoodStats, toFood } from './mappers'
import { useUserId } from './session'
import type { Food, FoodDetailsRow, IconRef, Macros, Meal, Place } from './types'

/**
 * The catalogue.
 *
 * `foods` holds two kinds of row on purpose — `owner_id is null` is what
 * everybody sees, `owner_id = me` is a dish I made up — and the RLS policy is
 * what keeps them apart. Nothing here filters by owner except the screens that
 * deliberately want only mine: a search that had to union two tables would be
 * two queries and a client-side merge for something one policy already does.
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

export type SearchFilter = 'all' | 'mine' | Place

/**
 * Search, by name.
 *
 * `ilike` rather than the trigram index the schema builds, because the index
 * answers `similarity()` and that needs an RPC to reach from PostgREST. This
 * is the honest v1: substring matching over a 28-dish catalogue is instant,
 * and the 96% badge beside the top hit is still a placeholder for a real score.
 */
export function useFoodSearch(query: string, filter: SearchFilter) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.foodSearch(userId, query, filter),
    queryFn: async (): Promise<Food[]> => {
      let request = supabase.from('food_details').select(FOOD_COLUMNS).limit(50)

      const needle = query.trim()
      if (needle) request = request.ilike('name', `%${needle}%`)
      if (filter === 'mine') request = request.eq('owner_id', userId)
      else if (filter !== 'all') request = request.eq('place', filter)

      const rows = unwrap(await request) as FoodDetailsRow[]
      const stats = await statsFor(
        userId,
        rows.flatMap((row) => (row.id ? [row.id] : [])),
      )

      return (
        rows
          .map((row) => toFood(row, userId, row.id ? stats.get(row.id) : undefined))
          // The user's own dishes first: they went to the trouble of creating
          // them, and they are what the shared catalogue is missing.
          .sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)))
      )
    },
  })
}

export function useFood(id: string | undefined) {
  const userId = useUserId()

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
      return row ? toFood(row, userId) : null
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
          toFood(row, userId, {
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
        return [{ food: toFood(row, userId), timesLogged: stat.times_logged ?? 0 }]
      })
    },
  })
}

export type FoodDraft = {
  name: string
  place: Place
  /** What one of them is called: "1 bowl". Becomes the default serving. */
  servingLabel: string
  macros: Macros
  icon: IconRef
  /** A photo of the dish, when the user supplied one instead of an icon. */
  imagePath?: string
}

/**
 * Creates a dish this user made up.
 *
 * Two inserts, and they have to be in this order: the food, then its portions.
 * `food_logs` carries a composite foreign key `(food_id, serving_id)`, so a
 * serving is only ever meaningful as part of its own dish.
 *
 * The three portions are the same set a custom dish always gets — what the
 * user named, plus half and double. The named one is `is_default` and factor
 * 1, which is what "the macros are per base serving" means.
 */
export function useCreateFood() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (draft: FoodDraft): Promise<Food> => {
      const food = unwrapOne(
        await supabase
          .from('foods')
          .insert({
            owner_id: userId,
            name: draft.name.trim(),
            icon_set: draft.icon.set,
            icon_name: draft.icon.name,
            image_path: draft.imagePath,
            place: draft.place,
            kcal: Math.round(draft.macros.kcal),
            carbs_g: draft.macros.carbs,
            protein_g: draft.macros.protein,
            fat_g: draft.macros.fat,
          })
          .select('id')
          .single(),
      )

      const label = draft.servingLabel.trim() || '1 serving'
      // Slugs are stable within a dish, which is what lets an entry written
      // against one survive the label being renamed.
      unwrap(
        await supabase
          .from('food_servings')
          .insert([
            { food_id: food.id, slug: 'base', label, factor: 1, is_default: true, position: 0 },
            {
              food_id: food.id,
              slug: 'half',
              label: 'Half',
              factor: 0.5,
              is_default: false,
              position: 1,
            },
            {
              food_id: food.id,
              slug: 'double',
              label: 'Double',
              factor: 2,
              is_default: false,
              position: 2,
            },
          ])
          .select('id'),
      )

      const row = unwrapOne(
        await supabase.from('food_details').select(FOOD_COLUMNS).eq('id', food.id).single(),
      ) as FoodDetailsRow

      return toFood(row, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-search'] })
      queryClient.invalidateQueries({ queryKey: keys.myFoods(userId) })
    },
  })
}
