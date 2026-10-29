import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { keys } from '../keys'
import { useSeeAnnouncement } from '../profile'

const mockRpc = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => ({ maybeSingle: () => mockRpc(...args) }),
  },
}))
jest.mock('../session', () => ({ useUserId: () => 'me', useSession: () => ({ userId: 'me' }) }))

const before = { id: 'me', auto_post_foods: false, seen_announcements: [] as string[] }
const after = { ...before, auto_post_foods: true, seen_announcements: ['feed_auto_share_2026_10'] }

function setup() {
  const client = new QueryClient({
    // No garbage-collection timers, which would keep jest running after the file.
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
  })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const clients: QueryClient[] = []

beforeEach(() => jest.clearAllMocks())
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})

it('records the card in one call, and an older profile read cannot put the old row back', async () => {
  const { client, wrapper } = setup()
  const key = keys.profile('me')
  client.setQueryData(key, before)
  let resolveRead: ((row: typeof before) => void) | undefined
  const oldRead = client
    .fetchQuery({
      queryKey: key,
      queryFn: () => new Promise<typeof before>((resolve) => (resolveRead = resolve)),
    })
    .catch(() => undefined)
  mockRpc.mockResolvedValue({ data: after, error: null })

  const { result, unmount } = await renderHook(useSeeAnnouncement, { wrapper })
  await act(async () => {
    await result.current.mutateAsync([
      { id: 'feed_auto_share_2026_10', enables: { autoPostFoods: true } },
    ])
  })
  await unmount()

  expect(mockRpc).toHaveBeenCalledWith('see_announcements', {
    p_ids: ['feed_auto_share_2026_10'],
    p_auto_post_foods: true,
  })
  expect(client.getQueryData(key)).toEqual(after)
  resolveRead?.(before)
  await oldRead
  expect(client.getQueryData(key)).toEqual(after)
})

it('refetches rather than trusting the cache when another phone saw it first', async () => {
  const { client, wrapper } = setup()
  const key = keys.profile('me')
  client.setQueryData(key, before)
  mockRpc.mockResolvedValue({ data: null, error: null })

  const { result, unmount } = await renderHook(useSeeAnnouncement, { wrapper })
  await act(async () => {
    await result.current.mutateAsync([{ id: 'feed_auto_share_2026_10' }])
  })
  await unmount()

  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
})

it('claims a folded card one announcement at a time, each with its own switch', async () => {
  const { client, wrapper } = setup()
  const key = keys.profile('me')
  client.setQueryData(key, before)
  mockRpc.mockResolvedValue({ data: after, error: null })
  const { result, unmount } = await renderHook(useSeeAnnouncement, { wrapper })
  await act(async () => {
    await result.current.mutateAsync([
      { id: 'groups_2026_10' },
      { id: 'feed_auto_share_2026_10', enables: { autoPostFoods: true } },
    ])
  })
  await unmount()
  expect(mockRpc.mock.calls.map((call) => call[1])).toEqual([
    { p_ids: ['groups_2026_10'], p_auto_post_foods: undefined },
    { p_ids: ['feed_auto_share_2026_10'], p_auto_post_foods: true },
  ])
  expect(client.getQueryData(key)).toEqual(after)
})
