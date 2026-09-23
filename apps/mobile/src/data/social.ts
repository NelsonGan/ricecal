import {
  type InfiniteData,
  onlineManager,
  type Query,
  type QueryClient,
  type QueryKey,
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
  /** The meal's totals when it was shared. Null only if the diary had none. */
  kcal: number | null
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
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
type LikeState = Pick<SocialPost, 'is_liked' | 'like_count'>
type LikeSnapshot = { queryKey: QueryKey; previous: LikeState; optimistic: LikeState }
const PAGE_SIZE = 20
const MEMORY_OPTIONS = { gcTime: 60_000, staleTime: 15_000, retry: 1 } as const
const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener)
const onlineSnapshot = () => onlineManager.isOnline()

// A post can be visible in more than one mounted screen. Keep the latest Like
// per client so a failed older request cannot undo a newer tap on the same post.
const latestLike = new WeakMap<QueryClient, Map<string, symbol>>()
const likeRequests = new WeakMap<QueryClient, Map<string, Promise<void>>>()
const staleLikeFailures = new WeakMap<QueryClient, Set<string>>()

async function sendLikeInOrder(client: QueryClient, postId: string, write: () => Promise<void>) {
  let requests = likeRequests.get(client)
  if (!requests) {
    requests = new Map()
    likeRequests.set(client, requests)
  }
  const previous = requests.get(postId) ?? Promise.resolve()
  const request = previous.catch(() => undefined).then(write)
  requests.set(postId, request)
  try {
    await request
  } finally {
    if (requests.get(postId) === request) requests.delete(postId)
  }
}

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
    // cursor. Pull-to-refresh must instead return to the newest posts, and it
    // keeps the first loaded page on screen rather than blanking the list.
    refetch: async () => {
      client.setQueryData<InfiniteData<SocialPage<T>, SocialCursor>>(queryKey, (data) =>
        data ? { pages: data.pages.slice(0, 1), pageParams: [null] } : data,
      )
      return await query.refetch()
    },
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
/**
 * Polls only while the badge is on screen. The Feed tab stays mounted after its
 * first visit, and it used to ask every minute for as long as the app was open.
 */
