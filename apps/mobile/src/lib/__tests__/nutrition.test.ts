import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type BodyInput,
  basalRate,
  computeTargets,
  energyDelta,
  entryTotals,
  goalDate,
  macroSplit,
  maintenanceRate,
  weeklyPace,
} from '../nutrition'

/**
 * The calorie budget.
 *
 * Every number asserted here traces to published guidance rather than to taste,
 * which is what makes them worth pinning: a plausible-looking edit to any one
 * constant changes what the app tells someone to eat, and nothing else in the
 * pipeline would notice.
 *
 * The last test in this file is the important one. This arithmetic exists twice —
 * here and in `compute_targets()` — because onboarding shows a budget before the
 * account that would store it, and the two drifting is a bug the user sees as
 * "the number changed after I signed up".
 */

/**
 * 164 cm, 65 kg, 29, sedentary. BMR 1369, maintenance 1642.8.
 *
 * No target weight, which is the same as a target of 65: this body is holding
 * steady, and every test below states its own plan by naming where it is going.
 */
const woman: BodyInput = {
  sex: 'female',
  weightKg: 65,
  heightCm: 164,
  age: 29,
  activity: 'sedentary',
}

const man: BodyInput = { ...woman, sex: 'male', weightKg: 82, heightCm: 178, age: 34 }

/** The same woman, heading somewhere. Ten kilos out: far enough that nothing tapers. */
const losing: BodyInput = { ...woman, targetWeightKg: 55 }
const gaining: BodyInput = { ...man, targetWeightKg: 92 }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

describe('Mifflin-St Jeor', () => {
  it('subtracts 161 for a woman and adds 5 for a man', () => {
    expect(basalRate(woman)).toBeCloseTo(10 * 65 + 6.25 * 164 - 5 * 29 - 161)
    expect(basalRate({ ...woman, sex: 'male' })).toBeCloseTo(basalRate(woman) + 166)
  })

  it('applies the standard activity multipliers', () => {
    expect(maintenanceRate({ ...woman, activity: 'sedentary' })).toBeCloseTo(basalRate(woman) * 1.2)
    expect(maintenanceRate({ ...woman, activity: 'light' })).toBeCloseTo(basalRate(woman) * 1.375)
    expect(maintenanceRate({ ...woman, activity: 'onFeet' })).toBeCloseTo(basalRate(woman) * 1.55)
    expect(maintenanceRate({ ...woman, activity: 'veryActive' })).toBeCloseTo(
      basalRate(woman) * 1.725,
    )
  })
})

describe('the energy delta', () => {
  it('asks for nothing when there is no target, or when the target is here', () => {
    expect(energyDelta(woman)).toBe(0)
    expect(energyDelta({ ...woman, targetWeightKg: null })).toBe(0)
    expect(energyDelta({ ...woman, targetWeightKg: 65 })).toBe(0)
  })

  /**
   * A flat deficit is a fifth of a large man's day and nearly half a small
   * woman's, which is the whole reason for the cap.
   */
  it('caps a cut at a fifth of maintenance', () => {
    const small: BodyInput = {
      sex: 'female',
      weightKg: 45,
      heightCm: 150,
      age: 60,
      activity: 'sedentary',
      targetWeightKg: 40,
    }

    // 0.5 kg/week would ask for 550 kcal, which is half this body's day.
    expect(energyDelta(small)).toBeCloseTo(-maintenanceRate(small) * 0.2)
    expect(Math.abs(energyDelta(small))).toBeLessThan(550)
  })

  it('asks for the full 0.5 kg a week when the body can afford it', () => {
    const big: BodyInput = { ...man, weightKg: 110, activity: 'onFeet', targetWeightKg: 90 }
    expect(energyDelta(big)).toBeCloseTo(-(0.5 * 7700) / 7)
  })

  it('keeps a surplus inside the lean-gain band', () => {
    const delta = energyDelta(gaining)
    expect(delta).toBeGreaterThan(0)
    // Published lean-gain advice runs +150 to +350 kcal a day.
    expect(delta).toBeLessThanOrEqual(350)
  })

  /** The bug this replaced: the budget was built for 400 and the date drawn for 550. */
  it('is the only source of the weekly pace', () => {
    expect(weeklyPace(losing)).toBeCloseTo((energyDelta(losing) * 7) / 7700)
    expect(weeklyPace(woman)).toBe(0)
  })
})

