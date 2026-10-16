/**
 * About how wide an axis label's character draws at `micro` (11pt): a full em
 * for CJK, Hangul and kana, a narrow space, and roughly 6.5pt for the rest.
 * An estimate, shared by `TrendLine` and `BarChart`'s scale gutter: it only
 * has to say whether a row of labels fits, not lay one out.
 */
const LABEL_CHAR = 6.5
const LABEL_WIDE = 11
const LABEL_SPACE = 3
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/

export function labelWidth(label: string): number {
  let width = 0
  for (const char of label) {
    width += char === ' ' ? LABEL_SPACE : WIDE.test(char) ? LABEL_WIDE : LABEL_CHAR
  }
  return width
}

/**
 * Round steps from zero to just above `peak`, about three of them: 1, 2, 2.5
 * or 5 times a power of ten of `unit`, and never less than one unit, so a
 * count of workouts is not ruled in halves.
 */
export function axisTicks(peak: number, unit = 1): number[] {
  if (peak <= 0) return []
  const rough = peak / unit / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  // No 2.5 below ten units: "2.5 workouts" is not a number anybody counts in.
  const nice = power >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]
  const step = Math.max(1, (nice.find((each) => each * power >= rough) ?? 10) * power)
  const ticks: number[] = []
  for (let tick = 0; ticks.length === 0 || ticks[ticks.length - 1] < peak / unit - 1e-9; ) {
    tick += step
    ticks.push(tick)
  }
  return [0, ...ticks].map((tick) => tick * unit)
}
