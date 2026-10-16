import { LABEL_GAP, spreadLabels } from '../axis'

/** Labels of one width centred on `count` equal columns across `span`. */
function columns(count: number, span: number, width: number) {
  const column = span / count
  return {
    centres: Array.from({ length: count }, (_, index) => column * (index + 0.5)),
    widths: Array.from({ length: count }, () => width),
  }
}

function overlaps(placed: ReturnType<typeof spreadLabels>) {
  return placed.some(
    (label, at) => at > 0 && label.left - (placed[at - 1].left + placed[at - 1].width) < LABEL_GAP,
  )
}

describe('spreadLabels', () => {
  it('keeps every label when they all fit', () => {
    const { centres, widths } = columns(7, 300, 20)
    expect(spreadLabels(centres, widths, 300).map((label) => label.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
  })

  it('labels thirteen weeks at both ends and in between', () => {
    const { centres, widths } = columns(13, 300, 36)
    const placed = spreadLabels(centres, widths, 300)
    const indices = placed.map((label) => label.index)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(12)
    expect(indices.length).toBeGreaterThan(2)
    expect(overlaps(placed)).toBe(false)
  })

  // Twenty sessions on the exercise chart: the step measured at the centres
  // fitted, and the first and last dates, pulled inside the axis, sat on
  // their neighbours.
  it('checks the gaps where the end labels land', () => {
    const { centres, widths } = columns(20, 274, 44)
    const placed = spreadLabels(centres, widths, 274)
    expect(placed[placed.length - 1].index).toBe(19)
    expect(overlaps(placed)).toBe(false)
    expect(placed[0].left).toBeGreaterThanOrEqual(0)
    const last = placed[placed.length - 1]
    expect(last.left + last.width).toBeLessThanOrEqual(274)
  })

  it('steps evenly back from the newest', () => {
    const { centres, widths } = columns(12, 300, 40)
    const indices = spreadLabels(centres, widths, 300).map((label) => label.index)
    const steps = indices.slice(1).map((index, at) => index - indices[at])
    // The first may be added with a shorter step, the rest are even.
    expect(new Set(steps.slice(indices[0] === 0 ? 1 : 0)).size).toBe(1)
  })

  it('falls back to the newest alone', () => {
    expect(spreadLabels([10, 20], [40, 40], 30).map((label) => label.index)).toEqual([1])
    expect(spreadLabels([], [], 100)).toEqual([])
  })
})
