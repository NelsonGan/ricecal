import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'
import type { IconRef, ReportReason } from './types'

export type SocialReview = 'pending' | 'approved' | 'rejected' | 'quarantined'
export type SocialAudience = 'public' | 'followers'
export type SocialKind = 'profile' | 'post' | 'comment'
export type SocialProfile = {
  user_id: string
  handle: string
  display_name: string
  bio: string
  avatar_path: string | null
  review_status: SocialReview
  review_reason: string | null
  revision: number
  quarantined: boolean
  follower_count: number
  following_count: number
  post_count: number
  is_following: boolean
  is_followed_by: boolean
  created_at: string
  connection_created_at?: string
}
export type SocialPost = {
  id: string
  author_id: string
  handle: string
  display_name: string
  avatar_path: string | null
  food_name: string
  icon_set: IconRef['set'] | null
  icon_name: string | null
  photo_path: string | null
  caption: string
  audience: SocialAudience
  review_status: SocialReview
  review_reason: string | null
  revision: number
  quarantined: boolean
  created_at: string
  published_at: string | null
  like_count: number
  comment_count: number
  is_liked: boolean
  is_following: boolean
}
export type SocialComment = {
  id: string
  post_id: string
  author_id: string
  handle: string
  display_name: string
  avatar_path: string | null
  body: string
  review_status: SocialReview
  review_reason: string | null
  revision: number
  quarantined: boolean
  created_at: string
}
export type SocialNotification = {
  id: string
  kind: 'follow' | 'like' | 'comment'
  actor_id: string
  actor_handle: string
  actor_display_name: string
  actor_avatar_path: string | null
  post_id: string | null
  comment_id: string | null
  created_at: string
  read_at: string | null
}
export type SocialCursor = { at: string; id: string } | { handle: string } | null
export type SocialPage<T> = { rows: T[]; next: SocialCursor }
const PAGE_SIZE = 20
const MEMORY_OPTIONS = { gcTime: 60_000, staleTime: 15_000, retry: 1 } as const
const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener)
const onlineSnapshot = () => onlineManager.isOnline()

// The backend RPCs return a sentinel row. It is never drawn or used as a cursor,
// because the next request must include that row rather than skip it.
export function socialPage<T>(
  rows: T[],
  cursor: (row: T) => SocialCursor,
  size = PAGE_SIZE,
): SocialPage<T> {
  const shown = rows.slice(0, size)
  return {
    rows: shown,
    next: rows.length > size && shown.length ? cursor(shown[shown.length - 1]) : null,
  }
}

export function socialCursorArgs(cursor: SocialCursor) {
  if (cursor && 'handle' in cursor) return { p_after_handle: cursor.handle }
  return { p_before_at: cursor?.at ?? null, p_before_id: cursor?.id ?? null }
}

type Functions = Database['public']['Functions']
type RpcName = keyof Functions
async function rpc<N extends RpcName>(
  name: N,
  params: Functions[N]['Args'],
  signal?: AbortSignal,
): Promise<Functions[N]['Returns']> {
  const request = supabase.rpc(name, params)
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw error
  return data as Functions[N]['Returns']
}

type ListName =
  | 'social_feed'
  | 'social_profile_posts'
  | 'social_comments'
  | 'social_connections'
  | 'social_blocked_profiles'
  | 'social_notifications'
  | 'social_search_profiles'
type ListRequest = {
  [N in ListName]: {
    name: N
    params: Omit<Functions[N]['Args'], 'p_limit' | 'p_before_at' | 'p_before_id' | 'p_after_handle'>
  }
}[ListName]

export function useSocialOnline() {
  return useSyncExternalStore(subscribeOnline, onlineSnapshot, onlineSnapshot)
}

