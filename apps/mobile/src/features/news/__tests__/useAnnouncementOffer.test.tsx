import { act, render } from '@testing-library/react-native'
import { resetAnnouncementRunForTest, useAnnouncementOffer } from '../useAnnouncementOffer'

const mockFetchQuery = jest.fn()
const unseen = { onboarded_at: '2026-01-01T00:00:00Z', seen_announcements: [] as string[] }
const mockState = {
  focused: true,
  online: true,
  offered: true,
  profile: unseen,
}
jest.mock('expo-router', () => ({ useIsFocused: () => mockState.focused }))
jest.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => mockState.online },
  useQueryClient: () => ({ fetchQuery: mockFetchQuery }),
}))
jest.mock('@/data', () => ({
  useProfile: () => ({ data: mockState.profile }),
  useSession: () => ({ userId: 'me' }),
}))
jest.mock('@/data/profile', () => ({ fetchProfile: jest.fn() }))
jest.mock('@/data/keys', () => ({ keys: { profile: (id: string) => ['profile', id] } }))
jest.mock('@/features/tutorial/prompt', () => ({ tutorialOffered: () => mockState.offered }))

let latest: ReturnType<typeof useAnnouncementOffer> | null = null
function Probe() {
  latest = useAnnouncementOffer()
  return null
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  resetAnnouncementRunForTest()
  latest = null
  Object.assign(mockState, { focused: true, online: true, offered: true, profile: unseen })
  mockFetchQuery.mockResolvedValue(unseen)
})
afterEach(() => jest.useRealTimers())

it('puts the newest announcement up after a fresh read, without writing anything', async () => {
  await render(<Probe />)
  expect(latest?.announcement).toBeNull()
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(mockFetchQuery).toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: ['profile', 'me'], staleTime: 30_000 }),
  )
  expect(latest?.announcement?.id).toBe('groups_2026_10')
})

it('shows nothing when the fresh read says another phone has shown it', async () => {
  mockFetchQuery.mockResolvedValue({ ...unseen, seen_announcements: ['groups_2026_10'] })
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).toBeNull()
})

it('shows nothing when Today loses focus during the read', async () => {
  let finish: (value: typeof unseen) => void = () => undefined
  mockFetchQuery.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const view = await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  mockState.focused = false
  await view.rerender(<Probe />)
  await act(async () => finish(unseen))
  expect(latest?.announcement).toBeNull()
})

it('puts it up once per run of the app', async () => {
  const first = await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).not.toBeNull()
  await first.unmount()
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).toBeNull()
})

it('waits out the launch the tour is offered on, even once the tour marks itself', async () => {
  mockState.offered = false
  const view = await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  // The tour's toast has now marked itself offered, and a tab round trip
  // re-runs the effect. The card still waits for the next launch.
  mockState.offered = true
  mockState.focused = false
  await view.rerender(<Probe />)
  mockState.focused = true
  await view.rerender(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(mockFetchQuery).not.toHaveBeenCalled()
  expect(latest?.announcement).toBeNull()
})

it.each([
  [
    'the account has seen it',
    () => (mockState.profile = { ...unseen, seen_announcements: ['groups_2026_10'] }),
  ],
  ['the phone is offline', () => (mockState.online = false)],
  ['Today is under another screen', () => (mockState.focused = false)],
])('waits when %s', async (_label, arrange) => {
  arrange()
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(latest?.announcement).toBeNull()
})
