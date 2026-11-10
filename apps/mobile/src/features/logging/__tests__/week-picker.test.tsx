import type { ReactElement } from 'react'

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

/** The app comes back to the front on Monday without the strip remounting. */
async function resumeOn(day: string, rerender: (ui: ReactElement) => Promise<void>) {
  mockToday = day
  mockSelected = day
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
  expect(mockMarks.filter((call) => call.onScreen).map((call) => call.from)).not.toContain(
    '2026-11-09',
  )
})

it('opens on the week of an older selected day and keeps that one subscribed', async () => {
  // The calendar toggle can remount the strip with a day weeks back selected.
  mockSelected = '2026-10-28'
  await render(<WeekPicker />)
  await layOut()

  expect(lastFor('2026-10-26')?.onScreen).toBe(true)
  expect(lastFor('2026-11-09')).toBeUndefined()
})