/**
 * The two weights, which are now the whole plan.
 *
 * There was a lose/maintain/gain enum beside them, and the first three cases
 * here are answers the app gave while it was the only thing consulted: the same
 * deficit for someone 30 kg out and someone 1 kg out, a cut that carried on
 * after the target was reached, and a cut prescribed toward a target ABOVE the
 * user's own weight. The last of those is not a rule any more — it is
 * unrepresentable, which is the point.
 */
describe('the distance to the target', () => {
  it('reads the direction off the sign of the gap', () => {
    expect(energyDelta({ ...woman, targetWeightKg: 55 })).toBeLessThan(0)
    expect(energyDelta({ ...woman, targetWeightKg: 75 })).toBeGreaterThan(0)
  })

  it('runs at the full pace while the target is more than a month away', () => {
    // Ten kilos is far enough that the taper never binds; five is too.
    expect(energyDelta({ ...woman, targetWeightKg: 60 })).toBe(energyDelta(losing))
  })

  /**
   * The taper. Four weeks is the shortest horizon the plan will close the gap
   * in, so the last two kilograms — and only those — come off gently.
   *
   * Read on a body large enough that the maintenance cap never binds, because
   * otherwise the two caps are indistinguishable: `woman` is small enough that a
   * fifth of her maintenance is the smaller number at every distance, and the
   * taper would be invisible behind it.
   */
  it('slows as the target comes within a month', () => {
    const big = { ...man, weightKg: 110, activity: 'onFeet' as const }

    expect(weeklyPace({ ...big, targetWeightKg: 100 })).toBeCloseTo(-0.5)
    // Two kilos out is exactly where the taper starts to bind, and not before.
    expect(weeklyPace({ ...big, targetWeightKg: 108 })).toBeCloseTo(-0.5)
    // One kilo left over four weeks is 0.25 kg/week, half the nominal pace.
    expect(weeklyPace({ ...big, targetWeightKg: 109 })).toBeCloseTo(-0.25)

    // A gentler cut is a larger budget, which is the whole visible effect.
    expect(Math.abs(energyDelta({ ...woman, targetWeightKg: 64 }))).toBeLessThan(
      Math.abs(energyDelta(losing)),
    )
  })

  /** Gaining tapers on the same rule, at its own nominal pace. */
  it('tapers a gain as well as a cut', () => {
    expect(weeklyPace({ ...man, targetWeightKg: 92 })).toBeCloseTo(0.25)
    expect(weeklyPace({ ...man, targetWeightKg: 82.5 })).toBeCloseTo(0.125)
  })

  it('stops entirely once the target is reached', () => {
    expect(energyDelta({ ...woman, targetWeightKg: 65 })).toBe(0)
    expect(energyDelta({ ...man, targetWeightKg: man.weightKg })).toBe(0)
  })

  /**
   * Weight moves a kilogram on water inside a day. Without the deadband the
   * budget would chase that noise and never settle on a number — and there
   * would be no way for a user to say they have no goal at all.
   */
  it('treats anything inside half a kilo as arrived', () => {
    expect(energyDelta({ ...woman, targetWeightKg: 64.6 })).toBe(0)
    expect(energyDelta({ ...woman, targetWeightKg: 65.4 })).toBe(0)
    expect(energyDelta({ ...woman, targetWeightKg: 64.4 })).not.toBe(0)
  })

  /** The taper cuts the deficit, so the budget it produces is larger. */
  it('feeds through to the budget', () => {
    const far = computeTargets(losing).kcal
    const near = computeTargets({ ...woman, targetWeightKg: 64 }).kcal
    const arrived = computeTargets({ ...woman, targetWeightKg: 65 }).kcal

    expect(near).toBeGreaterThan(far)
    expect(arrived).toBeGreaterThan(near)
    expect(arrived).toBe(computeTargets(woman).kcal)
  })
})

describe('the budget', () => {
  it('never goes below the floor for the sex', () => {
    const tiny: BodyInput = {
      sex: 'female',
      weightKg: 42,
      heightCm: 145,
      age: 70,
      activity: 'sedentary',
      targetWeightKg: 37,
    }
    expect(computeTargets(tiny).kcal).toBe(1200)
    expect(computeTargets({ ...tiny, sex: 'male' }).kcal).toBe(1500)
  })

  it('rounds to the nearest ten so it reads as a target', () => {
    expect(computeTargets(woman).kcal % 10).toBe(0)
  })
})

