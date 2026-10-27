import { renderHook, waitFor } from '@testing-library/react-native'

import { useReportLinks } from '../useReportLinks'

/**
 * Where a report notification goes when it is tapped.
 *
 * Unit-tested rather than walked on a device, because an iOS simulator dismisses
 * a pushed banner instead of launching the app from it about as often as not.
 * What can be pinned is everything either side of the OS: that both kinds route,
 * that nothing else does, and that the launch response is answered once.
 *
 * The last of those bites. `getLastNotificationResponseAsync` returns the
 * launching tap every time it is asked, not once, so a hook that re-ran on a
 * remount would navigate again over whatever the user had opened in between.
 */

// `mock`-prefixed, which is the one naming rule a jest factory's closure has:
// anything else is refused as a possibly uninitialised variable.
const mockPush = jest.fn()
const mockListeners: ((response: unknown) => void)[] = []
const mockLaunch: { response: unknown } = { response: null }

const mockHref = (href: unknown) => (typeof href === 'string' ? href : JSON.stringify(href))
// The screen on top when a notification is tapped.
const mockRoute: { current?: { name: string; params?: object } } = {}
const mockNavigation = { isReady: () => true, getCurrentRoute: () => mockRoute.current }

jest.mock('expo-router', () => ({
  router: {
    push: (href: unknown) => mockPush(mockHref(href)),
    navigate: (href: unknown) => mockPush(`navigate ${mockHref(href)}`),
    replace: (href: unknown) => mockPush(`replace ${mockHref(href)}`),
    dismissTo: (href: string) => mockPush(`dismissTo ${href}`),
  },
  useNavigationContainerRef: () => mockNavigation,
}))

// A workout is running, for the notices that open the logger.
jest.mock('@/data/session', () => ({ useSession: () => ({ userId: 'u' }) }))
jest.mock('@/features/workouts/store', () => ({ getActiveWorkout: () => ({ id: 'w' }) }))
const mockLogger = { open: false }
// `openLogger`'s own choice, without its guard against a second tap.
jest.mock('@/features/workouts/loggerOpen', () => ({
  openLogger: (router: { push: (href: string) => void; dismissTo: (href: string) => void }) =>
    mockLogger.open ? router.dismissTo('/workout/active') : router.push('/workout/active'),
}))

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
      // Only if it is still there: an unmount's cleanup can run after the next
      // test has reset the list, and splice(-1) then removed that test's listener.
      remove: () => {
        const at = mockListeners.indexOf(fn)
        if (at >= 0) mockListeners.splice(at, 1)
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
  mockRoute.current = { name: 'today' }
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

it('takes a rest notice back to the logger already open, wherever it is in the stack', async () => {
  const { unmount } = await mount()
  mockListeners[0]?.(response('rest'))
  // No logger mounted: open one.
  expect(mockPush).toHaveBeenLastCalledWith('/workout/active')

  // One mounted, under the library say: go back to it rather than push another.
  mockLogger.open = true
  mockListeners[0]?.(response('rest'))
  expect(mockPush).toHaveBeenLastCalledWith('dismissTo /workout/active')
  mockLogger.open = false
  unmount()
})

it('answers the launching tap, and answers it once', async () => {
  mockLaunch.response = response('weekly')

  const first = await mount()
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/reviews/week-latest'))
  await first.unmount()

  // A second mount — a Fast Refresh, a re-render of the tabs — must not reopen
  // the review the user has since navigated away from.
  mockPush.mockReset()
  const second = await mount()
  await waitFor(() => expect(mockListeners.length).toBe(1))
  expect(mockPush).not.toHaveBeenCalled()
  await second.unmount()
})

const chatPush = (groupId: string) => ({
  notification: { request: { content: { data: { kind: 'group', groupId, chat: true } } } },
})
const chatHref = (id: string) =>
  JSON.stringify({ pathname: '/group/chat', params: { id, reply: '1' } })

it("opens a chat push on its group's thread in one push over whatever is showing", async () => {
  const { unmount } = await mount()
  mockListeners[0]?.(chatPush('g1'))

  // Not to Groups first: that popped, drew the board, then pushed the chat.
  expect(mockPush.mock.calls.map(([href]) => href)).toEqual([chatHref('g1')])
  unmount()
})

it('leaves the thread alone when it is already open, and swaps in another group', async () => {
  const { unmount } = await mount()
  mockRoute.current = { name: 'chat', params: { id: 'g1' } }
  mockListeners[0]?.(chatPush('g1'))
  expect(mockPush).not.toHaveBeenCalled()

  mockListeners[0]?.(chatPush('g2'))
  expect(mockPush.mock.calls.map(([href]) => href)).toEqual([`replace ${chatHref('g2')}`])
  unmount()
})
