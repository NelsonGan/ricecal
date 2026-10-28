import { act, render } from '@testing-library/react-native'
import { openPaywall } from '@/data/refusals'
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
}
jest.mock('@/data', () => ({
  useSession: () => ({ userId: mockState.userId }),
  useEntitlement: () => mockState,
  useProfile: () => ({ data: { seen_announcements: [], target_weight_kg: 60 } }),
  useStreak: () => ({ current: 7, best: 7, isPending: false }),
  useWeighIns: () => ({ data: [] }),
}))
jest.mock('@/data/refusals', () => ({
  openPaywall: jest.fn(),
  proFeatureTitle: (feature: string) => `title:${feature}`,
  STREAK_MILESTONE_DAYS: 7,
}))
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

it('offers nothing without a milestone', async () => {
  mockState.milestone = null
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
  expect(markMilestone).not.toHaveBeenCalled()
})

it('waits out the two days since the last paywall, leaving the milestone owed', async () => {
  mockState.due = false
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1500))
  expect(openPaywall).not.toHaveBeenCalled()
  expect(markMilestone).not.toHaveBeenCalled()
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
