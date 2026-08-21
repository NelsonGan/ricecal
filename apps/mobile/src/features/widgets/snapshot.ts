import type { WidgetSnapshot } from '@modules/ricecal-widgets'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Macros, Targets, WeighIn } from '@/data'
// The module, not the barrel. `features/progress`'s index reaches the charts,
// which reach the whole data layer and expo-router with it — and this file is
// pure arithmetic that a test should be able to import on its own. Deep imports
// are otherwise avoided here; this is the exception and the reason for it.
import { showChange, showWeight, type WeightUnit } from '@/lib/units'

/**
 * Today, flattened into the one document the home screen can read.
 *
 * PURE, and deliberately so: everything that decides what a widget says is in
 * here, where a test can reach it, rather than in Swift and Kotlin where it
 * would be two implementations to keep in step. The native side draws what this
 * produces and computes nothing — see the header of `types.ts` in the module.
 *
 * It also settles the questions the widgets are not allowed to answer for
 * themselves, because Today has already answered them and two surfaces about
 * one day must not disagree:
 *
 * - Movement extends the budget, unless the account turned that off.
 * - Over budget is a full bar, never a longer one.
 * - Whether a day reads as on track or a bit over.
 */

export type SnapshotInput = {
  /** The day being described, `yyyy-MM-dd`, in the phone's own zone. */
  date: string
  /** The app's appearance setting, which the widgets follow rather than the OS. */
  theme: 'light' | 'dark' | 'system'
  /** Null until onboarding computes one. Every calorie widget says so. */
  targets: Targets | null
  eaten: Macros
  /** Active calories credited to the day. Already zero when the setting is off. */
  burned: number
  waterMl: number
  waterGoalMl: number
  /** In the order the day happened, oldest first. */
  entries: Array<{ name: string; kcal: number }>
  /** Oldest first, as `useWeighIns` returns them. */
  weighIns: readonly WeighIn[]
  unit: WeightUnit
  now: number
}

/**
 * How many meals the large widget shows.
 *
 * Four, which is what the frame holds with the names still readable. The design
 * system's rule when something does not fit is to remove a card rather than
 * shrink the type, and this is that rule applied to a list: the fifth row goes,
 * not the type size.
 */
const MAX_ENTRIES = 4

/** Eight bars, which is two months, which is long enough for a trend to be one. */
const WEEKS = 8

export function buildWidgetSnapshot(input: SnapshotInput): WidgetSnapshot {
  const budget = (input.targets?.kcal ?? 0) + input.burned
  const left = budget - input.eaten.kcal
  const over = left < 0

  return {
    version: 1,
    updatedAt: input.now,
    date: input.date,
    theme: input.theme,
    hasBudget: input.targets !== null,
    kcal: {
      // The absolute value, with `over` carrying the sign. A widget that
      // printed "−148" would need a minus sign at 36pt beside a caption that
      // already says "over", which is the same fact drawn twice.
      left: count(Math.abs(left)),
      eaten: count(input.eaten.kcal),
      budget: count(budget),
      fraction: ratio(input.eaten.kcal, budget),
      over,
    },
    macros: {
      carbs: bar(input.eaten.carbs, input.targets?.carbs),
      protein: bar(input.eaten.protein, input.targets?.protein),
      fat: bar(input.eaten.fat, input.targets?.fat),
    },
    water: {
      ml: input.waterMl,
      goalMl: input.waterGoalMl,
      label: count(input.waterMl),
      goalLabel: `of ${count(input.waterGoalMl)} ml`,
      fraction: ratio(input.waterMl, input.waterGoalMl),
    },
    weight: weight(input),
    entries: input.entries.slice(-MAX_ENTRIES).map((entry) => ({
      name: entry.name,
      kcal: count(entry.kcal),
    })),
  }
}

/** A thousands separator, in the app's locale, on a rounded figure. */
const count = (value: number) => Math.round(value).toLocaleString()

