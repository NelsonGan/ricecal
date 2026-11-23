import type { Serving, Units } from '@/data/types'
import {
  convert,
  type FoodBasis,
  leadingAmount,
  MEASURES,
  type MeasureUnit,
  measureOf,
  roundedFor,
  stepFor,
  unitsFor,
} from '@/lib/measures'

/**
 * The food page's portion control, as arithmetic.
 *
 * A dish is logged as a count of one of its portions, `quantity × serving`, and
 * that is still all `food_logs` stores. A unit is a portion too ("100 g",
 * "1 tbsp", see `withMeasures`), so everything below is about how the control
 * READS one: in grams or spoons, rather than as "1.5 × 100 g".
 *
 * Apart from the screen so it can be tested without one.
 */

/** A portion's stepper: 0.25 to 20 of a dish, as before units existed. */
const PORTION = { step: 0.25, min: 0.25, max: 20 }

/** `food_logs.quantity` is `numeric(6, 2)`. */
const stored = (value: number) => Math.round(value * 100) / 100

export type PortionControl = {
  /** The unit this portion is, or null for a count of portions. */
  unit: MeasureUnit | null
  /** What the stepper shows: grams for "100 g", the count for "1 plate". */
  shown: number
  step: number
  min: number
  max: number
}

export function portionControl(
  serving: Pick<Serving, 'label'> | undefined,
  quantity: number,
): PortionControl {
  const measure = measureOf(serving?.label)
  if (!measure) return { unit: null, shown: quantity, ...PORTION }
  const { step, min, max } = stepFor(measure.unit)
  return {
    unit: measure.unit,
    shown: stored(quantity * measure.block),
    step,
    min,
    max,
  }
}

/** The quantity a stepper figure stands for. 155 on "100 g" is 1.55 of it. */
export function quantityFor(serving: Pick<Serving, 'label'> | undefined, shown: number): number {
  const measure = measureOf(serving?.label)
  return stored(measure ? shown / measure.block : shown)
}

/**
 * The quantity after the portion changes from `from` to `to`.
 *
 * Between two portions the count carries over, as it always has: two regular
 * plates becomes two large ones, because that is what picking "Large" means.
 *
 * Into or out of a UNIT the amount eaten carries over instead. Picking "g" on
 * one 350 g plate is asking what that plate is in grams, and the answer is 350,
 * not one gram. Every factor is relative to the same base serving, so the
 * conversion is two factors, or, where the dish says what it weighs (`basis`),
 * the weight itself.
 */
export function switchedQuantity(
  from: Pick<Serving, 'label' | 'factor'> | undefined,
  quantity: number,
  to: Pick<Serving, 'label' | 'factor'>,
  basis?: FoodBasis,
): number {
  const raw = convertedQuantity(from, quantity, to)
  if (raw === null) return quantity
  const toMeasure = measureOf(to.label)
  if (toMeasure) {
    // Inside one family the answer is arithmetic, not the ratio of two stored
    // factors: each factor is rounded to three places, and 1½ cups came out as
    // 24¼ tablespoons rather than 24.
    const fromMeasure = measureOf(from?.label)
    const family = MEASURES[toMeasure.unit].family
    // From a portion, the dish's own weight or volume when it has one, which is
    // what the "≈ 700 g" under the stepper reads. Through the factors, two
    // 350 g plates were 699 g: "100 g" of one is 0.2857, stored as 0.286.
    const per = family === 'weight' ? basis?.grams : basis?.ml
    const exact =
      fromMeasure && MEASURES[fromMeasure.unit].family === family
        ? convert(quantity * fromMeasure.block, fromMeasure.unit, toMeasure.unit)
        : !fromMeasure && per && from
          ? convert(per * from.factor * quantity, family === 'weight' ? 'g' : 'ml', toMeasure.unit)
          : raw * toMeasure.block
    const shown = roundedFor(toMeasure.unit, exact)
    return clampStored(stored(shown / toMeasure.block))
  }

  // Back to a count of portions: a quarter when the amount is within 2% of one,
  // since "1¼ plates" is what somebody means by 440 g of a 350 g plate. The
  // exact share otherwise, rather than moving what was eaten to fit a step.
  // 2%, the same rule as `roundedFor`, and inside `canSwitch`'s 2.5%: at 5% a
  // switch that would snap was also a switch `canSwitch` refused, and the plate
  // could not be picked back from 420 g at all.
  const quarter = Math.round(raw * 4) / 4
  const count = quarter > 0 && Math.abs(quarter - raw) <= raw * 0.02 ? quarter : stored(raw)
  return clampStored(count)
}

/** `food_logs.quantity`'s own check: above zero, at most 100, two decimals. */
const clampStored = (value: number) => Math.min(20, Math.max(0.01, value))

/**
 * The same amount in the other portion, before any rounding, or null where the
 * count carries over instead (two portions, neither a unit).
 */
function convertedQuantity(
  from: Pick<Serving, 'label' | 'factor'> | undefined,
  quantity: number,
  to: Pick<Serving, 'label' | 'factor'>,
): number | null {
  if (!measureOf(from?.label) && !measureOf(to.label)) return null
  if (!from || !(to.factor > 0)) return null
  return (from.factor * quantity) / to.factor
}

