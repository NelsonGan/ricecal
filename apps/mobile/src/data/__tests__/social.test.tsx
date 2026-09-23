import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { persistOptions } from '@/lib/query'
import { keys } from '../keys'
import {
  type SocialPage,
  type SocialPost,
  socialCursorArgs,
  socialEntryPost,
  socialPage,
  useSocialAction,
  useSocialFeed,
  useSocialPhoto,
  useSocialSearch,
  useSocialUnread,
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
function deferredResponse() {
  let settle!: (result: { data: unknown; error: unknown }) => void
  const promise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
    settle = resolve
  })
  return { request: Object.assign(promise, { abortSignal: () => promise }), settle }
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

it('publishes a post without calling the review function', async () => {
  mockRpc.mockImplementation(() => response('post-id'))
  mockInvoke.mockResolvedValue({ data: null, error: new Error('unavailable') })
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  let saved: unknown
  await act(async () => {
    saved = await result.current.mutateAsync({
      action: 'post',
      entryId: 'entry',
      caption: '',
      audience: 'public',
    })
  })
  expect(saved).toEqual({ id: 'post-id', status: 'approved' })
  expect(mockInvoke).not.toHaveBeenCalled()
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

it('reads the missed notification count for the feed badge', async () => {
  mockRpc.mockImplementation(() => response(7))
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(() => useSocialUnread(true), { wrapper })
  await waitFor(() => expect(result.current.data).toBe(7))
  expect(mockRpc).toHaveBeenCalledWith('social_unread_notification_count', undefined)
  await unmount()
  client.clear()
})

it('does not ask for the unread count while the feed is off screen', async () => {
  jest.useFakeTimers()
  mockRpc.mockImplementation(() => response(3))
  const { client, wrapper } = setup()
  const { result, rerender, unmount } = await renderHook(
    ({ active }: { active: boolean }) => useSocialUnread(active),
    { wrapper, initialProps: { active: true } },
  )
  await waitFor(() => expect(result.current.data).toBe(3))
  await rerender({ active: false })
  await act(async () => {
    jest.advanceTimersByTime(5 * 60_000)
  })
  expect(mockRpc).toHaveBeenCalledTimes(1)
  expect(result.current.data).toBe(3)
  // Coming back to a stale badge asks once.
  await rerender({ active: true })
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2))
  await unmount()
  client.clear()
  jest.useRealTimers()
})

it('draws a like on every cached copy of the post without refetching a feed', async () => {
  mockRpc.mockImplementation(() => response(null))
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  const postKey = keys.socialRead('viewer', 'social_post', { id: 'post' })
  const liked = { id: 'post', is_liked: false, like_count: 4 } as SocialPost
  const other = { id: 'other', is_liked: false, like_count: 1 } as SocialPost
  client.setQueryData(feedKey, {
    pages: [{ rows: [liked, other], next: null }],
    pageParams: [null],
  })
  client.setQueryData(postKey, liked)

  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ action: 'like', id: 'post', liked: true })
  })

  expect(mockRpc).toHaveBeenCalledWith('set_social_like', { p_post_id: 'post', p_liked: true })
  expect(client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows).toEqual([
    expect.objectContaining({ id: 'post', is_liked: true, like_count: 5 }),
    expect.objectContaining({ id: 'other', is_liked: false, like_count: 1 }),
  ])
  expect(client.getQueryData(postKey)).toEqual(
    expect.objectContaining({ is_liked: true, like_count: 5 }),
  )
  expect(client.getQueryState(feedKey)?.isInvalidated).toBe(false)
  expect(client.getQueryState(postKey)?.isInvalidated).toBe(false)
  await unmount()
  client.clear()
})

it('keeps a successful like when an older feed request finishes late', async () => {
  mockRpc.mockImplementation(() => response(null))
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  const stale = { id: 'post', is_liked: false, like_count: 4 } as SocialPost
  client.setQueryData(feedKey, {
    pages: [{ rows: [stale], next: null }],
    pageParams: [null],
  })

  let release: (() => void) | undefined
  let aborted = false
  const lateFetch = client
    .fetchInfiniteQuery({
      queryKey: feedKey,
      initialPageParam: null,
      queryFn: ({ signal }) =>
        new Promise<SocialPage<SocialPost>>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
          })
          release = () => resolve({ rows: [stale], next: null })
        }),
      getNextPageParam: () => undefined,
    })
    .catch(() => undefined)
  await waitFor(() => expect(client.getQueryState(feedKey)?.fetchStatus).toBe('fetching'))

  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ action: 'like', id: 'post', liked: true })
  })
  expect(aborted).toBe(true)

  // Even if the transport delivers its stale response after cancellation,
  // React Query must not let that response replace the successful Like.
  release?.()
  await lateFetch
  expect(
    client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
  ).toEqual(expect.objectContaining({ is_liked: true, like_count: 5 }))

  await unmount()
  client.clear()
})

