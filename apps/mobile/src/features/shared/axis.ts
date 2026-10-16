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

/** The least room between two axis labels, so neighbours never touch. */
export const LABEL_GAP = 8

export type PlacedLabel = {
  /** Its position in the list passed in. */
  index: number
  /** Where its text starts, kept inside the axis. */
  left: number
  width: number
}

/**
 * Which of a row of axis labels to draw, and where, so that none overlaps:
 * evenly spaced, always the newest (the last), and the first as well when the
 * step lands on it or it fits. `centres` is where each label would sit, under
 * its own bar or point, and `widths` how wide it draws.
 *
 * The labels at the ends are pulled inside the axis, which moves them towards
 * their neighbours, so the spacing is checked where each one actually lands.
 * Checking it at the centres let two dates sit on each other at either end.
 */
export function spreadLabels(
  centres: readonly number[],
  widths: readonly number[],
  span: number,
  gap = LABEL_GAP,
): PlacedLabel[] {
  const count = centres.length
  if (!count) return []
  const place = (index: number): PlacedLabel => ({
    index,
    width: widths[index],
    left: Math.max(0, Math.min(span - widths[index], centres[index] - widths[index] / 2)),
  })
  const fits = (indices: readonly number[]) => {
    const placed = indices.map(place)
    return placed.every(
      (label, at) => at === 0 || label.left - (placed[at - 1].left + placed[at - 1].width) >= gap,
    )
  }
  const stepping = (step: number) => {
    const indices: number[] = []
    for (let index = count - 1; index >= 0; index -= step) indices.unshift(index)
    return indices
  }

  for (let step = 1; step < count; step++) {
    if (!fits(stepping(step))) continue
    // A step a little wider that lands on the first label as well, so the
    // axis is labelled at both ends with even gaps: thirteen weeks in fives
    // would leave the first unlabelled, and in sixes it does not.
    let chosen = step
    for (let wider = step; wider <= step * 1.5; wider++) {
      if ((count - 1) % wider === 0 && fits(stepping(wider))) {
        chosen = wider
        break
      }
    }
    const indices = stepping(chosen)
    if (indices[0] !== 0 && fits([0, ...indices])) indices.unshift(0)
    return indices.map(place)
  }
  return [place(count - 1)]
}
