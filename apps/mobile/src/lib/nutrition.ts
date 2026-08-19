import type { ActivityLevel, Entry, Macros, Targets } from '@/data/types'
import { DEFAULT_WATER_ML } from './water'

/**
 * Arithmetic the screens share.
 *
 * What is left here after the move to Postgres is deliberately small. Anything
 * that describes stored data — a day's calories, an entry's macros, the budget
 * in force — is a view now, computed once in the database where the reminder
 * and report jobs can read the same number. What remains is either presentation
 * (a bar's fill, which meal a tap means) or a projection of something that has
 * not been saved yet (the budget onboarding previews before an account exists).
 */

export const ZERO_MACROS: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

/**
 * One decimal place, and no float droppings.
 *
 * Grams come out of Postgres as `numeric(6,1)`, so every value going IN has one
 * decimal at most — but 24.3 + 51.3 is 75.60000000000001 in binary floating
 * point, and that is a string the moment anything interpolates it. "75.6g" is
 * what the screen is meant to say.
 */
const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Adds up entries that already carry their own costed macros.
 *
 * Rounded as it goes out rather than by each of the six places that render the
 * result. Nothing is lost: the inputs are one-decimal numbers, so this only
 * discards the error the addition introduced.
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
 * What ONE entry counts as, from the three sources that decide it.
 *
 * The same rule, in the same order, as the `coalesce` in `food_log_details`:
 * what the user typed, what the parts add up to, what the dish costs at this
 * portion. It is written twice because the two answer at different moments —
 * the view answers for the diary, this answers for the screen editing the
 * entry, where a figure inside the save debounce and an ingredient the
 * optimistic update has already moved are both true and neither has reached
 * the database.
 *
 * Field by field, like the view: someone who corrects only the protein keeps
 * the catalogue's carbs. An entry with no parts and nothing typed falls
 * straight through to `portion`, which is almost every entry there is.
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

// `entriesForMeal`, `mealKcal` and `mealForHour` used to live here, for the
// card-per-meal day and the selector that guessed which meal you were logging.
// Today is one chronological list now and nothing groups by meal, so both are gone
// — along with the second copy of `entriesForMeal` in `data/day.ts`, which had
// drifted to a different sort order than this one.

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
 * left to run is read.
 *
 * Loss at the gentle end of the 0.5–1 kg/week both the NHS and CDC call safe —
 * past 1 kg/week a growing share of what goes is lean tissue. Gain at 0.25
 * kg/week, the lean-gain rate: muscle has a ceiling on how fast it can be built
 * and anything quicker is mostly fat.
 *
 * NOMINAL, because this is the most either direction ever asks for and not what
 * the plan does. How far the target is decides that — see `intendedPace`.
 */
const NOMINAL_LOSS_KG_PER_WEEK = 0.5
const NOMINAL_GAIN_KG_PER_WEEK = 0.25

/**
 * How close to the target counts as arrived, and the width of "no goal".
 *
 * Body weight swings a kilogram either way inside a single day on water alone,
 * so a plan that chased the last hundred grams would be reading noise: the
 * budget would move on every weigh-in and the number on Today would never
 * settle. Half a kilo is also the step on the target-weight slider, so the
 * deadband is exactly "you cannot ask for closer than this".
 *
 * It carries a second job now that the two weights are the whole statement of
 * intent. A user who wants no goal at all sets their target where they already
 * are, and this is what turns that into maintenance rather than into a plan to
 * move a rounding error.
 */
const TARGET_DEADBAND_KG = 0.5

/**
 * The shortest horizon the plan will try to close the remaining distance in.
 *
 * This is the taper, and it is the thing a fixed pace gets wrong. Someone 30 kg
 * out and someone 1 kg out were being handed the same 0.5 kg/week deficit —
 * which for the second is two weeks of work priced as a diet, and which did not
 * stop when they arrived, because a stored goal of "lose" went on saying so.
 *
 * Four weeks means the last two kilograms are the only ones affected — anyone
 * further out than that still gets the full pace, because `remaining / 4` is
 * larger than the nominal figure and the smaller one wins. It is a soft landing
 * bolted onto the end, not a slower plan.
 */
const MIN_WEEKS_TO_TARGET = 4

/**
 * The pace, capped as a share of maintenance.
 *
 * A flat 550 kcal deficit is a fifth of a large man's day and nearly half a small
 * woman's. Capping the cut at 20% of maintenance is what stops the same "0.5 kg a
 * week" being gentle for one body and a crash diet for another; the surplus is
 * capped tighter still, because overshooting a lean gain just adds fat.
 */
const MAX_DEFICIT_SHARE = 0.2
const MAX_SURPLUS_SHARE = 0.15

