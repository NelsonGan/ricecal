import { act, render } from '@testing-library/react-native'
import { track } from '@/lib/analytics'
import { markPaywallSeen } from '../nudge'
import { useProNudge } from '../useProNudge'

const mockPush = jest.fn()
const mockRouter = { push: mockPush }
const mockState = {
  userId: 'first',
  entitled: false,
  loading: false,
  unknown: false,
  due: true,
  announcing: false,
  claimed: false,
}
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))
jest.mock('@/data', () => ({
  useSession: () => ({ userId: mockState.userId }),
  useEntitlement: () => mockState,
  useProfile: () => ({ data: { seen_announcements: [] } }),
}))
jest.mock('@/features/news/useAnnouncementOffer', () => ({
  announcementHasTheFloor: () => mockState.announcing,
  announcementClaimedThisLaunch: () => mockState.claimed,
}))
jest.mock('@/features/tutorial', () => ({ tutorialOffered: () => true }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('../nudge', () => ({ markPaywallSeen: jest.fn(), paywallDue: () => mockState.due }))

function Probe() {
  useProNudge()
  return null
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  Object.assign(mockState, {
    userId: 'first',
    entitled: false,
    loading: false,
    unknown: false,
    due: true,
    announcing: false,
    claimed: false,
  })
})
afterEach(() => jest.useRealTimers())

it('cancels a delayed offer when the customer becomes entitled', async () => {
  const view = await render(<Probe />)
  mockState.entitled = true
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(mockPush).not.toHaveBeenCalled()
  expect(track).not.toHaveBeenCalled()
})

it('does not consume the preceding account clock after an account switch', async () => {
  const view = await render(<Probe />)
  mockState.userId = 'second'
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(markPaywallSeen).toHaveBeenCalledTimes(1)
  expect(markPaywallSeen).toHaveBeenCalledWith('second')
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('does not show another nudge if a different paywall resets the clock during the delay', async () => {
  await render(<Probe />)
  mockState.due = false
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(mockPush).not.toHaveBeenCalled()
  expect(track).not.toHaveBeenCalled()
})

it('stands aside on a launch with an announcement due', async () => {
  mockState.announcing = true
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(mockPush).not.toHaveBeenCalled()
  expect(markPaywallSeen).not.toHaveBeenCalled()
})

it('does not push over an announcement claimed during the delay', async () => {
  await render(<Probe />)
  mockState.claimed = true
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(mockPush).not.toHaveBeenCalled()
  expect(track).not.toHaveBeenCalled()
})