describe('the macro split', () => {
  it('takes protein from body weight, not from a share of energy', () => {
    // 1.6 g/kg is where the meta-analytic evidence stops improving.
    expect(macroSplit(2000, 65).protein).toBe(104)
    expect(macroSplit(2600, 65).protein).toBe(104)
  })

  /**
   * The regression this guards. A percentage split hands out less protein exactly
   * when a deficit makes it matter most, which is backwards.
   */
  it('does not cut protein when the budget is cut', () => {
    const maintaining = computeTargets(woman)
    const cutting = computeTargets(losing)

    expect(cutting.kcal).toBeLessThan(maintaining.kcal)
    expect(cutting.protein).toBe(maintaining.protein)
  })

  it('holds protein inside the AMDR ceiling on a small budget', () => {
    const { protein } = macroSplit(1200, 120)
    expect((protein * 4) / 1200).toBeLessThanOrEqual(0.35)
  })

  it('keeps fat at a quarter of energy, inside the AMDR', () => {
    const { fat } = macroSplit(2000, 65)
    const share = (fat * 9) / 2000
    expect(share).toBeGreaterThanOrEqual(0.2)
    expect(share).toBeLessThanOrEqual(0.35)
  })

  /** Carbohydrate is the remainder, which is what makes the three add up. */
  it('adds up to the budget', () => {
    for (const kcal of [1200, 1500, 1840, 2310, 3000]) {
      const { carbs, protein, fat } = macroSplit(kcal, 70)
      expect(carbs * 4 + protein * 4 + fat * 9).toBeCloseTo(kcal, -1)
    }
  })

  it('leaves enough carbohydrate for a rice-based diet', () => {
    const { carbs, kcal } = computeTargets(woman)
    // Not the AMDR's 45% — high protein in grams squeezes it — but well clear of
    // a low-carb plan, which this app is not.
    expect((carbs * 4) / kcal).toBeGreaterThan(0.35)
  })
})

describe('the goal date', () => {
  it('is null when the target is already reached', () => {
    expect(goalDate(woman, 65, new Date('2026-01-01'))).toBeNull()
    expect(goalDate(woman, 64.6, new Date('2026-01-01'))).toBeNull()
  })

  /**
   * The reason this is walked a week at a time rather than divided. Dividing
   * uses one pace for the whole plan, and there isn't one: the last two
   * kilograms are tapered, and a body that has already lost weight burns less,
   * so the same percentage cap buys a smaller deficit every month.
   */
  it('never promises a date sooner than the plan can make it', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const weeks = Math.round((Number(goalDate(losing, 60, from)) - from.getTime()) / WEEK_MS)

    // The quickest this plan ever runs is at its heaviest, before the taper and
    // before maintenance falls with the weight it is computed from. Even the
    // deadband — arriving within half a kilo counts — cannot beat that.
    const quickest = Math.abs(weeklyPace({ ...losing, targetWeightKg: 50 }))
    expect(weeks).toBeGreaterThan((65 - 60 - 0.5) / quickest)
  })

  it('is further off the further the target is', () => {
    const from = new Date('2026-01-01T00:00:00Z')

    expect(Number(goalDate(losing, 62, from))).toBeLessThan(Number(goalDate(losing, 58, from)))
  })

  /** A target the plan cannot reach in five years is a null, not a date in 2071. */
  it('gives up rather than projecting a lifetime', () => {
    const far = { ...man, weightKg: 200 }
    expect(goalDate(far, 45, new Date('2026-01-01'))).toBeNull()
  })
})

/**
 * Structural, not behavioural — this cannot run SQL. It reads the function body
 * and checks that every constant this file asserts on also appears there, so
 * changing one copy and not the other fails here rather than in production.
 *
 * A blunt instrument on purpose. The alternative is a pgTAP test, which belongs
 * in `apps/supabase/tests` and cannot see this file; until one exists, matching
 * the numbers is what stops silent drift.
 */