/**
 * Protein from body weight, not from a share of energy.
 *
 * 1.6 g/kg is where the meta-analytic evidence stops improving: more spares no
 * further lean mass, in a deficit or out of one. Deriving it from energy instead
 * — which this used to do, at 22% — gets the relationship backwards, because it
 * hands you LESS protein exactly when a deficit makes it matter most.
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
 * The floor, by sex.
 *
 * Below these is the point at which the guidance says medical supervision, and
 * Mifflin-St Jeor plus a percentage deficit reaches them easily for a small,
 * older, sedentary body. Two numbers rather than one because the guidance is two
 * numbers.
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
   * ask: the sign says lose or gain, the size says how hard, and equal says
   * neither. There used to be a `goal` beside it — a lose/maintain/gain enum
   * picked on its own onboarding screen — and it could only ever agree with the
   * two weights or contradict them, which meant a rule for deciding which of the
   * user's own answers to believe.
   *
   * Null is "no target stated", which reads as maintenance. Only rows written
   * before the target was collected are in that state.
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
 * The kg/week this plan aims for, read entirely off the two weights.
 *
 * The gap between where the user is and where they say they want to be answers
 * every question there is: which way to move, whether to move at all, and how
 * hard. Nothing else is consulted, and that is the point — there was a
 * lose/maintain/gain enum here, chosen on its own onboarding screen and stored
 * beside the target, and a second source can only agree with the first or
 * contradict it. Agreeing, it was noise; contradicting — "lose" with a target
 * above the current weight, one drag of a slider away — it forced the app to
 * decide which of the user's own answers to ignore.
 *
 * Three cases, in order:
 *
 * 1. **No target stated** — nothing to work toward, so maintenance. Only rows
 *    written before the target was collected reach this.
 * 2. **Already there**, within the deadband — nothing to do. This is also how a
 *    user says they have no goal: the target sits where they are.
 * 3. **A real gap** — the nominal pace for that direction, or the taper, or
 *    whichever asks for less.
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
 * The kcal/day added or removed for the goal, capped against maintenance.
 *
 * The single source of truth for how fast the plan moves. `weeklyPace` reads the
 * answer back out rather than keeping its own copy — the two used to be separate
 * constants that disagreed, so the budget was built for 400 kcal a day while the
 * goal date was drawn for 0.5 kg a week, which needs 550.
 *
 * TWO caps, and they answer different questions. The taper in `intendedPace`
 * asks how much distance is left; this one asks what this body can afford, and
 * is why 0.5 kg/week is a gentle cut for a large man and a crash diet for a
 * small woman at the same 550 kcal.
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
 * When the target weight is reached, or null when there is nothing to reach — a
 * maintain plan has no finish line, and saying "never" would be both true and
 * unkind.
 *
 * Walked a week at a time rather than divided, because neither term of that
 * division holds still any more. The pace tapers over the last two kilograms,
 * and the body doing the losing gets lighter as it goes — Mifflin-St Jeor falls
 * about 10 kcal per kilogram of BMR, so a capped deficit shrinks with it. That
 * is the plateau every diet runs into, and a straight `distance / pace` promises
 * a date before it.
 *
 * The loop is bounded twice over: the step is at most a quarter of what is left,
 * so the remainder falls geometrically and the deadband is reached in weeks, and
 * `MAX_WEEKS_PROJECTED` catches anything that somehow crawls.
 */
export function goalDate(body: BodyInput, targetWeightKg: number, from: Date): Date | null {
  let weightKg = body.weightKg

  for (let week = 1; week <= MAX_WEEKS_PROJECTED; week++) {
    const pace = weeklyPace({ ...body, weightKg, targetWeightKg })
    // Nothing to reach. On the first pass that is a target already met — the
    // only way this can be zero, now that the gap is the whole plan. Later it
    // cannot happen at all, because a step is never more than a quarter of what
    // is left and so never carries the weight past the deadband that would have
    // ended the loop.
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
 * The database owns this number — a trigger recomputes `daily_goals` whenever the
 * profile or the newest weigh-in changes, and that is the copy every screen
 * reads. This exists for the one moment there is nothing to read from: the
 * onboarding questions, which show a budget before the account that would store
 * it exists. Keep the two in step; they are the same arithmetic on purpose, and
 * `compute_targets()` in `02_functions.sql` is the other half.
 *
 * Macros are built in a fixed order, because each one constrains the next:
 * protein from body weight, fat from a share of energy, and carbohydrate from
 * whatever energy is left. Carbohydrate last is what makes the budget add up
 * exactly — a three-way percentage split does not, and the rounding error lands
 * somewhere nobody chose.
 */
export function computeTargets(body: BodyInput): Omit<Targets, 'isCustom'> {
  const kcal = Math.max(
    Math.round((maintenanceRate(body) + energyDelta(body)) / 10) * 10,
    FLOOR_KCAL[body.sex],
  )

  return { kcal, ...macroSplit(kcal, body.weightKg), waterMl: DEFAULT_WATER_ML }
}

/**
 * How a calorie budget divides into grams.
 *
 * Separate from `computeTargets` because it is also what a hand-set budget needs:
 * the goals screen lets a user drag the calorie total themselves, and its macros
 * should still follow the same rules rather than a third copy of them — there
 * were three copies of the old percentage split, and they did not all agree.
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
 * What share of the energy each macro is, as three fractions summing to one.
 *
 * A stacked calorie bar has to be stacked by CALORIES. 61 g of fat is a sixth of
 * the grams on a plate and very nearly a third of its energy, so a bar segmented
 * by grams contradicts the percentages printed under it — which is the version
 * that was on screen first, and read as a rendering bug rather than a unit one.
 *
 * All three come back zero for a day with no macros recorded, which is not the
 * same as an even split: the caller draws that column as a stub, because there
 * is nothing to divide.
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
