import type { AxisTick } from './ChartScale'

/**
 * The numbers a y-axis is allowed to top out at, per power of ten.
 *
 * Every one of them halves into something a person reads without converting —
 * 2,400 gives 1,200; 2,500 would give 1,250, and a tick labelled "1.3k" that is
 * really 1,250 is an axis that lies by rounding. The
 * list is deliberately dense in the low end of each decade, because the
 * alternative to 1.2 and 1.4 is rounding a 1,150 kcal week up to 2,000 and
 * drawing it at half height.
 */
const NICE = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.4, 3, 4, 5, 6, 8, 10]

/**
 * The value the top of a chart stands for.
 *
 * Charts here used to scale to their own tallest column, which put that column
 * against the ceiling and made the top of the plot an unlabelled, unrepeatable
 * number. Rounding up to a nice figure is what lets the tick be written down —
 * and it leaves the tallest bar a little headroom, so a peak reads as a peak
 * rather than as a bar that ran out of card.
 */
export function niceCeiling(peak: number): number {
  if (!Number.isFinite(peak) || peak <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(peak))
  const step = NICE.find((nice) => peak <= nice * magnitude) ?? 10
  return step * magnitude
}

/**
 * "820", "1.2k", "12k".
 *
 * Thousands are abbreviated because the gutter is width taken from the bars:
 * "2,400" is a third wider than "2.4k" and says nothing more at a glance. The
 * decimal is dropped when it is zero, so a round figure never reads as a
 * measured one.
 */
export function axisNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded) < 1000) return String(rounded)
  return `${Number((rounded / 1000).toFixed(1))}k`
}

/**
 * The ticks for a chart topping out at `max`.
 *
 * Top-first, and the baseline is never one of them: every chart here draws its
 * columns from a visible bottom edge, and a "0" under that edge labels
 * something the reader can already see.
 *
 * Two divisions by default — the top and the middle. Three ticks on a 130pt
 * plot is a ruler, and the charts are meant to be read as shapes with a scale,
 * not as tables.
 */
export function axisTicks(
  max: number,
  {
    divisions = 2,
    format = axisNumber,
  }: { divisions?: number; format?: (value: number) => string } = {},
): AxisTick[] {
  return Array.from({ length: divisions }, (_, index) => {
    const at = (divisions - index) / divisions
    return { at, label: format(max * at) }
  })
}
