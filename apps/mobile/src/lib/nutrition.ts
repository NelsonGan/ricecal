import type { ActivityLevel, Entry, Macros, Targets } from '@/data/types'
import { DEFAULT_WATER_ML } from './water'

/**
 * Arithmetic the screens share, and deliberately little of it. Anything that
 * describes stored data is a view now, computed once in the database where the
 * reminder and report jobs read the same number. What is left is presentation,
 * or a projection of something not yet saved.
 */

export const ZERO_MACROS: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

/**
 * One decimal place, and no float droppings. Grams arrive as `numeric(6,1)`, but
 * 24.3 + 51.3 is 75.60000000000001 in binary floating point, which is a string
 * the moment anything interpolates it.
 */
const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Adds up entries that already carry their own costed macros. Rounded here
 * rather than by each of the six places that render it; the inputs are
 * one-decimal numbers, so this only discards the error the addition introduced.
 */
export function sumMacros(entries: readonly Entry[]): Macros {
  const total = entries.reduce<Macros>(
    (sum, entry) => ({
      kcal: sum.kcal + entry.macros.kcal,
      carbs: sum.carbs + entry.macros.carbs,
      protein: sum.protein + entry.macros.protein,
      fat: sum.fat + entry.macros.fat,
    }),
    ZERO_MACROS,
  )

  return {
    // Calories are integers per entry and stay integers.
    kcal: Math.round(total.kcal),
    carbs: round1(total.carbs),
    protein: round1(total.protein),
    fat: round1(total.fat),
  }
}

/**
 * What one entry counts as, from the three sources that decide it: what the user
 * typed, what the parts add up to, what the dish costs at this portion. The same
 * rule as the `coalesce` in `food_log_details`, written twice because the two
 * answer at different moments: the view answers for the diary, and this answers
 * for the screen editing the entry, where a figure inside the save debounce has
 * not reached the database.
 *
 * Field by field, like the view: correcting only the protein keeps the
 * catalogue's carbs.
 */
export function entryTotals(input: {
  /** Figures the user typed. A field left out is one they did not touch. */
  typed?: Partial<Macros>
  /** The plate's parts, when the scan broke it down. Empty is "it did not". */
  parts?: readonly Macros[]
  /** The dish at this portion — the catalogue's answer, and the fallback. */
  portion: Macros
}): Macros {
  const parts = input.parts?.length ? sumMacroList(input.parts) : undefined
  const typed = input.typed ?? {}
  const pick = (field: keyof Macros) => typed[field] ?? parts?.[field] ?? input.portion[field]

  return {
    kcal: pick('kcal'),
    carbs: pick('carbs'),
    protein: pick('protein'),
    fat: pick('fat'),
  }
}

/** `sumMacros` for anything carrying macros directly rather than on `.macros`. */
function sumMacroList(items: readonly Macros[]): Macros {
  const total = items.reduce<Macros>(
    (sum, item) => ({
      kcal: sum.kcal + item.kcal,
      carbs: sum.carbs + item.carbs,
      protein: sum.protein + item.protein,
      fat: sum.fat + item.fat,
    }),
    ZERO_MACROS,
  )
  return {
    kcal: Math.round(total.kcal),
    carbs: round1(total.carbs),
    protein: round1(total.protein),
    fat: round1(total.fat),
  }
}

// `entriesForMeal`, `mealKcal` and `mealForHour` lived here for the
// card-per-meal day and the selector that guessed which meal you were logging.
// Today is one chronological list now, so they are gone, along with the second
// copy of `entriesForMeal` in `data/day.ts` that had drifted to a different sort
// order.

/** 0 to 1, clamped, for the ring and the bars. */
export function progressOf(done: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, Math.max(0, done / goal))
}

export function bmi(heightCm: number, weightKg: number): number {
  const metres = heightCm / 100
  if (metres <= 0) return 0
  return Math.round((weightKg / (metres * metres)) * 10) / 10
}

/**
 * Standard activity multipliers against BMR. `onFeet` is the usual "moderately
 * active" 1.55 and `veryActive` the usual 1.725; the published scale has a fifth
 * step at 1.9 for twice-a-day training, which this app does not ask about.
 */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  onFeet: 1.55,
  veryActive: 1.725,
}

/** Energy in a kilogram of body tissue. The standard approximation. */
const KCAL_PER_KG = 7700

/**
 * How fast the plan moves in each direction, in kg per week, before the distance
 * left is read. Loss at the gentle end of the 0.5 to 1 kg/week the NHS and CDC
 * call safe, since past 1 kg/week a growing share of what goes is lean tissue.
 * Gain at the 0.25 kg/week lean-gain rate.
 *
 * Nominal: the most either direction ever asks for, not what the plan does.
 */
const NOMINAL_LOSS_KG_PER_WEEK = 0.5
const NOMINAL_GAIN_KG_PER_WEEK = 0.25

