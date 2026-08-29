/**
 * Water, in millilitres.
 *
 * Glasses were the old unit and could not be added up: a mug is 350 ml, a
 * bottle 500, a kopitiam tumbler 200, and each of them was one tap.
 *
 * The database owns every figure here. `daily_goals.water_ml` defaults to
 * 2,000 and checks 250..8,000; these are the copies the controls are drawn
 * from, so the two have to change together.
 */

/** The goal an account has before anybody sets one. `daily_goals`' own default. */
export const DEFAULT_WATER_ML = 2000

/**
 * Narrower than the column's check on purpose. A check constraint refuses
 * nonsense; a stepper suggests every figure it can reach.
 */
export const WATER_GOAL_MIN_ML = 500
export const WATER_GOAL_MAX_ML = 6000

/** Small enough to land on 1,750 or 2,250, big enough to cross the range in 22 taps. */
export const WATER_GOAL_STEP_ML = 250

/** The three vessels people actually drink from. Anything else is the custom amount. */
export const WATER_PRESETS = [
  { id: 'glass', ml: 250, icon: 'water-glass' },
  { id: 'mug', ml: 350, icon: 'tea-cup' },
  { id: 'bottle', ml: 500, icon: 'water-bottle' },
] as const

export type WaterPreset = (typeof WATER_PRESETS)[number]

/**
 * The largest a day can hold, and a copy of what `add_water` clamps to. The
 * optimistic update in `useAddWater` has to clamp exactly where the server
 * does, or the figure under the finger and the one that comes back disagree.
 */
export const WATER_MAX_ML = 20000

/**
 * How full the tank is, bounded at one. Drinking past the goal is not an error,
 * but the picture has nowhere to put the extra, and rescaling would make a good
 * day look like every other day.
 *
 * `WaterTank` repeats this sum inline rather than calling it: `src/ui` knows
 * nothing about RiceCal, and the presets and goal bounds live here.
 */
export function waterProgress(ml: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, Math.max(0, ml / goal))
}

// Millilitres wherever a figure is logged or set, litres wherever one is
// summarised. The rule is per surface rather than per figure: mixing them
// inside one card produced "0 ml / 2 L".

/** Litres above a litre, millilitres below. A whole number drops its decimal. */
export function volume(ml: number): { value: string; unit: 'l' | 'ml' } {
  const rounded = Math.round(ml)
  if (rounded < 1000) return { value: String(rounded), unit: 'ml' }

  const litres = rounded / 1000
  // One decimal: 1,050 ml is "1.1 L". The second decimal is below what anybody pours.
  const shown = Math.round(litres * 10) / 10
  return { value: Number.isInteger(shown) ? String(shown) : shown.toFixed(1), unit: 'l' }
}

/** Whole millilitres with a thousands separator, however large. */
export function millilitres(ml: number): string {
  return Math.round(ml).toLocaleString()
}
