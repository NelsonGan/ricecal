import { fromKg, toKg, type WeightUnit } from '@/lib/units'
import type { LiveExercise, SetPlan } from './model'

/**
 * Warm-up sets ramping up to the first working weight: 40% for 10, 60% for 5,
 * 80% for 3, the ladder most strength programs print. Each rounded down to
 * what can be loaded (2.5 kg or 5 lb, the smallest pair of plates), and any
 * step that rounds to nothing, or on a barbell to less than the bar itself
 * (a 15 kg warm-up on a 20 kg bar), is dropped.
 */

const STEPS = [
  { share: 0.4, reps: 10 },
  { share: 0.6, reps: 5 },
  { share: 0.8, reps: 3 },
] as const

export function warmupSets(
  exercise: LiveExercise,
  unit: WeightUnit,
  /** The working weight when no set has one typed: what the first set offers. */
  { workingKg = null, barbell = false }: { workingKg?: number | null; barbell?: boolean } = {},
): SetPlan[] {
  const typed = exercise.sets.find(
    (set) => set.kind !== 'warmup' && set.weightKg && set.weightKg > 0,
  )?.weightKg
  const kg = typed ?? workingKg
  if (!kg || kg <= 0) return []
  const step = unit === 'lb' ? 5 : 2.5
  const bar = barbell ? (unit === 'lb' ? 45 : 20) : 0
  const target = fromKg(kg, unit)

  const out: SetPlan[] = []
  let last = 0
  for (const { share, reps } of STEPS) {
    const value = Math.floor((target * share) / step) * step
    if (value <= 0 || value < bar || value <= last || value >= target) continue
    last = value
    // To the database's two places, as a typed weight is: 95 lb unrounded is
    // 43.0912… kg, which then reads back as a different figure.
    out.push({ kind: 'warmup', weightKg: Math.round(toKg(value, unit) * 100) / 100, reps })
  }
  return out
}

/**
 * The plates for one side of a bar, heaviest first, from a full gym's set.
 * Null when the weight is below the bar or cannot be made with these plates.
 */
const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
} as const

export function platesFor(total: number, bar: number, unit: WeightUnit): number[] | null {
  if (total < bar) return null
  let side = Math.round(((total - bar) / 2) * 1000) / 1000
  const out: number[] = []
  for (const plate of PLATES[unit]) {
    while (side >= plate - 1e-9) {
      out.push(plate)
      side = Math.round((side - plate) * 1000) / 1000
    }
  }
  return side > 1e-6 ? null : out
}
