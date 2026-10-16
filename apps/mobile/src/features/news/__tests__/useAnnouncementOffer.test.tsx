import { act, render } from '@testing-library/react-native'
import { resetAnnouncementLaunchForTest, useAnnouncementOffer } from '../useAnnouncementOffer'

const mockClaim = jest.fn()
const mockSetQueryData = jest.fn()
const mockState = {
  focused: true,
  online: true,
  offered: true,
  profile: { onboarded_at: '2026-01-01T00:00:00Z', seen_announcements: [] as string[] },
}
jest.mock('expo-router', () => ({ useIsFocused: () => mockState.focused }))
jest.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => mockState.online },
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}))
jest.mock('@/data', () => ({
  claimAnnouncement: (...args: unknown[]) => mockClaim(...args),
  useProfile: () => ({ data: mockState.profile }),
  useSession: () => ({ userId: 'me' }),
}))
jest.mock('@/data/keys', () => ({ keys: { profile: (id: string) => ['profile', id] } }))
jest.mock('@/features/tutorial/prompt', () => ({ tutorialOffered: () => mockState.offered }))
jest.mock('@/lib/errors', () => ({ reportError: jest.fn() }))

let latest: ReturnType<typeof useAnnouncementOffer> | null = null
function Probe() {
  latest = useAnnouncementOffer()
  return null
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  resetAnnouncementLaunchForTest()
  latest = null
  mockState.focused = true
  mockState.online = true
  mockState.offered = true
  mockState.profile = { onboarded_at: '2026-01-01T00:00:00Z', seen_announcements: [] }
})
afterEach(() => jest.useRealTimers())

it('claims the newest announcement, switching auto post on, then shows it', async () => {
  const updated = { seen_announcements: ['feed_auto_share_2026_10'] }
  mockClaim.mockResolvedValue(updated)
  await render(<Probe />)
  expect(latest?.announcement).toBeNull()
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(mockClaim).toHaveBeenCalledWith('me', 'feed_auto_share_2026_10', { autoPostFoods: true })
  expect(mockSetQueryData).toHaveBeenCalledWith(['profile', 'me'], updated)
  expect(latest?.announcement?.id).toBe('feed_auto_share_2026_10')
})

it('shows nothing when another phone claimed it first', async () => {
  mockClaim.mockResolvedValue(null)
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).toBeNull()
})

it('shows nothing when the write fails, so a card never claims a change that did not land', async () => {
  mockClaim.mockRejectedValue(new Error('offline'))
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).toBeNull()
})

it.each([
  [
    'the account has seen it',
    () => (mockState.profile.seen_announcements = ['feed_auto_share_2026_10']),
  ],
  ['it is the launch the tutorial is offered on', () => (mockState.offered = false)],
  ['the phone is offline', () => (mockState.online = false)],
  ['Today is under another screen', () => (mockState.focused = false)],
])('waits when %s', async (_label, arrange) => {
  arrange()
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(mockClaim).not.toHaveBeenCalled()
})