/**
 * A fraction of a goal, clamped and safe against a goal of zero.
 *
 * Zero rather than one when there is no goal. A full bar would read as a day
 * completed, which is the opposite of what an account with no budget is.
 */
function ratio(value: number, goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return 0
  return Math.min(1, Math.max(0, value / goal))
}

/** One macro bar: how full, and the grams to write beside it. */
function bar(eaten: number, goal: number | undefined) {
  return { fraction: ratio(eaten, goal ?? 0), label: `${Math.round(eaten)}g` }
}

/**
 * The weight widget's figure and its eight bars.
 *
 * WEEKLY AVERAGES, NOT READINGS, and that is the whole feature. A scale moves a
 * kilogram overnight on water alone, so a home screen tile reporting the newest
 * number would report noise — and it would do it in the one place the user
 * cannot avoid seeing it.
 *
 * A week with no reading carries the previous week's average forward rather
 * than dropping out. The alternative is a chart whose bars are not evenly
 * spaced in time, which is a chart that lies about the shape of a trend; and
 * the alternative to THAT is a gap, which a bar chart cannot draw.
 */
function weight(input: SnapshotInput): WidgetSnapshot['weight'] {
  const averages = weeklyAverages(input.weighIns, input.date)
  if (averages.length === 0) return null

  const current = averages[averages.length - 1] as number
  const first = averages[0] as number
  const delta = current - first
  const change = showChange(delta, input.unit)

  return {
    value: showWeight(current, input.unit),
    unit: input.unit,
    // Empty rather than "0.0" for a window that has not moved. A pill saying
    // nothing changed is a pill worth not drawing, and `showChange` returns
    // "0.0" without a sign for exactly that case.
    change: change === '0.0' ? '' : `${change} ${input.unit}`,
    // Decided here rather than in Swift and Kotlin, for the reason the pill's
    // own note in `types.ts` gives: Trends already colours a gain kaya and a
    // loss pandan, and the widget has only the formatted string to go on.
    up: delta > 0,
    weeks: normalise(averages),
  }
}

/**
 * The last eight weeks, oldest first, one average each.
 *
 * Weeks are counted back from the day being described rather than from a
 * calendar Monday: what this chart is about is "the last two months", and a
 * partial first week at the left would be an average of one morning.
 */
function weeklyAverages(weighIns: readonly WeighIn[], date: string): number[] {
  if (weighIns.length === 0) return []

  const end = parseISO(date)
  const buckets: number[][] = Array.from({ length: WEEKS }, () => [])

  for (const reading of weighIns) {
    const back = differenceInCalendarDays(end, parseISO(reading.date))
    // Ahead of the day being described (a weigh-in recorded for tomorrow) or
    // older than the window. Neither belongs in a bar.
    if (back < 0 || back >= WEEKS * 7) continue
    const index = WEEKS - 1 - Math.floor(back / 7)
    ;(buckets[index] as number[]).push(reading.kg)
  }

  const averages: number[] = []
  let carried: number | undefined
  for (const bucket of buckets) {
    if (bucket.length > 0) {
      carried = bucket.reduce((sum, kg) => sum + kg, 0) / bucket.length
    }
    // Nothing yet: the account had not been weighed this far back, so the chart
    // starts later rather than at a fabricated value.
    if (carried !== undefined) averages.push(carried)
  }

  return averages
}

/**
 * Bars scaled against each other, not against zero.
 *
 * A weight chart drawn from zero is eight bars of the same height: the range
 * that matters is two or three kilograms out of seventy. What the widget shows
 * is the shape of the window, which is what somebody glancing at it is reading.
 *
 * A window that has not moved at all is drawn at half height throughout, which
 * says "flat" rather than dividing by nothing.
 */
function normalise(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max - min < 1e-6) return values.map(() => 0.5)
  return values.map((value) => (value - min) / (max - min))
}