function useSocialPages<T>(request: ListRequest, cursor: (row: T) => SocialCursor, enabled = true) {
  const { name, params } = request
  const userId = useUserId()
  const client = useQueryClient()
  const queryKey = keys.socialRead(userId, name, params)
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as SocialCursor,
    queryFn: async ({ pageParam, signal }) =>
      socialPage(
        (await rpc(
          name,
          {
            ...params,
            ...(name === 'social_search_profiles'
              ? { p_after_handle: pageParam && 'handle' in pageParam ? pageParam.handle : null }
              : socialCursorArgs(pageParam)),
            p_limit: PAGE_SIZE,
          } as Functions[ListName]['Args'],
          signal,
        )) as unknown as T[],
        cursor,
      ),
    getNextPageParam: (page) => page.next ?? undefined,
    // Five pages bounds memory and the work a visibility change must discard.
    maxPages: 5,
    ...MEMORY_OPTIONS,
    enabled,
  })
  return {
    ...query,
    // After old pages are evicted, React Query refetch starts at the retained
    // cursor. Pull-to-refresh must instead return to the newest posts.
    refetch: () => client.resetQueries({ queryKey, exact: true }),
  }
}
const timeCursor = (row: { id: string; created_at: string }): SocialCursor => ({
  at: row.created_at,
  id: row.id,
})
const personCursor = (row: SocialProfile): SocialCursor => ({
  at: row.connection_created_at ?? row.created_at,
  id: row.user_id,
})
export const useSocialFeed = (mode: 'following' | 'discover') =>
  useSocialPages<SocialPost>({ name: 'social_feed', params: { p_mode: mode } }, timeCursor)
export const useSocialPosts = (userId: string) =>
  useSocialPages<SocialPost>(
    { name: 'social_profile_posts', params: { p_user_id: userId } },
    timeCursor,
  )
export const useSocialComments = (postId: string) =>
  useSocialPages<SocialComment>(
    { name: 'social_comments', params: { p_post_id: postId } },
    timeCursor,
  )
export const useSocialConnections = (userId: string, direction: 'followers' | 'following') =>
  useSocialPages<SocialProfile>(
    { name: 'social_connections', params: { p_user_id: userId, p_direction: direction } },
    personCursor,
  )
export const useSocialBlocked = () =>
  useSocialPages<SocialProfile>({ name: 'social_blocked_profiles', params: {} }, personCursor)
export const useSocialNotifications = () =>
  useSocialPages<SocialNotification>({ name: 'social_notifications', params: {} }, timeCursor)
export const useSocialSearch = (query: string) =>
  useSocialPages<SocialProfile>(
    { name: 'social_search_profiles', params: { p_query: query } },
    (row) => ({ handle: row.handle }),
    query.trim().length > 0,
  )

export function useSocialProfile(profileId?: string) {
  const viewer = useUserId()
  const params = { p_user_id: profileId ?? viewer }
  return useQuery({
    queryKey: keys.socialRead(viewer, 'social_profile', params),
    queryFn: async ({ signal }): Promise<SocialProfile | null> =>
      ((await rpc('social_profile', params, signal))[0] as SocialProfile | undefined) ?? null,
    ...MEMORY_OPTIONS,
  })
}
export function useSocialPost(id: string) {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'social_post', { id }),
    queryFn: async ({ signal }): Promise<SocialPost | null> =>
      ((await rpc('social_post', { p_id: id }, signal))[0] as SocialPost | undefined) ?? null,
    enabled: Boolean(id),
    ...MEMORY_OPTIONS,
  })
}
export function useSocialSuggestions() {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'social_suggestions'),
    queryFn: async ({ signal }) =>
      (await rpc('social_suggestions', { p_limit: 12 }, signal)) as SocialProfile[],
    ...MEMORY_OPTIONS,
  })
}
export function useSocialUnread() {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'unread'),
    queryFn: async ({ signal }) =>
      await rpc('social_has_unread_notifications', undefined as never, signal),
    refetchInterval: 60_000,
    ...MEMORY_OPTIONS,
  })
}
export function useSocialEntry(entryId: string) {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'entry', { entryId }),
    enabled: Boolean(entryId),
    ...MEMORY_OPTIONS,
    queryFn: async ({ signal }) => {
      const entry = supabase
        .from('food_log_details')
        .select('id,food_name,photo_path,icon_set,icon_name')
        .eq('id', entryId)
        .eq('user_id', viewer)
        .abortSignal(signal)
        .maybeSingle()
      const [{ data, error }, postId] = await Promise.all([
        entry,
        rpc('social_entry_post', { p_entry_id: entryId }, signal),
      ])
      if (error) throw error
      return { entry: data, postId }
    },
  })
}

export type SocialAction =
  | { action: 'profile'; handle: string; name: string; bio: string; avatar: string | null }
  | {
      action: 'post'
      entryId: string
      caption: string
      audience: SocialAudience
      requestId: string
    }
  | { action: 'editPost'; id: string; caption: string; audience: SocialAudience }
  | { action: 'deletePost'; id: string }
  | { action: 'follow'; id: string; following: boolean }
  | { action: 'removeFollower'; id: string }
  | { action: 'like'; id: string; liked: boolean }
  | { action: 'comment'; postId: string; body: string; requestId: string }
  | { action: 'deleteComment'; id: string }
  | { action: 'editComment'; id: string; body: string }
  | { action: 'report'; kind: SocialKind; id: string; reason: ReportReason }
  | { action: 'block' | 'unblock'; id: string }
  | { action: 'review'; kind: SocialKind; id: string }
  | { action: 'read'; ids: string[] }

