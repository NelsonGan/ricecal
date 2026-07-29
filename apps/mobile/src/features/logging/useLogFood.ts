import { useCallback } from 'react'

import { entryMacros, type Food, type Meal, useDispatch } from '@/mock'

export type LogOptions = {
  food: Food
  meal: Meal
  quantity?: number
  servingId?: string
  note?: string
}

/**
 * Adds a food to the selected day.
 *
 * Every path that logs something goes through here — the quick selector, the
 * camera result, search, the food detail — so the calorie figure in the undo
 * toast is computed the same way as the one on the row, from the entry rather
 * than from whatever the caller happened to be displaying.
 */
export function useLogFood() {
  const dispatch = useDispatch()

  return useCallback(
    ({ food, meal, quantity = 1, servingId, note }: LogOptions) => {
      const entry = {
        foodId: food.id,
        meal,
        quantity,
        servingId: servingId ?? food.servings[0].id,
        loggedAt: new Date().toISOString(),
        note,
      }
      dispatch({ type: 'addEntry', entry, kcal: entryMacros({ ...entry, id: 'pending' }).kcal })
    },
    [dispatch],
  )
}
