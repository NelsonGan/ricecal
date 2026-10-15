import type { ExercisePlan } from './model'

/**
 * How the exercise library hands its choice back to the screen that opened it.
 *
 * Three screens open the library to pick (the logger adding, the logger
 * replacing one, the routine editor) and each wants the result in a different
 * place: the live workout in storage, a single exercise swapped in place, a
 * routine held in a screen's own state. A route param cannot carry a callback,
 * so the opener leaves one here before pushing and the library calls it once.
 *
 * One slot rather than a stack, because only one library is ever open.
 */

type Handler = { single: boolean; deliver: (plans: ExercisePlan[]) => void }

let current: Handler | null = null

export function awaitPick(handler: Handler): void {
  current = handler
}

/** The opener's preference, for the library to draw single or multiple choice. */
export function pickIsSingle(): boolean {
  return current?.single ?? false
}

export function hasPick(): boolean {
  return current !== null
}

/** Hands the choice over and forgets the opener. */
export function deliverPick(plans: ExercisePlan[]): void {
  const handler = current
  current = null
  if (handler && plans.length) handler.deliver(handler.single ? plans.slice(0, 1) : plans)
}

export function cancelPick(): void {
  current = null
}
