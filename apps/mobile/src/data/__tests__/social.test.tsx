import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { persistOptions } from '@/lib/query'
import { keys } from '../keys'
import {
  type SocialPost,
  socialCursorArgs,
  socialPage,
  useSocialAction,
  useSocialFeed,
  useSocialPhoto,
  useSocialSearch,
} from '../social'

const mockRpc = jest.fn()
const mockInvoke = jest.fn()
const mockFrom = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))
jest.mock('../session', () => ({ useUserId: () => 'viewer' }))

function response(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error })
  return Object.assign(promise, { abortSignal: () => promise })
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
const rows = (start: number, length = 21) =>
  Array.from({ length }, (_, i) => ({ id: String(start + i), created_at: '2026-09-22T12:00:00Z' }))

beforeEach(() => {
  jest.clearAllMocks()
  onlineManager.setOnline(true)
  mockInvoke.mockResolvedValue({ data: { ok: true, status: 'approved' }, error: null })
  mockFrom.mockReturnValue({
    delete: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  })
})

it('keeps the sentinel for the next page and ends on an exactly full final page', () => {
  const page = socialPage(rows(0), (row) => ({ at: row.created_at, id: row.id }))
  expect(page.rows.map((row) => row.id)).toEqual(rows(0, 20).map((row) => row.id))
  expect(page.next).toEqual({ at: '2026-09-22T12:00:00Z', id: '19' })
  expect(socialPage(rows(0, 20), () => null).next).toBeNull()
  expect(socialPage([], () => null)).toEqual({ rows: [], next: null })
})

it('keeps both cursor components without parsing away timestamp precision', () => {
  expect(socialCursorArgs({ at: '2026-09-22T12:00:00.123456Z', id: 'post' })).toEqual({
    p_before_at: '2026-09-22T12:00:00.123456Z',
    p_before_id: 'post',
  })
  expect(socialCursorArgs(null)).toEqual({ p_before_at: null, p_before_id: null })
})

it('never persists social content while preserving the diary offline cache', () => {
  const { client } = setup()
  const socialKey = keys.socialRead('viewer', 'social_feed')
  const diaryKey = keys.day('viewer', '2026-09-22')
  client.setQueryData(socialKey, { posts: ['revocable'] })
  client.setQueryData(diaryKey, { entries: ['private'] })
  const social = client.getQueryCache().find({ queryKey: socialKey })
  const diary = client.getQueryCache().find({ queryKey: diaryKey })
  if (!social || !diary) throw new Error('missing query fixture')
  expect(persistOptions.dehydrateOptions.shouldDehydrateQuery(social)).toBe(false)
  expect(persistOptions.dehydrateOptions.shouldDehydrateQuery(diary)).toBe(true)
  client.clear()
})

it('sends handle pagination without timestamp parameters', async () => {
  mockRpc.mockImplementation(() => response([]))
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(() => useSocialSearch('rice'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(mockRpc).toHaveBeenCalledWith('social_search_profiles', {
    p_query: 'rice',
    p_after_handle: null,
    p_limit: 20,
  })
  await unmount()
  client.clear()
})

it('bounds retained pages and refreshes from the head after eviction', async () => {
  mockRpc.mockImplementation((_name, params) =>
    response(rows(params.p_before_id ? Number(params.p_before_id) + 1 : 0)),
  )
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(() => useSocialFeed('following'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() =>
      expect(result.current.data?.pages.at(-1)?.rows.at(-1)?.id).toBe(String((i + 2) * 20 - 1)),
    )
  }
  expect(result.current.data?.pages).toHaveLength(5)
  expect(result.current.data?.pages[0].rows[0].id).toBe('40')
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.data?.pages[0].rows[0].id).toBe('0'))
  expect(result.current.data?.pages).toHaveLength(1)
  await unmount()
  client.clear()
})

it('persists a committed comment when moderation is unavailable', async () => {
  mockRpc.mockImplementation(() => response('comment-id'))
  mockInvoke.mockResolvedValue({ data: null, error: new Error('unavailable') })
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  let saved: unknown
  await act(async () => {
    saved = await result.current.mutateAsync({
      action: 'comment',
      postId: 'post',
      body: 'Lovely lunch',
      requestId: 'stable-request',
    })
  })
  expect(saved).toEqual({ id: 'comment-id', status: 'pending' })
  expect(mockRpc).toHaveBeenCalledWith('create_social_comment', {
    p_post_id: 'post',
    p_body: 'Lovely lunch',
    p_request_id: 'stable-request',
  })
  await unmount()
  client.clear()
})

it('refuses offline actions immediately without queueing them', async () => {
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  onlineManager.setOnline(false)
  await act(async () => {
    await expect(
      result.current.mutateAsync({ action: 'like', id: 'post', liked: true }),
    ).rejects.toThrow('offline')
  })
  expect(mockRpc).not.toHaveBeenCalled()
  expect(result.current.isPaused).toBe(false)
  onlineManager.setOnline(true)
  await unmount()
  client.clear()
})

