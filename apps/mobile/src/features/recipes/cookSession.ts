import { useSyncExternalStore } from 'react'

/**
 * One session at the stove, per recipe, for as long as the app is open: which
 * ingredients are already in the pot, and which step cook mode is on. In memory
 * and shared, so a tick on the recipe page is still there in cook mode, and
 * closing cook mode to check something does not send the cook back to step 1.
 * Never persisted: a list that remembered yesterday's would open with half of
 * it struck through.
 */
const ticks = new Map<string, ReadonlySet<string>>()
const steps = new Map<string, number>()
const listeners = new Set<() => void>()
const NONE: ReadonlySet<string> = new Set()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function changed() {
  for (const listener of listeners) listener()
}

export function useTickedIngredients(recipeId: string) {
  const ticked = useSyncExternalStore(subscribe, () =>
    recipeId ? (ticks.get(recipeId) ?? NONE) : NONE,
  )
  const toggle = (ingredientId: string) => {
    if (!recipeId) return
    const next = new Set(ticks.get(recipeId) ?? NONE)
    if (next.has(ingredientId)) next.delete(ingredientId)
    else next.add(ingredientId)
    ticks.set(recipeId, next)
    changed()
  }
  return [ticked, toggle] as const
}

/**
 * The meal is done: the next visit starts at step 1 with nothing ticked. Without
 * this an app left in memory opened a recipe days later already struck through.
 */
export function forgetCookSession(recipeId: string) {
  if (!recipeId) return
  ticks.delete(recipeId)
  steps.delete(recipeId)
  changed()
}

/** The step cook mode is on, zero-based. Reset to the start once the meal is done. */
export function useCookStep(recipeId: string) {
  const step = useSyncExternalStore(subscribe, () => (recipeId ? (steps.get(recipeId) ?? 0) : 0))
  const setStep = (next: number) => {
    if (!recipeId) return
    steps.set(recipeId, Math.max(0, next))
    changed()
  }
  return [step, setStep] as const
}
