import { act, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import { openPaywall } from '@/data/refusals'
import { track } from '@/lib/analytics'
import { markMilestone, markPaywallSeen } from '../nudge'
import { useProNudge } from '../useProNudge'

const mockState = {
  userId: 'first',
  entitled: false,
  loading: false,
  unknown: false,
  due: true,
  announcing: false,
  milestone: 'nudge_streak' as string | null,
  streakPending: false,
}
jest.mock('@/data', () => ({
  useSession: () => ({ userId: mockState.userId }),
  useEntitlement: () => mockState,
  useProfile: () => ({ data: { seen_announcements: [], target_weight_kg: 60 } }),
  useStreak: () => ({ current: 7, best: 7, isPending: mockState.streakPending }),
  useWeighIns: () => ({ data: [] }),
}))
jest.mock('@/data/refusals', () => ({
  openPaywall: jest.fn(),
  proFeatureTitle: (feature: string) => `title:${feature}`,
  STREAK_MILESTONE_DAYS: 7,
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/ui', () => ({ useToast: () => ({ show: jest.fn() }) }))
jest.mock('@/features/news/useAnnouncementOffer', () => ({
  announcementHasTheFloor: () => mockState.announcing,
}))
jest.mock('@/features/tutorial', () => ({ tutorialOffered: () => true }))
jest.mock('../nudge', () => ({
  markPaywallSeen: jest.fn(),
  markMilestone: jest.fn(),
  paywallDue: () => mockState.due,
  milestoneDue: () => mockState.milestone,
}))

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
    milestone: 'nudge_streak',
    streakPending: false,
  })
})
afterEach(() => jest.useRealTimers())

it('offers Pro on a milestone, naming it, and marks it spent', async () => {
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).toHaveBeenCalledWith(expect.anything(), {
    title: 'title:nudge_streak',
    tone: 'success',
    feature: 'nudge_streak',
  })
  expect(markMilestone).toHaveBeenCalledWith('first', 'nudge_streak')
  expect(markPaywallSeen).toHaveBeenCalledWith('first')
})

it('makes the standing offer without a milestone: the paywall alone', async () => {
  mockState.milestone = null
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(track).toHaveBeenCalledWith('Paywall Shown', { screen: 'hard', trigger: 'nudge' })
  expect(router.push).toHaveBeenCalledWith('/paywall')
  expect(markPaywallSeen).toHaveBeenCalledWith('first')
  // No toast and no milestone spent: there is no news, only the price.
  expect(openPaywall).not.toHaveBeenCalled()
  expect(markMilestone).not.toHaveBeenCalled()
})

it('offers the milestone rather than the standing offer when one is due', async () => {
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).toHaveBeenCalledTimes(1)
  expect(router.push).not.toHaveBeenCalled()
})

it('books nothing until the streak has loaded', async () => {
  // Booked first, the standing offer would spend the two-day clock that a
  // streak milestone arriving a moment later was owed.
  mockState.streakPending = true
  const view = await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(router.push).not.toHaveBeenCalled()
  expect(openPaywall).not.toHaveBeenCalled()

  mockState.streakPending = false
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).toHaveBeenCalledTimes(1)
  expect(router.push).not.toHaveBeenCalled()
})

it('waits out the two days since the last paywall, leaving the milestone owed', async () => {
  mockState.due = false
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
  expect(markMilestone).not.toHaveBeenCalled()
})

it('waits out the two days for the standing offer too', async () => {
  mockState.milestone = null
  mockState.due = false
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(router.push).not.toHaveBeenCalled()
  expect(markPaywallSeen).not.toHaveBeenCalled()
})

it('cancels a delayed offer when the customer becomes entitled', async () => {
  const view = await render(<Probe />)
  mockState.entitled = true
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
})

it('does not consume the preceding account clock after an account switch', async () => {
  const view = await render(<Probe />)
  mockState.userId = 'second'
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(markPaywallSeen).toHaveBeenCalledTimes(1)
  expect(markPaywallSeen).toHaveBeenCalledWith('second')
  expect(openPaywall).toHaveBeenCalledTimes(1)
})

it('does not show another paywall if a different one resets the clock during the delay', async () => {
  await render(<Probe />)
  mockState.due = false
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
})

it('stands aside on a launch with an announcement due', async () => {
  mockState.announcing = true
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
  expect(markPaywallSeen).not.toHaveBeenCalled()
})

it('does not push over an announcement put up during the delay', async () => {
  const view = await render(<Probe />)
  mockState.announcing = true
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
})