/**
 * Whether switching to `to` can hold what was eaten. Six kilograms is 400
 * tablespoons and the control stops at 20, so that chip is disabled rather
 * than tapped and quietly cut to a third: nothing on screen would say so.
 */
export function canSwitch(
  from: Pick<Serving, 'label' | 'factor'> | undefined,
  quantity: number,
  to: Pick<Serving, 'label' | 'factor'>,
  basis?: FoodBasis,
): boolean {
  const raw = convertedQuantity(from, quantity, to)
  if (raw === null) return true
  // Not past the ceiling of the control it would land in: 25 almonds switched
  // into a portion capped at 20 lost five on the first tap. 20 is also what
  // every build in a store will step, see `stepFor`.
  const toMeasure = measureOf(to.label)
  const ceiling = toMeasure ? stepFor(toMeasure.unit).max / toMeasure.block : PORTION.max
  if (raw < 0.005 || raw > ceiling + 1e-9) return false
  // And without moving what was eaten by more than a measuring cup's worth. The
  // quantity keeps two decimals, so an eighth of a cup is stored as 0.13 and
  // counts 4% more than the 2 tbsp it was converted from; a switch that would
  // jump the calories like that is not offered.
  const eaten = (from?.factor ?? 1) * quantity
  const after = to.factor * switchedQuantity(from, quantity, to, basis)
  return eaten <= 0 || Math.abs(after - eaten) <= eaten * 0.025
}

/**
 * The chips under the stepper, as two rows: the catalogue's own portions, then
 * the units. Units come in the order `unitsFor` gives them for this person's
 * unit system, and only those, except that the one in use always shows, so an
 * entry logged in ounces on somebody else's phone still has its chip selected.
 */
export function portionChips<T extends Pick<Serving, 'id' | 'label'>>(
  servings: readonly T[],
  units: Units | undefined,
  selectedId: string,
): { portions: T[]; measures: Array<{ serving: T; unit: MeasureUnit }> } {
  const order = unitsFor(units, 'diary')
  const portions: T[] = []
  const measures: Array<{ serving: T; unit: MeasureUnit }> = []
  for (const serving of servings) {
    const measure = measureOf(serving.label)
    if (!measure) {
      portions.push(serving)
      continue
    }
    if (!order.includes(measure.unit) && serving.id !== selectedId) continue
    // One chip per unit. A catalogue that lists "100 g" twice would otherwise
    // draw two identical chips; the selected one wins, then the first.
    const twin = measures.findIndex((m) => m.unit === measure.unit)
    if (twin < 0) measures.push({ serving, unit: measure.unit })
    else if (serving.id === selectedId) measures[twin] = { serving, unit: measure.unit }
  }
  const rank = (unit: MeasureUnit) => {
    const at = order.indexOf(unit)
    return at < 0 ? order.length : at
  }
  measures.sort((a, b) => rank(a.unit) - rank(b.unit))
  return { portions, measures }
}

/**
 * The portion a new log opens on, when the dish's own serving is nothing but a
 * kitchen measure: "2 tbsp (32 g)" opens as 2 tbsp rather than "1" over a
 * "2 tbsp" label, which reads as one of something and means two. Only when the
 * measure lands on a quarter: a "1 cup (250 ml)" serving is 1.06 of the US cup
 * the units use, and opening on that would be stranger than the serving itself.
 */
export function openingPortion(
  servings: readonly Pick<Serving, 'id' | 'label' | 'factor'>[],
  baseLabel: string,
  units: Units | undefined,
): { id: string; quantity: number } | null {
  const lead = leadingAmount(baseLabel)
  if (!lead || measureOf(baseLabel)) return null
  // Not in a unit this person's system leaves out: a "3 oz" serving on a metric
  // phone opens on the serving, as the recipe picker opens it in grams.
  if (!unitsFor(units, 'diary').includes(lead.unit)) return null
  const option = servings.find((s) => measureOf(s.label)?.unit === lead.unit)
  const measure = measureOf(option?.label)
  if (!option || !measure || !(option.factor > 0)) return null
  const shown = roundedFor(measure.unit, (1 / option.factor) * measure.block)
  const onQuarter = Math.abs(shown * 4 - Math.round(shown * 4)) < 1e-9
  return onQuarter && shown > 0 ? { id: option.id, quantity: stored(shown / measure.block) } : null
}

/**
 * The portion this person last logged a dish at, for a new log of it.
 *
 * People eat the same things the same way: two spoons of peanut butter, 150 g of
 * rice. Calorie trackers that are quick to use remember it (a favourite's
 * serving, the "most used" amount) rather than opening on the catalogue's
 * default every time. Read from the newest entry of the same catalogue food,
 * and only if that portion is still one the dish offers. A plate that was
 * broken into parts is not a portion of the dish any more, and is skipped.
 */
export function rememberedPortion(
  foodId: string,
  servings: readonly Pick<Serving, 'id'>[],
  recent: readonly {
    foodId?: string
    servingId?: string
    quantity: number
    ingredientCount?: number
  }[],
): { id: string; quantity: number } | null {
  const last = recent.find((entry) => entry.foodId === foodId && !(entry.ingredientCount ?? 0))
  if (!last?.servingId || !servings.some((s) => s.id === last.servingId)) return null
  return { id: last.servingId, quantity: last.quantity }
}