it('puts a like back when the server refuses it', async () => {
  mockRpc.mockImplementation(() => response(null, new Error('Post unavailable')))
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'discover' })
  const post = { id: 'post', is_liked: true, like_count: 2 } as SocialPost
  client.setQueryData(feedKey, { pages: [{ rows: [post], next: null }], pageParams: [null] })

  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await expect(
      result.current.mutateAsync({ action: 'like', id: 'post', liked: false }),
    ).rejects.toThrow('Post unavailable')
  })
  expect(
    client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
  ).toEqual(expect.objectContaining({ is_liked: true, like_count: 2 }))
  await unmount()
  client.clear()
})

it('rolls back only the failed post while another Like succeeds', async () => {
  const firstRequest = deferredResponse()
  const secondRequest = deferredResponse()
  mockRpc.mockImplementation((_name, params) =>
    params.p_post_id === 'first' ? firstRequest.request : secondRequest.request,
  )
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'discover' })
  const first = { id: 'first', is_liked: false, like_count: 4 } as SocialPost
  const second = { id: 'second', is_liked: false, like_count: 8 } as SocialPost
  client.setQueryData(feedKey, {
    pages: [{ rows: [first, second], next: null }],
    pageParams: [null],
  })

  const firstHook = await renderHook(useSocialAction, { wrapper })
  const secondHook = await renderHook(useSocialAction, { wrapper })
  let firstMutation!: Promise<unknown>
  let secondMutation!: Promise<unknown>
  await act(async () => {
    firstMutation = firstHook.result.current
      .mutateAsync({ action: 'like', id: 'first', liked: true })
      .catch((error) => error)
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
    ).toEqual(expect.objectContaining({ is_liked: true, like_count: 5 })),
  )
  await act(async () => {
    secondMutation = secondHook.result.current.mutateAsync({
      action: 'like',
      id: 'second',
      liked: true,
    })
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[1],
    ).toEqual(expect.objectContaining({ is_liked: true, like_count: 9 })),
  )

  await act(async () => {
    secondRequest.settle({ data: null, error: null })
    await secondMutation
  })
  await act(async () => {
    firstRequest.settle({ data: null, error: new Error('Post unavailable') })
    await firstMutation
  })

  expect(client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows).toEqual([
    expect.objectContaining({ id: 'first', is_liked: false, like_count: 4 }),
    expect.objectContaining({ id: 'second', is_liked: true, like_count: 9 }),
  ])
  await firstHook.unmount()
  await secondHook.unmount()
  client.clear()
})

it('sends same-post Likes in tap order and keeps the newer choice after a failure', async () => {
  const olderRequest = deferredResponse()
  const newerRequest = deferredResponse()
  mockRpc
    .mockImplementationOnce(() => olderRequest.request)
    .mockImplementationOnce(() => newerRequest.request)
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'discover' })
  const post = { id: 'post', is_liked: false, like_count: 4 } as SocialPost
  client.setQueryData(feedKey, { pages: [{ rows: [post], next: null }], pageParams: [null] })

  const older = await renderHook(useSocialAction, { wrapper })
  const newer = await renderHook(useSocialAction, { wrapper })
  let olderMutation!: Promise<unknown>
  let newerMutation!: Promise<unknown>
  await act(async () => {
    olderMutation = older.result.current
      .mutateAsync({ action: 'like', id: 'post', liked: true })
      .catch((error) => error)
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
    ).toEqual(expect.objectContaining({ is_liked: true, like_count: 5 })),
  )
  await act(async () => {
    newerMutation = newer.result.current.mutateAsync({
      action: 'like',
      id: 'post',
      liked: false,
    })
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
    ).toEqual(expect.objectContaining({ is_liked: false, like_count: 4 })),
  )

  // The Unlike is already visible, but it cannot overtake the older Like on
  // the wire. It starts only after that request settles, even when it fails.
  expect(mockRpc).toHaveBeenCalledTimes(1)
  expect(mockRpc.mock.calls[0][1]).toEqual({ p_post_id: 'post', p_liked: true })
  await act(async () => {
    olderRequest.settle({ data: null, error: new Error('Post unavailable') })
    await olderMutation
  })
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2))
  expect(mockRpc.mock.calls[1][1]).toEqual({ p_post_id: 'post', p_liked: false })
  await act(async () => {
    newerRequest.settle({ data: null, error: null })
    await newerMutation
  })

  expect(
    client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
  ).toEqual(expect.objectContaining({ is_liked: false, like_count: 4 }))
  await older.unmount()
  await newer.unmount()
  client.clear()
})