describe('the database copy', () => {
  const sql = readFileSync(join(__dirname, '../../../../supabase/schemas/02_functions.sql'), 'utf8')
  const body = sql.slice(sql.indexOf('function public.compute_targets'))

  it.each([
    ['the nominal paces', 'when remaining < 0 then -0.5 else 0.25'],
    ['the energy in a kilogram', '7700 / 7'],
    ['the deficit cap', 'tdee * 0.2'],
    ['the surplus cap', 'tdee * 0.15'],
    ['the target deadband', 'abs(remaining) < 0.5'],
    ['the taper horizon', 'abs(remaining) / 4'],
    ['protein per kg', 'p_weight_kg * 1.6'],
    ['the protein ceiling', 'kcal * 0.35 / 4'],
    ['the fat share', 'kcal * 0.25 / 9'],
    ["the women's floor", '1200'],
    ["the men's floor", '1500'],
    ['the activity factors', '1.725'],
  ])('carries %s', (_name, fragment) => {
    expect(body).toContain(fragment)
  })

  /** The target weight has to reach the function at all, and be optional there. */
  it('takes the target weight, and takes null for an answer', () => {
    expect(body).toContain('p_target_weight_kg numeric default null')
    expect(body).toContain('p_target_weight_kg - p_weight_kg')
  })

  /**
   * The old split and the goal enum, in case a copy of either survives anywhere
   * in the function. `p_goal` especially: the direction is the sign of the gap
   * now, and a function still branching on a stored goal would be a second
   * source of the same fact — which is the thing this replaced.
   */
  it.each(['0.47', '0.22', '0.31', '-400', 'greatest(kcal, 1000)', 'p_goal', 'weight_goal'])(
    'no longer carries %s',
    (fragment) => {
      expect(body).not.toContain(fragment)
    },
  )
})

/**
 * The trigger that runs it.
 *
 * Structural for the same reason as the block above, and pinned for a specific
 * failure: `target_weight_kg` reaching `compute_targets` is worth nothing if the
 * write that changes it never fires the recompute. The column list on
 * `profiles_sync_daily_goals` is the whole of that decision, and it is exactly
 * the kind of line an edit to the function body leaves behind.
 */
describe('the recompute trigger', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/schemas/80_goals_sync.sql'),
    'utf8',
  )

  it('passes the target weight to the formula', () => {
    expect(sql).toContain('v_profile.target_weight_kg')
  })

  it('no longer reads a goal that no longer exists', () => {
    expect(sql).not.toContain('weight_goal')
  })

  it('fires on every input the formula reads', () => {
    const trigger = sql.slice(sql.indexOf('create trigger profiles_sync_daily_goals'))
    for (const column of ['sex', 'birth_date', 'height_cm', 'target_weight_kg', 'activity_level']) {
      expect(trigger).toContain(column)
    }
  })
})

/**
 * What one entry counts as.
 *
 * This arithmetic exists twice as well — here and in the `coalesce` inside
 * `food_log_details` — because the view answers for the diary and this answers
 * for the screen editing the entry, where an edit that has not reached the
 * database yet is still the truth on screen. The two disagreeing is a bug the
 * user sees as "the number changed when I went back".
 */
describe('entryTotals', () => {
  const portion = { kcal: 600, carbs: 70, protein: 25, fat: 22 }

  it('falls through to the portion when there is nothing else', () => {
    expect(entryTotals({ portion })).toEqual(portion)
  })

  it('sums the parts over the portion', () => {
    const parts = [
      { kcal: 340, carbs: 55, protein: 6, fat: 11 },
      { kcal: 254, carbs: 4, protein: 20, fat: 16 },
    ]
    expect(entryTotals({ parts, portion })).toEqual({
      kcal: 594,
      carbs: 59,
      protein: 26,
      fat: 27,
    })
  })

  it('takes a typed figure over both', () => {
    const parts = [{ kcal: 340, carbs: 55, protein: 6, fat: 11 }]
    expect(entryTotals({ typed: { kcal: 410 }, parts, portion }).kcal).toBe(410)
  })

  // Field by field, like the view: correcting the protein must not hand the
  // carbs back to the catalogue when the plate has a breakdown.
  it('leaves the fields nobody typed to the next source down', () => {
    const parts = [{ kcal: 340, carbs: 55, protein: 6, fat: 11 }]
    expect(entryTotals({ typed: { protein: 31.5 }, parts, portion })).toEqual({
      kcal: 340,
      carbs: 55,
      protein: 31.5,
      fat: 11,
    })
  })

  // An empty list is a dish the scan could not decompose, not a plate of
  // nothing — reading it as zero calories is the dangerous direction.
  it('treats no parts as no breakdown rather than as zero', () => {
    expect(entryTotals({ parts: [], portion })).toEqual(portion)
  })
})