/**
 * How close to the target counts as arrived, and the width of "no goal".
 *
 * Body weight swings a kilogram either way inside a day on water alone, so
 * chasing the last hundred grams would move the budget on every weigh-in. Half a
 * kilo is also the step on the target-weight slider.
 *
 * It has a second job now the two weights are the whole statement of intent: a
 * user who wants no goal sets their target where they are, and this turns that
 * into maintenance.
 */
const TARGET_DEADBAND_KG = 0.5

/**
 * The shortest horizon the plan will try to close the remaining distance in.
 *
 * The taper, and what a fixed pace gets wrong: somebody 30 kg out and somebody
 * 1 kg out were handed the same 0.5 kg/week deficit.
 *
 * Four weeks means only the last two kilograms are affected: further out,
 * `remaining / 4` is larger than the nominal figure and the smaller one wins.
 */
const MIN_WEEKS_TO_TARGET = 4

/**
 * The pace, capped as a share of maintenance. A flat 550 kcal deficit is a fifth
 * of a large man's day and nearly half a small woman's. The surplus is capped
 * tighter, because overshooting a lean gain just adds fat.
 */
const MAX_DEFICIT_SHARE = 0.2
const MAX_SURPLUS_SHARE = 0.15

/**
 * Protein from body weight, not from a share of energy. 1.6 g/kg is where the
 * meta-analytic evidence stops improving. Deriving it from energy, which this
 * used to do at 22%, hands you less protein exactly when a deficit makes it
 * matter most.
 */
const PROTEIN_G_PER_KG = 1.6

/** Protein's ceiling in the AMDR, so a small body on a floored budget stays inside it. */
const PROTEIN_MAX_SHARE = 0.35

/**
 * Fat's share of energy. Inside the AMDR's 20–35%, and at the lower end of it on
 * purpose: what is left over is carbohydrate, and this is an app for people who
 * eat rice twice a day.
 */
const FAT_SHARE = 0.25

/**
 * The floor, by sex. Below these the guidance says medical supervision, and
 * Mifflin-St Jeor plus a percentage deficit reaches them easily for a small,
 * older, sedentary body. Two numbers because the guidance is two numbers.
 */
const FLOOR_KCAL: Record<'female' | 'male', number> = { female: 1200, male: 1500 }

export type BodyInput = {
  sex: 'female' | 'male'
  weightKg: number
  heightCm: number
  age: number
  activity: ActivityLevel
  /**
   * Where the user is heading. With this and `weightKg` there is nothing left to
   * ask: the sign says lose or gain, the size says how hard, equal says neither.
   * A `goal` enum beside it could only agree or contradict, which meant a rule
   * for deciding which of the user's own answers to believe.
   *
   * Null is "no target stated", which reads as maintenance.
   */
  targetWeightKg?: number | null
}

/** Mifflin St Jeor, the same formula `compute_targets()` runs server-side. */
export function basalRate(body: BodyInput): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age
  return body.sex === 'male' ? base + 5 : base - 161
}

/** What this body burns in a day before any goal is applied. */
export function maintenanceRate(body: BodyInput): number {
  return basalRate(body) * ACTIVITY_FACTOR[body.activity]
}

/**
 * The kg/week this plan aims for, read entirely off the two weights. The gap
 * answers which way to move, whether to move at all, and how hard, and nothing
 * else is consulted: a lose/maintain/gain enum could only agree with it or
 * contradict it.
 *
 * Three cases, in order:
 *
 * 1. No target stated: maintenance.
 * 2. Already there, within the deadband. This is also how a user says they have
 *    no goal.
 * 3. A real gap: the nominal pace for that direction, or the taper, whichever
 *    asks for less.
 */
function intendedPace(body: BodyInput): number {
  const target = body.targetWeightKg
  if (target === undefined || target === null) return 0

  // Signed the way the pace is: negative when there is weight to lose.
  const remaining = target - body.weightKg
  if (Math.abs(remaining) < TARGET_DEADBAND_KG) return 0

  const nominal = remaining < 0 ? -NOMINAL_LOSS_KG_PER_WEEK : NOMINAL_GAIN_KG_PER_WEEK

  return Math.sign(nominal) * Math.min(Math.abs(nominal), Math.abs(remaining) / MIN_WEEKS_TO_TARGET)
}

/**
 * The kcal/day added or removed for the goal, capped against maintenance, and
 * the single source of truth for how fast the plan moves. `weeklyPace` reads the
 * answer back out rather than keeping its own copy: as two constants they
 * disagreed, so the budget was built for 400 kcal a day while the goal date was
 * drawn for the 550 that 0.5 kg a week needs.
 *
 * Two caps answering different questions: the taper in `intendedPace` asks how
 * much distance is left, and this asks what this body can afford.
 */
