/**
 * Water, in millilitres.
 *
 * WHY MILLILITRES AND NOT GLASSES. A glass was the unit for as long as the
 * tracker was a row of eight boxes to tap, and it never survived contact with
 * what people drink: a mug is 350, a bottle is 500, the tumbler at a kopitiam
 * is 200, and every one of them was one tap. So a day of "six glasses" was
 * anything between 1.2 and 3 litres, and a goal expressed in them could not be
 * met deliberately. Millilitres are printed on the bottle, they add up, and the
 * arithmetic Postgres does over them means something.
 *
 * The database is the original of every figure here — `daily_goals.water_ml`
 * defaults to 2,000 and checks 250..8,000 — and this is the copy the controls
 * are drawn from. They have to be changed together: a stepper that offers a
 * goal the check rejects is a Save button that fails with nothing to say.
 */

/** The goal an account has before anybody sets one. `daily_goals`' own default. */
export const DEFAULT_WATER_ML = 2000

/**
 * What the goal stepper offers, which is deliberately NARROWER than the column.
 *
 * `daily_goals.water_ml` checks 250..8,000, because a check constraint's job is
 * to refuse nonsense rather than to have an opinion. The stepper's job is the
 * opposite: every figure it can reach is one the app is suggesting, and a
 * control that can be walked to eight litres a day is a control suggesting it.
 */
export const WATER_GOAL_MIN_ML = 500
export const WATER_GOAL_MAX_ML = 6000

/**
 * A quarter of a litre a step.
 *
 * Small enough to land on the figure somebody has in mind (1,750; 2,250) and
 * large enough that the whole range is 22 taps rather than 55. Nobody has a
 * water goal that needs the last 50 ml.
 */
export const WATER_GOAL_STEP_ML = 250

/**
 * What the quick-add row offers, in the order it draws them.
 *
 * Three, not five. Every extra one is a smaller button and a longer decision on
 * a control whose whole point is that it takes no thought — and anything these
 * miss is what the custom amount is for. The sizes are the three vessels
 * somebody actually drinks from rather than a round arithmetic series.
 */
export const WATER_PRESETS = [
  { id: 'glass', ml: 250, icon: 'water-glass' },
  { id: 'mug', ml: 350, icon: 'tea-cup' },
  { id: 'bottle', ml: 500, icon: 'water-bottle' },
] as const

export type WaterPreset = (typeof WATER_PRESETS)[number]

/**
 * The largest a day can hold, which is also what `add_water` clamps to.
 *
 * The COPY of a check constraint, and the optimistic update in `useAddWater`
 * needs it as much as the custom-amount field does: the client's guess at the
 * new total has to clamp exactly where the server clamps, or the figure under
 * the finger and the one that comes back disagree at the edges.
 */
export const WATER_MAX_ML = 20000

/**
 * How full the tank is, as a fraction, bounded at one.
 *
 * Drinking past the goal is not an error and nothing colours it as one, but the
 * picture has nowhere to put the extra: a tank at 130% would either overflow
 * its own outline or silently rescale, and rescaling makes a good day look like
 * every other day.
 *
 * `WaterTank` does this same sum inline rather than calling it, and that is the
 * `src/ui` boundary rather than an oversight — the design system knows nothing
 * about RiceCal, and this file is where the presets and the goal bounds live.
 */
export function waterProgress(ml: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, Math.max(0, ml / goal))
}

// WHICH UNIT GOES WHERE, and the two functions below are the two forms.
//
// Millilitres wherever a figure is LOGGED or SET — the card on Today, the
// quick-add sheet, the goal stepper — because that is the unit the number is
// chosen in and it is what the bottle says. Litres wherever a figure is
// SUMMARISED — a trend tile, a range total, a review's daily average — because
// those are read at a glance, and "1.8 L" is a glance where "1,750 ml" is
// arithmetic.
//
// The rule is per SURFACE and not per figure, which is the part worth keeping:
// mixing them inside one card produced "0 ml / 2 L", a fraction whose two
// halves are in different units and which reads as a fault.

/**
 * A volume as a figure and its unit, for copy to interpolate. The SUMMARY form.
 *
 * Litres above a litre, and millilitres below: "1.5 L" is how anybody says it,
 * where "1,500 ml" is how a database says it. A whole number of litres drops
 * its decimal ("2 L", never "2.0 L") because a trailing zero reads as a
 * precision nothing here has.
 */
export function volume(ml: number): { value: string; unit: 'l' | 'ml' } {
  const rounded = Math.round(ml)
  if (rounded < 1000) return { value: String(rounded), unit: 'ml' }

  const litres = rounded / 1000
  // One decimal, and only when it says something. 1,050 ml is "1.1 L" rather
  // than "1.05 L": the second decimal is below what anybody pours.
  const shown = Math.round(litres * 10) / 10
  return { value: Number.isInteger(shown) ? String(shown) : shown.toFixed(1), unit: 'l' }
}

/**
 * The LOGGED form: whole millilitres, with a thousands separator.
 *
 * Always millilitres, however large, so that every figure on the card somebody
 * is tapping is in the unit they are tapping in — and so the fraction beside
 * the heading has the same unit on both sides of its slash.
 */
export function millilitres(ml: number): string {
  return Math.round(ml).toLocaleString()
}