export function useSocialUnread(active: boolean) {
  const viewer = useUserId()
  return useQuery({
    queryKey: keys.socialRead(viewer, 'unread'),
    queryFn: async ({ signal }) =>
      await rpc('social_unread_notification_count', undefined as never, signal),
    enabled: active,
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
        .select('id,food_name,photo_path,icon_set,icon_name,kcal,carbs_g,protein_g,fat_g')
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

/**
 * The caller's post for one diary entry: its id, null for none, or undefined when
 * that cannot be known in time. Offline, failed and slow all read as unknown, so
 * a delete waiting on this never hangs on a bad connection.
 */
export async function socialEntryPost(
  entryId: string,
  timeoutMs = 2000,
): Promise<string | null | undefined> {
  if (!onlineManager.isOnline()) return undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return (await rpc('social_entry_post', { p_entry_id: entryId }, controller.signal)) ?? null
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

export type SocialAction =
  | { action: 'profile'; handle: string; name: string; bio: string; avatar: string | null }
  | { action: 'post'; entryId: string; caption: string; audience: SocialAudience }
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
  // Every cached copy of a post: feed pages, profile grids and the post screen.
  const postLists = new Set(['social_feed', 'social_profile_posts'])
  const holdsPosts = (query: Query) =>
    postLists.has(String(query.queryKey[2])) || String(query.queryKey[2]) === 'social_post'
  const patchPosts = (patch: (post: SocialPost) => SocialPost) => {
    client.setQueriesData<InfiniteData<SocialPage<SocialPost>, SocialCursor>>(
      { queryKey: socialKey, predicate: (query) => postLists.has(String(query.queryKey[2])) },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({ ...page, rows: page.rows.map(patch) })),
        },
    )
    client.setQueriesData<SocialPost | null>(
      { queryKey: socialKey, predicate: (query) => String(query.queryKey[2]) === 'social_post' },
      (post) => (post ? patch(post) : post),
    )
  }
  const markAuthorFollowed = (authorId: string) =>
    patchPosts((post) => (post.author_id === authorId ? { ...post, is_following: true } : post))
  // Likes are the most frequent write. Drawing one in place keeps the card still
  // and spares the server a refetch of every loaded feed page per tap.
  const setLiked = (postId: string, liked: boolean) =>
    patchPosts((post) =>
      post.id === postId && post.is_liked !== liked
        ? { ...post, is_liked: liked, like_count: Math.max(0, post.like_count + (liked ? 1 : -1)) }
        : post,
    )
  const likeState = (post: SocialPost, liked: boolean): Omit<LikeSnapshot, 'queryKey'> => {
    const previous = { is_liked: post.is_liked, like_count: post.like_count }
    return {
      previous,
      optimistic:
        post.is_liked === liked
          ? previous
          : {
              is_liked: liked,
              like_count: Math.max(0, post.like_count + (liked ? 1 : -1)),
            },
    }
  }
  const snapshotLike = (postId: string, liked: boolean): LikeSnapshot[] =>
    client
      .getQueriesData({ queryKey: socialKey, predicate: holdsPosts })
      .flatMap(([queryKey, data]) => {
        const name = String(queryKey[2])
        const post = postLists.has(name)
          ? (data as InfiniteData<SocialPage<SocialPost>, SocialCursor> | undefined)?.pages
              .flatMap((page) => page.rows)
              .find((row) => row.id === postId)
          : (data as SocialPost | null | undefined)
        return post?.id === postId ? [{ queryKey, ...likeState(post, liked) }] : []
      })
  const restoreLike = (postId: string, snapshot: LikeSnapshot) => {
    const restore = (post: SocialPost) =>
      post.id === postId &&
      post.is_liked === snapshot.optimistic.is_liked &&
      post.like_count === snapshot.optimistic.like_count
        ? { ...post, ...snapshot.previous }
        : post
    if (postLists.has(String(snapshot.queryKey[2]))) {
      client.setQueryData<InfiniteData<SocialPage<SocialPost>, SocialCursor>>(
        snapshot.queryKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({ ...page, rows: page.rows.map(restore) })),
          },
      )
    } else {
      client.setQueryData<SocialPost | null>(snapshot.queryKey, (post) =>
        post ? restore(post) : post,
      )
    }
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
          // Two cards can represent the same post. Keep their UI optimistic, but
          // send their desired states in tap order so an older Like cannot land
          // after a newer Unlike and become the server's final answer.
          await sendLikeInOrder(client, input.id, async () => {
            await rpc('set_social_like', { p_post_id: input.id, p_liked: input.liked })
          })
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
    onMutate: async (input) => {
      if (input.action !== 'like') return undefined
      // A feed request that began before this write can carry the old Like
      // state. Stop only queries that hold posts before taking the rollback
      // snapshot, or their late response can erase a successful optimistic Like.
      await client.cancelQueries({ queryKey: socialKey, predicate: holdsPosts })
      let versions = latestLike.get(client)
      if (!versions) {
        versions = new Map()
        latestLike.set(client, versions)
      }
      const version = Symbol(input.id)
      versions.set(input.id, version)
      const previous = snapshotLike(input.id, input.liked)
      setLiked(input.id, input.liked)
      return { previous, version }
    },
    onError: (_error, input, context) => {
      if (input.action !== 'like' || !context) return
      if (latestLike.get(client)?.get(input.id) !== context.version) {
        // Let the newer tap settle before reconciling. Refetching here could put
        // the older server state over its still-optimistic choice.
        let failures = staleLikeFailures.get(client)
        if (!failures) {
          failures = new Set()
          staleLikeFailures.set(client, failures)
        }
        failures.add(input.id)
        return
      }
      for (const snapshot of context.previous) restoreLike(input.id, snapshot)
    },
    onSuccess: async (result, input) => {
      if (input.action === 'like') return
      if (
        ['block', 'report', 'deletePost', 'editPost', 'profile'].includes(input.action) ||
        (input.action === 'follow' && !input.following)
      ) {
        await resetSocial()
        if (input.action === 'profile') {
          await client.invalidateQueries({ queryKey: keys.profile(viewer) })
        }
      } else if (input.action === 'comment') {
        // One post changed. An approved comment also adds to its count wherever
        // that post is drawn; a pending one counts once review approves it.
        if (result.status === 'approved') {
          patchPosts((post) =>
            post.id === input.postId ? { ...post, comment_count: post.comment_count + 1 } : post,
          )
        }
        await Promise.all([
          client.invalidateQueries({
            queryKey: keys.socialRead(viewer, 'social_comments', { p_post_id: input.postId }),
            exact: true,
          }),
          client.invalidateQueries({
            queryKey: keys.socialRead(viewer, 'social_post', { id: input.postId }),
            exact: true,
          }),
        ])
      } else if (input.action === 'follow') {
        // Keep the card containing the Follow button in place. A deliberate
        // Discover refresh can apply server eligibility after the interaction.
        markAuthorFollowed(input.id)
        await Promise.all([
          client.invalidateQueries({
            queryKey: keys.socialRead(viewer, 'social_feed', { p_mode: 'following' }),
            exact: true,
          }),
          refresh([
            'social_profile',
            'social_profile_posts',
            'social_post',
            'social_connections',
            'social_suggestions',
            'social_search_profiles',
          ]),
        ])
      } else {
        const names =
          input.action === 'read'
            ? ['social_notifications', 'unread']
            : input.action === 'post'
              ? ['social_feed', 'social_profile_posts', 'social_profile', 'entry']
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
    onSettled: (_data, _error, input, context) => {
      if (input.action !== 'like' || !context) return
      const versions = latestLike.get(client)
      if (versions?.get(input.id) === context.version) versions.delete(input.id)
      const failures = staleLikeFailures.get(client)
      if (!versions?.has(input.id) && failures?.delete(input.id)) {
        void client.invalidateQueries({ queryKey: socialKey, predicate: holdsPosts })
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
