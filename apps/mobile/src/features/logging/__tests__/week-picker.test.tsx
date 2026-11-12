import type { ReactElement } from 'react'
import { FlatList } from 'react-native'

import '@/i18n'
import { act, fireEvent, render, screen } from '@/test-utils'
import { WeekPicker } from '../WeekPicker'

/**
 * Which week of the strip keeps its dots current.
 *
 * Only the page on screen subscribes to its marks; the one beside it is drawn
 * once and catches up when it is swiped to. So the strip has to know which page
 * is showing, and the list only knows that as a position. A position read as a
 * date goes wrong the morning a new week starts: the list slides by a week, the
 * position on screen now holds the new week, and the date still names the old
 * one. The week on screen then never refreshed its dots again.
 */

const mockMarks: Array<{ from: string; onScreen: boolean }> = []
let mockToday = '2026-11-15' // a Sunday
let mockSelected = '2026-11-15'

jest.mock('@/data', () => {
  const { dateKey } = jest.requireActual('@/data/client')
  return {
    dateKey,
    useDayMarks: (from: string, _to: string, { onScreen }: { onScreen: boolean }) => {
      mockMarks.push({ from, onScreen })
      return { data: undefined, isSuccess: false }
    },
    usePrefetchActivityDays: () => {},
    usePrefetchDays: () => {},
    useSelectedDate: () => ({
      selectedDate: mockSelected,
      setSelectedDate: () => {},
      todayKey: mockToday,
    }),
    useSettings: () => ({ data: undefined }),
  }
})

const WIDTH = 350

beforeEach(() => {
  mockMarks.length = 0
  mockToday = '2026-11-15'
  mockSelected = '2026-11-15'
})

/** The first host element, depth first, whose props pass `test`. */
// biome-ignore lint/suspicious/noExplicitAny: a walk over RNTL's host tree
function findHost(test: (props: Record<string, unknown>) => boolean): any {
  // biome-ignore lint/suspicious/noExplicitAny: as above
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return undefined
    if (node.props && test(node.props)) return node
    for (const child of node.children ?? []) {
      const found = walk(child)
      if (found) return found
    }
    return undefined
  }
  return walk(screen.root)
}

/** The strip draws nothing until it has measured itself. */
async function layOut() {
  const strip = findHost((props) => typeof props.onLayout === 'function')
  await act(async () => {
    fireEvent(strip, 'layout', { nativeEvent: { layout: { width: WIDTH, height: 60 } } })
  })
}

/** What the last render said about one week. */
function lastFor(from: string) {
  return mockMarks.filter((call) => call.from === from).at(-1)
}

/** Every week a render since the last reset subscribed to. */
function subscribed() {
  return mockMarks.filter((call) => call.onScreen).map((call) => call.from)
}

/**
 * The app comes back to the front on Monday without the strip remounting. The
 * selection follows today unless a day was picked on purpose (`selected`).
 */
async function resumeOn(
  day: string,
  rerender: (ui: ReactElement) => Promise<void>,
  selected: string = day,
) {
  mockToday = day
  mockSelected = selected
  mockMarks.length = 0
  await rerender(<WeekPicker />)
}

it('keeps the current week subscribed after the app resumes into a new week', async () => {
  const { rerender } = await render(<WeekPicker />)
  await layOut()
  expect(lastFor('2026-11-09')?.onScreen).toBe(true)

  await resumeOn('2026-11-16', rerender)

  expect(lastFor('2026-11-16')?.onScreen).toBe(true)
  // And it is the only one: last week, if drawn at all, is drawn as the page beside.
  expect(subscribed()).not.toContain('2026-11-09')
})

it('opens on the week of an older selected day and keeps that one subscribed', async () => {
  // The calendar toggle can remount the strip with a day weeks back selected.
  mockSelected = '2026-10-28'
  await render(<WeekPicker />)
  await layOut()

  expect(lastFor('2026-10-26')?.onScreen).toBe(true)
  expect(subscribed()).not.toContain('2026-11-09')
})

