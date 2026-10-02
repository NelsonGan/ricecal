import { act, waitFor } from '@testing-library/react-native'

import { track } from '@/lib/analytics'
import { render } from '@/test-utils'
import { reportWidgets } from '../adoption'
import { WidgetSync } from '../WidgetSync'

/**
 * The native store is shared with a process that can act before React exists.
 * A cold launch starts with no user only because Supabase has not restored the
 * session yet, and clearing during that gap deletes the drink that launched it.
 */

const mockClearSnapshot = jest.fn()
const mockSetScheme = jest.fn()
const mockSetSnapshot = jest.fn()
const mockTakePending = jest.fn()
const mockInstalledWidgets = jest.fn()
const mockAddWater = jest.fn()
const mockSession: { current: { userId: string | null; loading: boolean } } = {
  current: { userId: null, loading: true },
}

jest.mock('@modules/ricecal-widgets', () => ({
  clearWidgetSnapshot: () => mockClearSnapshot(),
  installedWidgets: () => mockInstalledWidgets(),
  setWidgetScheme: (scheme: string) => mockSetScheme(scheme),
  setWidgetSnapshot: (snapshot: unknown) => mockSetSnapshot(snapshot),
  takePendingWidgetActions: () => mockTakePending(),
}))

jest.mock('@/data', () => ({
  useActivityDay: () => ({ data: { activeKcal: 0 }, isPending: false, isPaused: false }),
  useAddQueuedWater: () => ({ mutateAsync: mockAddWater }),
  useDay: () => ({ isPending: false, isPaused: false }),
  useDayLog: () => ({ entries: [], waterMl: 250 }),
  useSelectedDate: () => ({ todayKey: '2026-09-16' }),
  useSession: () => mockSession.current,
  useSettings: () => ({
    data: { activity_extends_budget: true },
    isPending: false,
    isPaused: false,
  }),
  useTargets: () => ({ data: null, isPending: false, isPaused: false }),
  useWeighIns: () => ({ data: [], isPending: false, isPaused: false }),
}))

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/lib/scheme', () => ({ appScheme: () => 'ricecal' }))
jest.mock('@/theme/useTheme', () => ({ useTheme: () => ({ preference: 'system' }) }))
jest.mock('../adoption', () => ({ reportWidgets: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.current = { userId: null, loading: true }
  mockTakePending.mockReturnValue([])
  mockInstalledWidgets.mockResolvedValue([])
  mockAddWater.mockResolvedValue(undefined)
})

it('keeps a widget drink while the cold-start session is still loading', async () => {
  const action = { type: 'water' as const, ml: 500, date: '2026-09-16', at: 1 }
  mockTakePending.mockReturnValue([action])

  const view = await render(<WidgetSync />)
  expect(mockClearSnapshot).not.toHaveBeenCalled()
  expect(mockTakePending).not.toHaveBeenCalled()

  mockSession.current = { userId: 'user-1', loading: false }
  await view.rerender(<WidgetSync />)

  await waitFor(() => expect(mockAddWater).toHaveBeenCalledWith({ ml: 500, date: '2026-09-16' }))
  expect(mockClearSnapshot).not.toHaveBeenCalled()
})

it('clears the widget after the session resolves signed out', async () => {
  const view = await render(<WidgetSync />)
  expect(mockClearSnapshot).not.toHaveBeenCalled()

  mockSession.current = { userId: null, loading: false }
  await view.rerender(<WidgetSync />)

  expect(mockClearSnapshot).toHaveBeenCalledTimes(1)
})

it('drops an installed-widget result belonging to the previous account', async () => {
  let resolveFirst!: (widgets: string[]) => void
  mockInstalledWidgets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
  )
  mockSession.current = { userId: 'first', loading: false }
  const view = await render(<WidgetSync />)

  mockSession.current = { userId: 'second', loading: false }
  await view.rerender(<WidgetSync />)
  await waitFor(() => expect(reportWidgets).toHaveBeenCalledWith([], 'second'))
  await act(async () => {
    resolveFirst(['water'])
  })

  expect(reportWidgets).toHaveBeenCalledTimes(1)
})

it('does not attribute an old widget drink to a new account', async () => {
  let finishDrink!: () => void
  mockAddWater.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishDrink = resolve
      }),
  )
  mockTakePending.mockReturnValueOnce([{ type: 'water', ml: 500, date: '2026-09-16', at: 1 }])
  mockSession.current = { userId: 'first', loading: false }
  const view = await render(<WidgetSync />)

  mockSession.current = { userId: 'second', loading: false }
  await view.rerender(<WidgetSync />)
  await act(async () => {
    finishDrink()
  })

  expect(track).not.toHaveBeenCalled()
})

it('does not revive a stale widget poll when an account returns', async () => {
  let resolveFirst!: (widgets: string[]) => void
  mockInstalledWidgets.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
  )
  mockSession.current = { userId: 'first', loading: false }
  const view = await render(<WidgetSync />)
  mockSession.current = { userId: 'second', loading: false }
  await view.rerender(<WidgetSync />)
  mockSession.current = { userId: 'first', loading: false }
  await view.rerender(<WidgetSync />)
  await waitFor(() => expect(reportWidgets).toHaveBeenCalledTimes(2))
  await act(async () => {
    resolveFirst(['water'])
  })

  expect(reportWidgets).toHaveBeenCalledTimes(2)
})