it('refreshes only the commented post and counts an approved comment in place', async () => {
  mockRpc.mockImplementation(() => response('comment-id'))
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  const commentsKey = keys.socialRead('viewer', 'social_comments', { p_post_id: 'post' })
  const otherCommentsKey = keys.socialRead('viewer', 'social_comments', { p_post_id: 'other' })
  const postKey = keys.socialRead('viewer', 'social_post', { id: 'post' })
  const post = { id: 'post', comment_count: 1 } as SocialPost
  client.setQueryData(feedKey, { pages: [{ rows: [post], next: null }], pageParams: [null] })
  for (const key of [commentsKey, otherCommentsKey, postKey]) {
    client.setQueryData(key, { fixture: true })
  }

  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      action: 'comment',
      postId: 'post',
      body: 'Looks good',
      requestId: 'request',
    })
  })

  expect(
    client.getQueryData<{ pages: SocialPage<SocialPost>[] }>(feedKey)?.pages[0].rows[0],
  ).toEqual(expect.objectContaining({ comment_count: 2 }))
  expect(client.getQueryState(feedKey)?.isInvalidated).toBe(false)
  expect(client.getQueryState(commentsKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(postKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(otherCommentsKey)?.isInvalidated).toBe(false)
  await unmount()
  client.clear()
})

it('keeps the loaded posts on screen while a pull-to-refresh reloads the head', async () => {
  let release: (() => void) | undefined
  mockRpc.mockImplementation((_name, params) => {
    if (params.p_before_id) return response(rows(Number(params.p_before_id) + 1))
    const head = new Promise((resolve) => {
      release = () => resolve({ data: rows(100), error: null })
    })
    return Object.assign(head, { abortSignal: () => head })
  })
  mockRpc.mockImplementationOnce(() => response(rows(0)))
  const { client, wrapper } = setup()
  const { result, unmount } = await renderHook(() => useSocialFeed('following'), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  await act(async () => {
    await result.current.fetchNextPage()
  })
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))

  let refreshed: Promise<unknown> | undefined
  await act(async () => {
    refreshed = result.current.refetch()
  })
  // Resetting the query instead would leave no data here, and an empty list.
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
  expect(result.current.data?.pages[0].rows[0].id).toBe('0')
  expect(result.current.isFetching).toBe(true)
  await act(async () => {
    release?.()
    await refreshed
  })
  await waitFor(() => expect(result.current.data?.pages[0].rows[0].id).toBe('100'))
  await unmount()
  client.clear()
})

it('answers whether a meal has a post, and says so only when it knows', async () => {
  mockRpc.mockImplementationOnce(() => response('post-id'))
  await expect(socialEntryPost('shared')).resolves.toBe('post-id')
  mockRpc.mockImplementationOnce(() => response(null))
  await expect(socialEntryPost('private')).resolves.toBeNull()
  mockRpc.mockImplementationOnce(() => response(null, new Error('unavailable')))
  await expect(socialEntryPost('failed')).resolves.toBeUndefined()
  onlineManager.setOnline(false)
  await expect(socialEntryPost('offline')).resolves.toBeUndefined()
  expect(mockRpc).toHaveBeenCalledTimes(3)
  onlineManager.setOnline(true)
})

it.each([
  {
    name: 'read',
    action: { action: 'read', ids: ['notification'] as string[] } as const,
    invalidated: ['social_notifications', 'unread'],
    preserved: ['social_feed', 'social_profile_posts', 'social_post'],
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

it('keeps Discover stable after Follow and refreshes only the Following feed', async () => {
  mockRpc.mockImplementation(() => response(null))
  const { client, wrapper } = setup()
  const discoverKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'discover' })
  const followingKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  const profileKey = keys.socialRead('viewer', 'social_profile', { p_user_id: 'author' })
  const target = {
    id: 'target',
    author_id: 'author',
    is_following: false,
  } as SocialPost
  const other = { id: 'other', author_id: 'other-author', is_following: false } as SocialPost
  client.setQueryData(discoverKey, {
    pages: [{ rows: [target, other], next: null }],
    pageParams: [null],
  })
  client.setQueryData(followingKey, {
    pages: [{ rows: [], next: null }],
    pageParams: [null],
  })
  client.setQueryData(profileKey, { fixture: true })

  const { result, unmount } = await renderHook(useSocialAction, { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ action: 'follow', id: 'author', following: true })
  })

  const discover = client.getQueryData<{
    pages: SocialPage<SocialPost>[]
  }>(discoverKey)
  expect(discover?.pages[0].rows).toEqual([
    expect.objectContaining({ id: 'target', is_following: true }),
    expect.objectContaining({ id: 'other', is_following: false }),
  ])
  expect(client.getQueryState(discoverKey)?.isInvalidated).toBe(false)
  expect(client.getQueryState(followingKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true)
  await unmount()
  client.clear()
})

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

it('reuses a signed image when a tab remounts shortly after leaving', async () => {
  mockInvoke.mockResolvedValue({
    data: {
      ok: true,
      urls: { a: 'url-a' },
      headers: { a: { 'If-Match': 'etag-a' } },
    },
    error: null,
  })
  const { client, wrapper } = setup()
  const first = await renderHook(() => useSocialPhoto('a', true), { wrapper })
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
  await first.unmount()
  const second = await renderHook(() => useSocialPhoto('a', true), { wrapper })
  expect(second.result.current.data?.url).toBe('url-a')
  expect(mockInvoke).toHaveBeenCalledTimes(1)
  await second.unmount()
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