it('keeps the week swiped to subscribed after the app resumes into a new week', async () => {
  const { rerender } = await render(<WeekPicker />)
  await layOut()
  // iOS reports where the pager came to rest as soon as it opens; a swipe does the same.
  const pager = findHost((props) => typeof props.onMomentumScrollEnd === 'function')
  await act(async () => {
    fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: WIDTH * 52, y: 0 } },
    })
  })

  await resumeOn('2026-11-16', rerender)

  expect(lastFor('2026-11-16')?.onScreen).toBe(true)
  expect(subscribed()).not.toContain('2026-11-09')
})

it('keeps a day picked on purpose on screen after the app resumes into a new week', async () => {
  // Friday picked on Sunday; the app comes back on Monday with Friday still picked.
  mockSelected = '2026-11-13'
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex')
  try {
    const { rerender } = await render(<WeekPicker />)
    await layOut()
    expect(lastFor('2026-11-09')?.onScreen).toBe(true)

    await resumeOn('2026-11-16', rerender, '2026-11-13')

    // Every week slid a place, so the pager has to follow Friday's week back
    // one, or the strip shows Monday's week with no day on it picked. (Jest's
    // list does not render what a scroll reaches, so this reads the order.)
    expect(subscribed()).not.toContain('2026-11-16')
    const pager = findHost((props) => typeof props.onMomentumScrollEnd === 'function')
    const weeks: string[] = pager.props.data
    expect(scrollToIndex).toHaveBeenLastCalledWith({
      index: weeks.indexOf('2026-11-09'),
      animated: false,
    })
  } finally {
    scrollToIndex.mockRestore()
  }
})

it('does not move the pager when the app resumes on a new day of the same week', async () => {
  mockSelected = '2026-11-10'
  mockToday = '2026-11-11'
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex')
  try {
    const { rerender } = await render(<WeekPicker />)
    await layOut()
    await resumeOn('2026-11-12', rerender, '2026-11-10')

    expect(scrollToIndex).not.toHaveBeenCalled()
    expect(lastFor('2026-11-09')?.onScreen).toBe(true)
  } finally {
    scrollToIndex.mockRestore()
  }
})

it('brings the strip back to this week when today is picked after swiping back', async () => {
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex')
  try {
    const { rerender } = await render(<WeekPicker />)
    await layOut()
    const pager = findHost((props) => typeof props.onMomentumScrollEnd === 'function')
    const weeks: string[] = pager.props.data
    // Two weeks back, and a day there picked.
    await act(async () => {
      fireEvent(pager, 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: WIDTH * weeks.indexOf('2026-10-26'), y: 0 } },
      })
    })
    mockSelected = '2026-10-28'
    await rerender(<WeekPicker />)
    expect(scrollToIndex).not.toHaveBeenCalled()

    // The button back to today.
    mockMarks.length = 0
    mockSelected = '2026-11-15'
    await rerender(<WeekPicker />)

    expect(scrollToIndex).toHaveBeenLastCalledWith({
      index: weeks.indexOf('2026-11-09'),
      animated: false,
    })
    expect(subscribed()).not.toContain('2026-10-26')
  } finally {
    scrollToIndex.mockRestore()
  }
})

it('stays on a week swiped to when nothing is picked there', async () => {
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex')
  try {
    const { rerender } = await render(<WeekPicker />)
    await layOut()
    const pager = findHost((props) => typeof props.onMomentumScrollEnd === 'function')
    const weeks: string[] = pager.props.data
    await act(async () => {
      fireEvent(pager, 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: WIDTH * weeks.indexOf('2026-10-26'), y: 0 } },
      })
    })
    mockMarks.length = 0
    await rerender(<WeekPicker />)

    expect(scrollToIndex).not.toHaveBeenCalled()
    expect(subscribed()).not.toContain('2026-11-09')
  } finally {
    scrollToIndex.mockRestore()
  }
})