it.each([
  {
    name: 'like',
    action: { action: 'like', id: 'post', liked: true } as const,
    invalidated: ['social_feed', 'social_profile_posts', 'social_post'],
    preserved: ['social_notifications', 'unread', 'social_profile'],
  },
  {
    name: 'read',
    action: { action: 'read', ids: ['notification'] as string[] } as const,
    invalidated: ['social_notifications', 'unread'],
    preserved: ['social_feed', 'social_profile_posts', 'social_post'],
  },
  {
    name: 'follow',
    action: { action: 'follow', id: 'author', following: true } as const,
    invalidated: [
      'social_feed',
      'social_profile',
      'social_profile_posts',
      'social_post',
      'social_connections',
      'social_suggestions',
      'social_search_profiles',
    ],
    preserved: ['social_notifications', 'unread'],
  },
  {
    name: 'remove follower',
    action: { action: 'removeFollower', id: 'follower' } as const,
    invalidated: [
      'social_feed',
      'social_profile',
      'social_connections',
      'social_suggestions',
      'social_search_profiles',
      'social_notifications',
      'unread',
    ],
    preserved: ['social_profile_posts', 'social_post'],
  },
  {
    name: 'unblock',
    action: { action: 'unblock', id: 'author' } as const,
    invalidated: [
      'social_feed',
      'social_profile',
      'social_profile_posts',
      'social_post',
      'social_comments',
      'social_connections',
      'social_suggestions',
      'social_search_profiles',
      'social_blocked_profiles',
      'social_notifications',
      'unread',
    ],
    preserved: [],
  },
])(
  'invalidates only the intended social reads after $name',
  async ({ action, invalidated, preserved }) => {
    mockRpc.mockImplementation(() => response(null))
    const { client, wrapper } = setup()
    const socialKeys = Object.fromEntries(
      [...invalidated, ...preserved].map((name) => [name, keys.socialRead('viewer', name)]),
    )
    const photoKey = keys.socialRead('viewer', 'photo', { path: 'reviewed/photo.jpg' })
    const diaryKey = keys.day('viewer', '2026-09-22')
    for (const key of [...Object.values(socialKeys), photoKey, diaryKey]) {
      client.setQueryData(key, { fixture: true })
    }

    const { result, unmount } = await renderHook(useSocialAction, { wrapper })
    await act(async () => {
      await result.current.mutateAsync(action)
    })

    for (const name of invalidated) {
      expect(client.getQueryState(socialKeys[name])?.isInvalidated).toBe(true)
    }
    for (const name of preserved) {
      expect(client.getQueryState(socialKeys[name])?.isInvalidated).toBe(false)
    }
    expect(client.getQueryState(photoKey)?.isInvalidated).toBe(false)
    expect(client.getQueryState(diaryKey)?.isInvalidated).toBe(false)
    await unmount()
    client.clear()
  },
)

it('keeps loaded pages and retries the same cursor after the next page fails', async () => {
  let nextAttempts = 0
  mockRpc.mockImplementation((_name, params) => {
    if (!params.p_before_id) return response(rows(0))
    nextAttempts += 1
    if (nextAttempts <= 2) return response(null, new Error('page unavailable'))
    return response(rows(Number(params.p_before_id) + 1))
  })
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(() => useSocialFeed('following'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  await act(async () => {
    await result.current.fetchNextPage()
  })
  await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true))
  expect(result.current.data?.pages).toHaveLength(1)
  expect(result.current.data?.pages[0].rows.map((row) => row.id)).toEqual(
    rows(0, 20).map((row) => row.id),
  )

  await act(async () => {
    await result.current.fetchNextPage()
  })
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
  expect(result.current.data?.pages[0].rows[0].id).toBe('0')
  expect(result.current.data?.pages[1].rows[0].id).toBe('20')
  expect(
    mockRpc.mock.calls.slice(1).map(([, params]) => ({
      at: params.p_before_at,
      id: params.p_before_id,
    })),
  ).toEqual([
    { at: '2026-09-22T12:00:00Z', id: '19' },
    { at: '2026-09-22T12:00:00Z', id: '19' },
    { at: '2026-09-22T12:00:00Z', id: '19' },
  ])
  await unmount()
  client.clear()
})

it('clears cached public content after reporting instead of leaving it visible while stale', async () => {
  mockRpc.mockImplementation(() => response(null))
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  client.setQueryData(feedKey, {
    pages: [{ rows: [{ id: 'reported' } as SocialPost], next: null }],
    pageParams: [null],
  })
  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      action: 'report',
      kind: 'post',
      id: 'reported',
      reason: 'spam',
    })
  })
  expect(client.getQueryData(feedKey)).toBeUndefined()
  await unmount()
  client.clear()
})

it('batches the visible viewport with reviewed validators and no private photo scope', async () => {
  mockInvoke.mockResolvedValue({
    data: {
      ok: true,
      urls: { a: 'url-a', b: 'url-b' },
      headers: { a: { 'If-Match': 'etag-a' }, b: { 'If-Match': 'etag-b' } },
    },
    error: null,
  })
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(
    () => [useSocialPhoto('a', true), useSocialPhoto('b', true)],
    { wrapper },
  )
  await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true))
  expect(mockInvoke).toHaveBeenCalledTimes(1)
  expect(mockInvoke.mock.calls[0][1].body).toEqual({
    action: 'read',
    keys: ['a', 'b'],
    scope: 'social',
  })
  expect(result.current[1].data?.headers).toEqual({ 'If-Match': 'etag-b' })
  await unmount()
  client.clear()
})

it('aborts an in-flight signing batch after its last observer leaves', async () => {
  let signal: AbortSignal | undefined
  mockInvoke.mockImplementation((_name, options) => {
    signal = options.signal
    return new Promise((_resolve, reject) =>
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    )
  })
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(() => useSocialPhoto('a', true), { wrapper })
  await waitFor(() => expect(signal).toBeDefined())
  await unmount()
  expect(signal?.aborted).toBe(true)
  client.clear()
})