export function energyDelta(body: BodyInput): number {
  const pace = intendedPace(body)
  if (pace === 0) return 0

  const fromPace = (Math.abs(pace) * KCAL_PER_KG) / 7
  const share = pace < 0 ? MAX_DEFICIT_SHARE : MAX_SURPLUS_SHARE
  const capped = Math.min(fromPace, maintenanceRate(body) * share)

  return pace < 0 ? -capped : capped
}

/** kg per week this plan actually moves, signed toward the target. */
export function weeklyPace(body: BodyInput): number {
  return (energyDelta(body) * 7) / KCAL_PER_KG
}

/** Five years. Past this the answer is "not at this rate", which is a null. */
const MAX_WEEKS_PROJECTED = 260

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * When the target weight is reached, or null when there is nothing to reach.
 *
 * Walked a week at a time rather than divided, because neither term holds still:
 * the pace tapers over the last two kilograms, and the body gets lighter as it
 * goes, so a capped deficit shrinks with it. That is the plateau every diet runs
 * into, and a straight `distance / pace` promises a date before it.
 *
 * Bounded twice: the step is at most a quarter of what is left, so the remainder
 * falls geometrically, and `MAX_WEEKS_PROJECTED` catches anything that crawls.
 */
export function goalDate(body: BodyInput, targetWeightKg: number, from: Date): Date | null {
  let weightKg = body.weightKg

  for (let week = 1; week <= MAX_WEEKS_PROJECTED; week++) {
    const pace = weeklyPace({ ...body, weightKg, targetWeightKg })
    // Nothing to reach: on the first pass, a target already met. Later it
    // cannot happen, because a step is never more than a quarter of what is
    // left and so never carries the weight past the deadband.
    if (pace === 0) return null

    weightKg += pace
    if (Math.abs(weightKg - targetWeightKg) < TARGET_DEADBAND_KG) {
      return new Date(from.getTime() + week * WEEK_MS)
    }
  }

  return null
}

/**
 * The daily budget, previewed.
 *
 * The database owns this number: a trigger recomputes `daily_goals` whenever the
 * profile or the newest weigh-in changes. This exists for the one moment there
 * is nothing to read from, the onboarding questions. Keep the two in step;
 * `compute_targets()` in `02_functions.sql` is the other half.
 *
 * Macros are built in a fixed order, because each constrains the next: protein
 * from body weight, fat from a share of energy, carbohydrate from what is left.
 * Carbohydrate last is what makes the budget add up exactly.
 */
export function computeTargets(body: BodyInput): Omit<Targets, 'isCustom'> {
  const kcal = Math.max(
    Math.round((maintenanceRate(body) + energyDelta(body)) / 10) * 10,
    FLOOR_KCAL[body.sex],
  )

  return { kcal, ...macroSplit(kcal, body.weightKg), waterMl: DEFAULT_WATER_ML }
}

/**
 * How a calorie budget divides into grams. Separate from `computeTargets`
 * because a hand-set budget needs it too: the goals screen lets a user drag the
 * calorie total, and its macros follow the same rules. There were three copies
 * of the old percentage split, and they did not all agree.
 */
export function macroSplit(
  kcal: number,
  weightKg: number,
): { carbs: number; protein: number; fat: number } {
  const protein = Math.round(Math.min(weightKg * PROTEIN_G_PER_KG, (kcal * PROTEIN_MAX_SHARE) / 4))
  const fat = Math.round((kcal * FAT_SHARE) / 9)
  // Never negative: protein is capped at 35% of energy and fat takes 25%, so
  // something is always left — the floor says so rather than relying on it.
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))

  return { carbs, protein, fat }
}

/** Calories in a gram of each macro. Atwater factors, as every label rounds them. */
const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const

/**
 * What share of the energy each macro is, as three fractions summing to one. A
 * stacked calorie bar has to be stacked by calories: 61 g of fat is a sixth of
 * the grams on a plate and nearly a third of its energy, so a bar segmented by
 * grams contradicts the percentages printed under it.
 *
 * All three come back zero for a day with no macros recorded, which is not an
 * even split: the caller draws that column as a stub.
 */
export function energyShare(macros: { carbs: number; protein: number; fat: number }) {
  const carbs = macros.carbs * KCAL_PER_G.carbs
  const protein = macros.protein * KCAL_PER_G.protein
  const fat = macros.fat * KCAL_PER_G.fat
  const total = carbs + protein + fat

  if (total <= 0) return { carbs: 0, protein: 0, fat: 0 }
  return { carbs: carbs / total, protein: protein / total, fat: fat / total }
}

/** Years between a birth date and today. The profile stores the date. */
export function ageFrom(birthDate: string | null): number {
  if (!birthDate) return 0
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age--
  return age
}

/** A birth date for someone who says they are this many years old today. */
export function birthDateFromAge(age: number): string {
  const now = new Date()
  const year = now.getFullYear() - age
  return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
