import { renderHook, waitFor } from '@testing-library/react-native'

import { useReportLinks } from '../useReportLinks'

/**
 * Where a report notification goes when it is tapped.
 *
 * Unit-tested rather than walked on a device, because the tap itself cannot be
 * driven there: an iOS simulator dismisses a pushed banner instead of launching
 * the app from it about as often as not, so the one thing that would prove this
 * end to end is the one thing the simulator will not do reliably. What CAN be
 * pinned is everything either side of the OS — that both kinds route, that
 * nothing else does, and that the launch response is answered once.
 *
 * The last of those is the one that bites. `getLastNotificationResponseAsync`
 * returns the launching tap every time it is asked, not once, so a hook that
 * re-ran on a remount would navigate again — over whatever the user had opened
 * in between.
 */

// `mock`-prefixed, which is the one naming rule a jest factory's closure has:
// anything else is refused as a possibly uninitialised variable.
const mockPush = jest.fn()
const mockListeners: ((response: unknown) => void)[] = []
const mockLaunch: { response: unknown } = { response: null }

jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }))

jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: () => Promise.resolve(mockLaunch.response),
  // The real one forgets the launching tap; so does this, which is what the
  // second mount below relies on.
  clearLastNotificationResponse: () => {
    mockLaunch.response = null
  },
  addNotificationResponseReceivedListener: (fn: (response: unknown) => void) => {
    mockListeners.push(fn)
    return {
      remove: () => {
        mockListeners.splice(mockListeners.indexOf(fn), 1)
      },
    }
  },
}))

const response = (kind: string) => ({
  notification: { request: { content: { data: { kind } } } },
})

const mount = async () => renderHook(() => useReportLinks())

beforeEach(() => {
  mockPush.mockReset()
  mockListeners.length = 0
  mockLaunch.response = null
})

it('opens the newest weekly review from a weekly report', async () => {
  const { unmount } = await mount()
  mockListeners[0]?.(response('weekly'))

  expect(mockPush).toHaveBeenCalledWith('/reviews/week-latest')
  unmount()
})

it('and the newest monthly one from a monthly report', async () => {
  const { unmount } = await mount()
  mockListeners[0]?.(response('monthly'))

  expect(mockPush).toHaveBeenCalledWith('/reviews/month-latest')
  unmount()
})

it('leaves every other notification alone', async () => {
  const { unmount } = await mount()

  for (const kind of ['meal', 'water', 'weigh-in', 'scan']) mockListeners[0]?.(response(kind))
  // A notification with no data at all, which is what a malformed push is.
  mockListeners[0]?.({ notification: { request: { content: {} } } })

  expect(mockPush).not.toHaveBeenCalled()
  unmount()
})

it('answers the launching tap, and answers it once', async () => {
  mockLaunch.response = response('weekly')

  const first = await mount()
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/reviews/week-latest'))
  first.unmount()

  // A second mount — a Fast Refresh, a re-render of the tabs — must not reopen
  // the review the user has since navigated away from.
  mockPush.mockReset()
  const second = await mount()
  await waitFor(() => expect(mockListeners.length).toBe(1))
  expect(mockPush).not.toHaveBeenCalled()
  second.unmount()
})