export async function reviewSocial(kind: SocialKind, id: string): Promise<SocialReview> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; status: SocialReview }>(
    'social',
    { body: { action: 'review', kind, id } },
  )
  // The write already landed. Losing moderation is a pending item, not a failed
  // publication to retry with a new id and duplicate text.
  return !error && data?.ok ? data.status : 'pending'
}

export function useSocialAction() {
  const viewer = useUserId()
  const client = useQueryClient()
  const socialKey = keys.social(viewer)
  const refresh = async (names: readonly string[]) => {
    const included = new Set(names)
    await client.invalidateQueries({
      queryKey: socialKey,
      predicate: (query) => included.has(String(query.queryKey[2])),
    })
  }
  const resetSocial = async () => {
    // Revoking visibility also clears signed social photos before any old
    // request can put them back in the cache.
    await client.cancelQueries({ queryKey: socialKey })
    await client.resetQueries({ queryKey: socialKey })
  }
  return useMutation({
    // Fail an offline tap immediately, even if connectivity changed after the
    // button rendered. A social action must never sit in an offline write queue.
    networkMode: 'always',
    mutationFn: async (input: SocialAction): Promise<{ id?: string; status?: SocialReview }> => {
      if (!onlineManager.isOnline()) throw new Error('offline')
      switch (input.action) {
        case 'profile': {
          const id = await rpc('set_social_profile', {
            p_handle: input.handle,
            p_display_name: input.name,
            p_bio: input.bio,
            p_avatar_path: input.avatar ?? undefined,
          })
          return { id, status: await reviewSocial('profile', id) }
        }
        case 'post': {
          const id = await rpc('create_social_post', {
            p_entry_id: input.entryId,
            p_caption: input.caption,
            p_audience: input.audience,
            p_request_id: input.requestId,
          })
          return { id, status: await reviewSocial('post', id) }
        }
        case 'editPost':
          await rpc('update_social_post', {
            p_id: input.id,
            p_caption: input.caption,
            p_audience: input.audience,
          })
          return { id: input.id, status: await reviewSocial('post', input.id) }
        case 'deletePost':
          await rpc('delete_social_post', { p_id: input.id })
          break
        case 'follow':
          await rpc('set_social_follow', { p_target_id: input.id, p_following: input.following })
          break
        case 'removeFollower':
          await rpc('remove_social_follower', { p_follower_id: input.id })
          break
        case 'like':
          await rpc('set_social_like', { p_post_id: input.id, p_liked: input.liked })
          break
        case 'comment': {
          const id = await rpc('create_social_comment', {
            p_post_id: input.postId,
            p_body: input.body,
            p_request_id: input.requestId,
          })
          return { id, status: await reviewSocial('comment', id) }
        }
        case 'deleteComment':
          await rpc('delete_social_comment', { p_id: input.id })
          break
        case 'editComment':
          await rpc('update_social_comment', { p_id: input.id, p_body: input.body })
          return { id: input.id, status: await reviewSocial('comment', input.id) }
        case 'report':
          await rpc('report_social_content', {
            p_kind: input.kind,
            p_id: input.id,
            p_reason: input.reason,
          })
          break
        case 'block': {
          const { error } = await supabase
            .from('blocked_authors')
            .upsert(
              { user_id: viewer, author_id: input.id },
              { onConflict: 'user_id,author_id', ignoreDuplicates: true },
            )
          if (error) throw error
          break
        }
        case 'unblock': {
          const { error } = await supabase
            .from('blocked_authors')
            .delete()
            .eq('user_id', viewer)
            .eq('author_id', input.id)
          if (error) throw error
          break
        }
        case 'read':
          await rpc('mark_social_notifications_read', { p_ids: input.ids.slice(0, 100) })
          break
        case 'review':
          return { id: input.id, status: await reviewSocial(input.kind, input.id) }
      }
      return {}
    },
    onSuccess: async (_result, input) => {
      if (
        ['block', 'report', 'deletePost', 'editPost', 'profile'].includes(input.action) ||
        (input.action === 'follow' && !input.following)
      ) {
        await resetSocial()
      } else {
        const names =
          input.action === 'read'
            ? ['social_notifications', 'unread']
            : input.action === 'like'
              ? ['social_feed', 'social_profile_posts', 'social_post']
              : input.action === 'comment'
                ? ['social_feed', 'social_profile_posts', 'social_post', 'social_comments']
                : input.action === 'post'
                  ? ['social_feed', 'social_profile_posts', 'social_profile', 'entry']
                  : input.action === 'follow'
                    ? [
                        'social_feed',
                        'social_profile',
                        'social_profile_posts',
                        'social_post',
                        'social_connections',
                        'social_suggestions',
                        'social_search_profiles',
                      ]
                    : input.action === 'removeFollower'
                      ? [
                          'social_feed',
                          'social_profile',
                          'social_connections',
                          'social_suggestions',
                          'social_search_profiles',
                          'social_notifications',
                          'unread',
                        ]
                      : input.action === 'unblock'
                        ? [
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
                          ]
                        : [
                            'social_feed',
                            'social_profile',
                            'social_profile_posts',
                            'social_post',
                            'social_comments',
                            'social_notifications',
                            'unread',
                          ]
        await refresh(names)
      }
      if (input.action === 'block' || input.action === 'unblock') {
        await client.invalidateQueries({ queryKey: keys.recipesAll(viewer) })
      }
    },
  })
}

