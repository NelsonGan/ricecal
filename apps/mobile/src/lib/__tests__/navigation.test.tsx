import { renderHook } from '@testing-library/react-native'

import { useBack, useDismissTo, useEnterApp } from '@/lib/navigation'

/**
 * Where a dismissal goes when there is nothing to dismiss.
 *
 * Pinned because getting it wrong is invisible in a stack and obvious nowhere
 * else: `back()` sends GO_BACK, which the TAB navigator will answer once the
 * stack is empty, and answering it means changing tab. Expo Router orders a
 * navigator's screens by the length of their route names and the tab router
 * goes "back" to the first of them, so `me` — two characters — was the tab
 * every stray GO_BACK in the app landed on. A pop cannot be answered that way,
 * which is why these helpers pop.
 */

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  canDismiss: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
}
const ROOT_STATE = {
  key: 'stack-root',
  index: 1,
  routeNames: ['(onboarding)', '(tabs)', 'paywall/welcome'],
  routes: [
    { key: '(onboarding)-1', name: '(onboarding)' },
    { key: 'paywall/welcome-2', name: 'paywall/welcome' },
  ],
  routeKeySeq: 2,
  type: 'stack',
  stale: false,
  // Names a route the reset drops, so it must not be copied across.
  history: [{ type: 'route', key: 'paywall/welcome-2' }],
}
const mockNavigation = { reset: jest.fn(), getState: jest.fn(() => ROOT_STATE) }
const mockUseNavigation = jest.fn((_path: string) => mockNavigation)

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: (path: string) => mockUseNavigation(path),
}))

beforeEach(() => {
  for (const fn of Object.values(mockRouter)) fn.mockReset()
  mockNavigation.reset.mockReset()
  mockUseNavigation.mockClear()
})

describe('useBack', () => {
  it('pops the stack when something is on it', async () => {
    mockRouter.canDismiss.mockReturnValue(true)

    const { result } = await renderHook(() => useBack('/today'))
    result.current()

    expect(mockRouter.dismiss).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  // The whole point: never `back()`, so a dismissal that arrives twice cannot
  // be picked up by the tabs underneath.
  it('never goes back', async () => {
    mockRouter.canDismiss.mockReturnValue(true)

    const { result } = await renderHook(() => useBack('/today'))
    result.current()

    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('goes to the fallback when the stack is empty', async () => {
    mockRouter.canDismiss.mockReturnValue(false)

    const { result } = await renderHook(() => useBack('/today'))
    result.current()

    expect(mockRouter.replace).toHaveBeenCalledWith('/today')
    expect(mockRouter.dismiss).not.toHaveBeenCalled()
  })

  // A second dismissal — the scrim and the handle both answering one gesture,
  // say — finds an empty stack and lands on the screen this dismissal named,
  // rather than on whichever tab the router considers first.
  it('is safe to call twice', async () => {
    mockRouter.canDismiss.mockReturnValueOnce(true).mockReturnValue(false)

    const { result } = await renderHook(() => useBack('/today'))
    result.current()
    result.current()

    expect(mockRouter.dismiss).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).toHaveBeenCalledWith('/today')
  })
})

describe('useDismissTo', () => {
  it('unwinds every modal and then names the tab', async () => {
    mockRouter.canDismiss.mockReturnValue(true)

    const { result } = await renderHook(() => useDismissTo('/today'))
    result.current()

    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1)
    expect(mockRouter.navigate).toHaveBeenCalledWith('/today')
  })

  it('falls back when nothing is presented', async () => {
    mockRouter.canDismiss.mockReturnValue(false)

    const { result } = await renderHook(() => useDismissTo('/today'))
    result.current()

    expect(mockRouter.replace).toHaveBeenCalledWith('/today')
  })
})

describe('useEnterApp', () => {
  it('replaces the root history in one navigation action', async () => {
    const { result } = await renderHook(() => useEnterApp())
    result.current()

    expect(mockUseNavigation).toHaveBeenCalledWith('/')
    // A complete state: SDK 58's router ignores a partial reset.
    expect(mockNavigation.reset).toHaveBeenCalledWith({
      key: 'stack-root',
      routeNames: ROOT_STATE.routeNames,
      routeKeySeq: 2,
      type: 'stack',
      index: 0,
      routes: [{ name: '(tabs)' }],
      stale: false,
    })
    expect(mockRouter.dismissAll).not.toHaveBeenCalled()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })
})
