import { screen, userEvent } from '@testing-library/react-native'

import { render } from '@/test-utils'
import { MonthGrid } from '../MonthGrid'
import { YearGrid } from '../YearGrid'

/**
 * What is worth pinning about the two grids is the arithmetic, because the zoom
 * depends on it and nothing on screen would say it was wrong.
 *
 * A tap reports the centre of the cell it happened in, and that number is the pivot
 * the next level's animation scales around. Get it wrong and the zoom still plays —
 * it just grows out of the wrong place, which reads as "the animation is a bit off"
 * rather than as a bug with a cause. So: the geometry of the grid, and that the
 * origin a cell reports lands inside that cell.
 *
 * Widths come from `useWindowDimensions`, which under Jest is the 750x1334 the
 * preset reports rather than a real phone. The assertions are therefore about
 * relationships — this cell is right of that one, this row below that one — and not
 * about point values.
 */

const user = userEvent.setup()

const LOGGED = new Set(['2026-07-03', '2026-07-04'])

describe('MonthGrid', () => {
  const july = new Date(2026, 6, 15)

  it('draws whole weeks, starting on Monday', async () => {
    await render(
      <MonthGrid
        month={july}
        selected="2026-07-15"
        logged={LOGGED}
        today="2026-07-30"
        onPick={() => {}}
      />,
    )

    // 1 July 2026 is a Wednesday, so the grid opens on Monday 29 June and runs to
    // Sunday 2 August: five weeks, every row full.
    expect(screen.getByLabelText('Monday 29 June')).toBeOnTheScreen()
    expect(screen.getByLabelText('Sunday 2 August')).toBeOnTheScreen()
    expect(screen.getByLabelText('Wednesday 1 July')).toBeOnTheScreen()
  })

  it('reports a cell centre that moves right across a row and down between rows', async () => {
    const picks: Array<{ key: string; origin: { x: number; y: number } }> = []
    await render(
      <MonthGrid
        month={july}
        selected="2026-07-15"
        logged={LOGGED}
        today="2026-07-30"
        onPick={(key, origin) => picks.push({ key, origin })}
      />,
    )

    // Three days in the same week, then one in the next.
    await user.press(screen.getByLabelText('Monday 6 July'))
    await user.press(screen.getByLabelText('Wednesday 8 July'))
    await user.press(screen.getByLabelText('Monday 13 July'))

    const [first, second, third] = picks
    expect(first.key).toBe('2026-07-06')

    // Along the row: same y, increasing x.
    expect(second.origin.x).toBeGreaterThan(first.origin.x)
    expect(second.origin.y).toBeCloseTo(first.origin.y)

    // Down a row: same x, greater y.
    expect(third.origin.x).toBeCloseTo(first.origin.x)
    expect(third.origin.y).toBeGreaterThan(first.origin.y)
  })

  /** The pivot has to be inside the cell that was tapped, or the zoom is anchored elsewhere. */
  it('reports an origin inside the grid', async () => {
    let origin = { x: -1, y: -1 }
    await render(
      <MonthGrid
        month={july}
        selected="2026-07-15"
        logged={LOGGED}
        today="2026-07-30"
        onPick={(_key, at) => {
          origin = at
        }}
      />,
    )

    await user.press(screen.getByLabelText('Wednesday 1 July'))

    expect(origin.x).toBeGreaterThan(0)
    expect(origin.y).toBeGreaterThan(0)
  })
})

describe('YearGrid', () => {
  it('offers all twelve months', async () => {
    await render(<YearGrid year={2026} logged={LOGGED} onPick={() => {}} />)

    expect(screen.getByLabelText('January 2026')).toBeOnTheScreen()
    expect(screen.getByLabelText('December 2026')).toBeOnTheScreen()
  })

  it('lays the months out three across', async () => {
    const picks: Array<{ month: number; origin: { x: number; y: number } }> = []
    await render(
      <YearGrid
        year={2026}
        logged={LOGGED}
        onPick={(month, origin) => picks.push({ month, origin })}
      />,
    )

    await user.press(screen.getByLabelText('January 2026'))
    await user.press(screen.getByLabelText('March 2026'))
    await user.press(screen.getByLabelText('April 2026'))

    const [january, march, april] = picks

    // January and March share a row; April starts the next one.
    expect(march.origin.y).toBeCloseTo(january.origin.y)
    expect(march.origin.x).toBeGreaterThan(january.origin.x)
    expect(april.origin.x).toBeCloseTo(january.origin.x)
    expect(april.origin.y).toBeGreaterThan(january.origin.y)
  })
})