export function useSocialPhoto(path: string | null | undefined, visible: boolean) {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'photo', { path }),
    enabled: Boolean(path) && visible,
    queryFn: async ({ signal }) => {
      if (!path) throw new Error('photo unavailable')
      return await signSocialPhoto(viewer, path, signal)
    },
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: visible ? 40_000 : false,
    refetchIntervalInBackground: false,
  })
}

type SignedPhoto = { url: string; headers: Record<string, string>; expiresAt: number }
type PhotoWaiter = {
  path: string
  signal: AbortSignal
  resolve: (photo: SignedPhoto) => void
  reject: (error: unknown) => void
  cancelled: boolean
  onAbort: () => void
}
type PhotoBatch = { waiters: PhotoWaiter[]; controller: AbortController }
const photoBatches = new Map<string, PhotoBatch>()

// One viewport shares a signing call. Each observer still owns cancellation:
// leaving one row cannot cancel its neighbours, while sign-out cancels them all.
function signSocialPhoto(viewer: string, path: string, signal: AbortSignal): Promise<SignedPhoto> {
  if (signal.aborted) return Promise.reject(new Error('cancelled'))
  let batch = photoBatches.get(viewer)
  if (!batch || batch.controller.signal.aborted || batch.waiters.length >= 50) {
    batch = { waiters: [], controller: new AbortController() }
    photoBatches.set(viewer, batch)
    const created = batch
    setTimeout(() => {
      if (photoBatches.get(viewer) === created) photoBatches.delete(viewer)
      void sendPhotoBatch(created)
    }, 24)
  }
  const joined = batch
  return new Promise((resolve, reject) => {
    const waiter: PhotoWaiter = {
      path,
      signal,
      resolve,
      reject,
      cancelled: false,
      onAbort: () => undefined,
    }
    waiter.onAbort = () => {
      waiter.cancelled = true
      reject(new Error('cancelled'))
      if (joined.waiters.every((one) => one.cancelled)) joined.controller.abort()
    }
    joined.waiters.push(waiter)
    signal.addEventListener('abort', waiter.onAbort, { once: true })
  })
}

async function sendPhotoBatch(batch: PhotoBatch) {
  const active = batch.waiters.filter((waiter) => !waiter.cancelled)
  if (!active.length) return
  const expiresAt = Date.now() + 50_000
  try {
    const { data, error } = await supabase.functions.invoke<{
      urls: Record<string, string>
      headers: Record<string, Record<string, string>>
      ok: boolean
    }>('photos', {
      body: {
        action: 'read',
        keys: [...new Set(active.map((waiter) => waiter.path))],
        scope: 'social',
      },
      signal: batch.controller.signal,
    })
    if (error || !data?.ok) throw error ?? new Error('photo unavailable')
    for (const waiter of active) {
      if (waiter.cancelled) continue
      const url = data.urls[waiter.path]
      const headers = data.headers[waiter.path]
      if (url && headers) waiter.resolve({ url, headers, expiresAt })
      else waiter.reject(new Error('photo unavailable'))
    }
  } catch (error) {
    for (const waiter of active) if (!waiter.cancelled) waiter.reject(error)
  } finally {
    for (const waiter of batch.waiters) waiter.signal.removeEventListener('abort', waiter.onAbort)
  }
}
