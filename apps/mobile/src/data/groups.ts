import {
  type Query,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Database, Tables } from '@/lib/database.types'
import { onGroupChatPush } from '@/lib/groupChatPushes'
import { listen } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { type ActivitySession, toSession } from './activity'
import { keys } from './keys'
import { useUserId } from './session'
import { type WorkoutDetail, workoutDetailFrom } from './workouts'

/**
 * Groups read members' diaries live on the server, so nothing here copies an
 * entry. Each screen is one RPC that answers jsonb, typed below by hand because
 * the generated types only know it as `Json`.
 *
 * Only the list of groups and the invite count are kept on disk (see
 * `lib/query.ts`). Boards and chats are other people's meals and words, which
 * leaving a group or a block must take away, so they live in memory and for a
 * few minutes at most.
 */

export type GroupMeal = Database['public']['Enums']['group_meal']
export const GROUP_MEALS: readonly GroupMeal[] = ['breakfast', 'lunch', 'dinner']
/** The most people a group holds, as the database enforces it. */
export const GROUP_CAPACITY = 20

export type GroupPerson = {
  id: string
  name: string
  handle: string
  avatar_path: string | null
}

export type GroupSummary = {
  id: string
  name: string
  icon_name: string
  is_public: boolean
  is_leader: boolean
  member_count: number
  logged_today: number
  members: GroupPerson[]
}

export type GroupInvite = {
  group_id: string
  name: string
  icon_name: string
  member_count: number
  inviter: GroupPerson
}

type PublicGroup = { id: string; name: string; icon_name: string; member_count: number }

/**
 * The invites and public lists report a group of ten to nineteen as nine in
 * `member_count`, so an app from before twenty-member groups, which takes ten
 * as full, keeps its Join live. The true size is `member_total`; a server
 * from before it sends only the count, which was true then.
 */
function trueSize<T extends { member_count: number; member_total?: number }>(rows: T[]): T[] {
  return rows.map((row) =>
    row.member_total === undefined ? row : { ...row, member_count: row.member_total },
  )
}

export type BoardEntry = {
  id: string
  meal: GroupMeal
  name: string
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  photo_path: string | null
  icon_set: string | null
  icon_name: string | null
  logged_at: string
  serving_label: string | null
  likes: number
  dislikes: number
  /** The viewer's own reaction: 1, -1 or 0. */
  mine: -1 | 0 | 1
}

/** One of a member's workouts on a board day, enough to name it and open it. */
export type BoardWorkout = {
  id: string
  source: 'workout' | 'activity'
  name: string | null
  kind: string
  duration_s: number
}

export type BoardMember = {
  person: GroupPerson
  entries: BoardEntry[]
  nudges: Partial<Record<GroupMeal, { by: GroupPerson }>>
  nudgeable: GroupMeal[]
  workout: {
    /** A workout's own name, or a health store's label; null for a bare kind. */
    name: string | null
    kind: string
    duration_s: number
    count: number
    /** The day's workouts, first one first, to open. Missing from an older server. */
    all?: BoardWorkout[]
  } | null
}

export type GroupBoard = {
  group: {
    id: string
    name: string
    icon_name: string
    is_public: boolean
    leader_id: string | null
    member_count: number
  }
  members: BoardMember[]
  /**
   * A hash of the rest, handed back by the next poll so an unchanged board
   * answers in a few bytes. Missing from an older server.
   */
  version?: string
}

/** What `group_board` answers when the version handed to it is still current. */
type BoardUnchanged = { unchanged: true; version: string }

/** The board's chat bar. */
export type ChatSummary = {
  /** Messages from others since the viewer last read the chat, counted to 100. */
  unread: number
  last: { author: GroupPerson; body: string } | null
}

/** The emoji a message can be reacted with, as the database allows them. */
export const MESSAGE_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'] as const
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number]

/** A food shared into the chat: the post's meal as it is now. */
export type ChatFood = {
  post_id: string
  name: string
  icon_set: string | null
  icon_name: string | null
  photo_path: string | null
  serving_label: string | null
  logged_at: string
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  /**
   * The diary entry its thumbs are cast on, with this group's likes and
   * dislikes and the viewer's own, as the board counts them. Missing from an
   * older server and from a card drawn before the server answered.
   */
  entry_id?: string
  likes?: number
  dislikes?: number
  mine?: -1 | 0 | 1
}

/**
 * A workout shared into the chat, read live: one from the app's own logger
 * (`source: 'workout'`, with its exercises and sets) or one a health store
 * recorded (`source: 'activity'`, a run or a game, with its distance).
 */
export type ChatWorkout = {
  source: 'workout' | 'activity'
  id: string
  /** Its own name, or a health store's label; null for a bare kind. */
  name: string | null
  kind: string
  started_at: string
  duration_s: number
  kcal: number | null
  distance_m: number | null
  sets: number | null
  exercises: number | null
}

/** The message a reply answers, as the reply quotes it. */
export type ChatQuote = {
  id: string
  author: GroupPerson
  body: string
  is_food: boolean
}

export type GroupMessage = {
  id: string
  author: GroupPerson
  /** Text, or for a food the name and calories, which is all an older app reads. */
  body: string
  created_at: string
  mine: boolean
  /**
   * The rest is missing from a server older than replies, food and reactions,
   * and from a message drawn before the server answered.
   */
  reply_to?: ChatQuote | null
  /** Null when the post was withdrawn; the body still says what it was. */
  food?: ChatFood | null
  workout?: ChatWorkout | null
  reactions?: { emoji: string; count: number }[]
  my_reaction?: string | null
}

/** The group's one thread as far back as it has been scrolled, oldest first. */
export type GroupThread = {
  messages: GroupMessage[]
  /** Whether older messages are left to load. */
  more: boolean
  /**
   * The time of the newest message the server has returned, where the next
   * catch-up reads from. Never a message drawn with the phone's own clock.
   */
  newest?: string
  /** When the newest page was last read whole. A catch-up does not count. */
  readAt?: number
}

type GroupDetails = {
  id: string
  name: string
  icon_name: string
  is_public: boolean
  leader_id: string | null
  notify: boolean
  members: GroupPerson[]
  /** The invites the viewer sent that are still waiting. */
  invites: GroupPerson[]
}

type Functions = Database['public']['Functions']

async function rpc<N extends keyof Functions>(
  name: N,
  params?: Functions[N]['Args'],
  signal?: AbortSignal,
): Promise<Functions[N]['Returns']> {
  const request = supabase.rpc(name, params)
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw error
  return data as Functions[N]['Returns']
}

/**
 * PostgREST's answer when no function takes the arguments sent: a server from
 * before the argument was added.
 */
const unknownArguments = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 'PGRST202'

/** The reason a write was refused, as the database names it in the error's hint. */
export function groupError(error: unknown): string | null {
  const hint = (error as { hint?: unknown } | null)?.hint
  return typeof hint === 'string' && hint ? hint : null
}

/**
 * An argument the function takes as null for "leave it". Omitting it instead
 * drops it from the request, and PostgREST then finds no function by that
 * signature. The generated types do not know null is allowed.
 */
const unset = <T>(value: T | undefined | null) => (value ?? null) as T

const LIVE = { staleTime: 15_000, retry: 1 } as const
/** Someone else's meals and messages: gone from memory soon after leaving the screen. */
const SHORT = { ...LIVE, gcTime: 5 * 60_000 } as const

const boardKey = (userId: string, groupId: string, day: string) =>
  keys.groupsRead(userId, 'group_board', { groupId, day })
const messagesKey = (userId: string, groupId: string) =>
  keys.groupsRead(userId, 'group_messages', { groupId })
const summaryKey = (userId: string, groupId: string) =>
  keys.groupsRead(userId, 'group_chat_summary', { groupId })
const detailsKey = (userId: string, groupId: string) =>
  keys.groupsRead(userId, 'group_details', { groupId })
const suggestionsKey = (userId: string, groupId: string) =>
  keys.groupsRead(userId, 'group_invite_suggestions', { groupId })

export function useMyGroups() {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'my_groups'),
    queryFn: async ({ signal }) =>
      (await rpc('my_groups', undefined, signal)) as unknown as GroupSummary[],
    ...LIVE,
  })
}

export function useGroupInvites(enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'my_group_invites'),
    queryFn: async ({ signal }) =>
      trueSize((await rpc('my_group_invites', undefined, signal)) as unknown as GroupInvite[]),
    enabled,
    ...SHORT,
  })
}

/**
 * The red number on the tab. An invite also arrives as a push, which is what
 * makes it timely; this only has to catch up, so it asks every five minutes
 * while the app is in front.
 */
export function useGroupInviteCount() {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_invite_count'),
    queryFn: async ({ signal }) => await rpc('group_invite_count', undefined, signal),
    refetchInterval: 5 * 60_000,
    ...LIVE,
  })
}

export function usePublicGroups(query: string) {
  const userId = useUserId()
  const trimmed = query.trim()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'public_groups', { query: trimmed }),
    queryFn: async ({ signal }) =>
      trueSize(
        (await rpc(
          'public_groups',
          { p_query: trimmed || undefined, p_limit: 20 },
          signal,
        )) as unknown as PublicGroup[],
      ),
    placeholderData: (previous) => previous,
    ...SHORT,
  })
}

/**
 * One day of a group. `live` polls every half minute, which is what makes a
 * friend's lunch appear without pulling; the pages either side are fetched
 * once so a swipe lands on a drawn board, and do not poll.
 *
 * Each poll hands back the version of the board it holds, and a board nobody
 * has touched since answers `unchanged` instead of every member's day of food
 * again. A board patched here (a like, a move) keeps the version it was read
 * with: the write either changes the board on the server, and so its version,
 * or fails and is put back exactly.
 */
export function useGroupBoard(groupId: string, day: string, enabled: boolean, live: boolean) {
  const userId = useUserId()
  const client = useQueryClient()
  const key = boardKey(userId, groupId, day)
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const read = async (known?: string) =>
        (await rpc(
          'group_board',
          { p_group_id: groupId, p_day: day, ...(known ? { p_known: known } : {}) },
          signal,
        )) as unknown as GroupBoard | BoardUnchanged
      const answer = await read(client.getQueryData<GroupBoard>(key)?.version)
      if (!('unchanged' in answer)) return answer
      // Kept only if it is still the board that version names: one cleared or
      // replaced while the read was on its way is read whole.
      const held = client.getQueryData<GroupBoard>(key)
      return held?.version === answer.version ? held : ((await read()) as GroupBoard)
    },
    enabled,
    refetchInterval: live ? 30_000 : false,
    ...SHORT,
  })
}

/** How many messages a page of the thread holds. */
export const THREAD_PAGE = 50

/**
 * A message's time in microseconds, as Postgres keeps it. `Date.parse` stops at
 * milliseconds, which would order two messages from the same millisecond by id
 * here and by time on the server.
 */
function micros(createdAt: string): number {
  const fraction = /\.(\d+)/.exec(createdAt)?.[1] ?? ''
  const whole = Date.parse(createdAt.replace(/\.\d+/, ''))
  return whole * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6))
}
/** Whether `a` comes before `b` in the thread, as the server orders it. */
const before = (a: GroupMessage, b: GroupMessage) => {
  const x = micros(a.created_at)
  const y = micros(b.created_at)
  return x < y || (x === y && a.id < b.id)
}

/**
 * Lays the newest page over the thread as already scrolled, so a refetch reads
 * one page however far back the viewer has gone. What the newest page covers is
 * taken from it, which drops a message deleted or hidden since; what is older
 * is kept. A page that does not reach back to anything held leaves a gap the
 * client cannot see into, so the thread starts again from that page.
 */
export function mergeNewest(held: GroupThread | undefined, newest: GroupMessage[]): GroupThread {
  if (newest.length < THREAD_PAGE) return { messages: newest, more: false }
  const oldest = newest[0]
  if (!held || !oldest || !held.messages.some((message) => !before(message, oldest))) {
    return { messages: newest, more: true }
  }
  // By id as well as by time: the viewer's own message is drawn with the
  // phone's clock until a refetch brings the server's, and a phone running
  // slow would otherwise keep both.
  const fresh = new Set(newest.map((message) => message.id))
  return {
    messages: [
      ...held.messages.filter((message) => !fresh.has(message.id) && before(message, oldest)),
      ...newest,
    ],
    more: held.more,
  }
}

/**
 * How far before the newest message held a catch-up reads again. A message's
 * time is when its write began, so one that took longer to commit than a later
 * one can land behind a message already read.
 */
const CATCH_UP_OVERLAP_MS = 10_000
/**
 * How often an open thread reads its newest page whole, for what a catch-up
 * cannot see: a reaction or a removal missed while the channel was down,
 * someone blocking the viewer, a renamed author. Joined, a broadcast announces
 * the rest; polled, nothing does.
 */
const WHOLE_READ_LIVE_MS = 5 * 60_000
const WHOLE_READ_POLLED_MS = 30_000
/** A reaction on one of the last few messages is read by a catch-up from it. */
const REACTION_TAIL = 10

/** A message time moved back, as the ISO string a catch-up starts from. */
function earlierBy(createdAt: string, ms: number): string | null {
  const at = Date.parse(createdAt.replace(/\.\d+/, ''))
  return Number.isNaN(at) ? null : new Date(at - ms).toISOString()
}

/** The later of two message times, as Postgres orders them. */
function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return a ?? b
  return micros(b) > micros(a) ? b : a
}

/**
 * Where the next read of the thread may catch up from, or null when it is due
 * a whole read: nothing read whole yet, or not for `every` milliseconds.
 */
export function catchUpFrom(
  held: GroupThread | undefined,
  now: number,
  every: number,
): string | null {
  if (!held?.newest || held.readAt === undefined || now - held.readAt >= every) return null
  return earlierBy(held.newest, CATCH_UP_OVERLAP_MS)
}

const inOrder = (a: GroupMessage, b: GroupMessage) => (before(a, b) ? -1 : before(b, a) ? 1 : 0)

/**
 * Lays a catch-up over the thread: what was written since the newest message
 * held, and the seconds before it read again, each taking the place of its
 * held copy. A full page may not reach back to anything held, so it is taken
 * as the newest page, gap and all.
 */
export function mergeNewer(held: GroupThread, newer: GroupMessage[]): GroupThread {
  if (!newer.length) return held
  const newest = laterOf(held.newest, newer.at(-1)?.created_at)
  if (newer.length >= THREAD_PAGE)
    return { ...mergeNewest(held, newer), newest, readAt: held.readAt }
  const fresh = new Set(newer.map((message) => message.id))
  const kept = held.messages.filter((message) => !fresh.has(message.id))
  const last = kept.at(-1)
  const first = newer[0]
  const messages =
    !last || (first && before(last, first))
      ? [...kept, ...newer]
      : [...kept, ...newer].sort(inOrder)
  return { ...held, messages, newest }
}

/**
 * Beside each query client: what the next read of each open thread is asked to
 * do beyond its schedule (read whole, or catch up from further back), taken off
 * once a read that saw it lands, so a read cancelled by another still leaves it
 * for the next one; and whether the server answers catch-ups at all, since one
 * from before them answers as unknown and is then only asked whole.
 */
type ThreadReads = { asks: Map<string, string>; catchUps: boolean }
const threadReads = new WeakMap<QueryClient, ThreadReads>()
function readsOf(client: QueryClient): ThreadReads {
  let reads = threadReads.get(client)
  if (!reads) {
    reads = { asks: new Map(), catchUps: true }
    threadReads.set(client, reads)
  }
  return reads
}
const WHOLE = 'whole'
const threadId = (userId: string, groupId: string) => `${userId}/${groupId}`
function askThread(client: QueryClient, userId: string, groupId: string, ask: string) {
  const { asks } = readsOf(client)
  const id = threadId(userId, groupId)
  const prior = asks.get(id)
  // Every catch-up time comes from toISOString, so they order as text.
  asks.set(id, prior === WHOLE || ask === WHOLE ? WHOLE : prior && prior < ask ? prior : ask)
}

/**
 * The group's one thread, refetched when Realtime says something changed (see
 * `useGroupChatLive`). Without a channel it asks every five seconds. With one,
 * a slow minute's poll stays as a net for a socket that died without saying so.
 * Most reads only catch up: what was written since the newest message held, a
 * few hundred bytes rather than the whole newest page. The page is read whole
 * on first open, and then every five minutes joined or half minute polled, for
 * what no catch-up sees (see `WHOLE_READ_LIVE_MS`). `loadOlder` reads the page
 * before the oldest held, as the viewer scrolls up.
 */
export function useGroupThread(groupId: string, live: boolean) {
  const userId = useUserId()
  const client = useQueryClient()
  const key = messagesKey(userId, groupId)
  const thread = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const reads = readsOf(client)
      const id = threadId(userId, groupId)
      const asked = reads.asks.get(id)
      const settled = () => {
        if (reads.asks.get(id) === asked) reads.asks.delete(id)
      }
      const due = catchUpFrom(
        client.getQueryData<GroupThread>(key),
        Date.now(),
        live ? WHOLE_READ_LIVE_MS : WHOLE_READ_POLLED_MS,
      )
      const from = asked === WHOLE || !due ? null : asked && asked < due ? asked : due
      if (from && reads.catchUps) {
        try {
          const newer = (await rpc(
            'group_messages',
            { p_group_id: groupId, p_limit: THREAD_PAGE, p_after_at: from },
            signal,
          )) as unknown as GroupMessage[]
          // Laid over the thread as it is now: an older page or a removal may
          // have landed meanwhile. Dropped meanwhile, it is read whole.
          const held = client.getQueryData<GroupThread>(key)
          if (held) {
            settled()
            return mergeNewer(held, newer)
          }
        } catch (error) {
          if (!unknownArguments(error)) throw error
          reads.catchUps = false
        }
      }
      const readAt = Date.now()
      const newest = (await rpc(
        'group_messages',
        { p_group_id: groupId, p_limit: THREAD_PAGE },
        signal,
      )) as unknown as GroupMessage[]
      settled()
      // The thread as it is now, not as it was when the read started: an older
      // page or a removal may have landed meanwhile.
      return {
        ...mergeNewest(client.getQueryData<GroupThread>(key), newest),
        newest: newest.at(-1)?.created_at,
        readAt,
      }
    },
    refetchInterval: live ? 60_000 : 5_000,
    // Coming back to the app rejoins the channel, and the join refetches;
    // refetching on focus as well read the thread twice.
    refetchOnWindowFocus: false,
    ...SHORT,
  })
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loading = useRef(false)
  const loadOlder = useCallback(async () => {
    const held = client.getQueryData<GroupThread>(messagesKey(userId, groupId))
    const oldest = held?.messages[0]
    if (!held?.more || !oldest || loading.current) return
    loading.current = true
    setLoadingOlder(true)
    try {
      const page = (await rpc('group_messages', {
        p_group_id: groupId,
        p_before_at: oldest.created_at,
        p_before_id: oldest.id,
        p_limit: THREAD_PAGE,
      })) as unknown as GroupMessage[]
      // Only onto the thread it was asked from: a refetch that started the
      // thread again meanwhile has its own oldest message.
      client.setQueryData<GroupThread>(messagesKey(userId, groupId), (current) =>
        current?.messages[0]?.id === oldest.id
          ? {
              ...current,
              messages: [...page, ...current.messages],
              more: page.length === THREAD_PAGE,
            }
          : current,
      )
    } catch {
      // Scrolling to the top again asks again.
    } finally {
      loading.current = false
      setLoadingOlder(false)
    }
  }, [client, userId, groupId])
  // The query result is passed through whole rather than spread, which would
  // read every field and rerender on each refetch's fetching flag.
  return { thread, loadOlder, loadingOlder }
}

/**
 * Reads the one message just before `after` again and lays it over the held
 * copy, for a change (a reaction) to a message further back than a catch-up
 * reaches. Only if what comes back is the same message: one hidden in between
 * would make the page before `after` a different one.
 */
async function rereadMessage(
  client: QueryClient,
  userId: string,
  groupId: string,
  after: GroupMessage | undefined,
) {
  if (!after) return
  try {
    const [fresh] = (await rpc('group_messages', {
      p_group_id: groupId,
      p_before_at: after.created_at,
      p_before_id: after.id,
      p_limit: 1,
    })) as unknown as GroupMessage[]
    if (!fresh) return
    patchThread(client, userId, groupId, (messages) =>
      messages.some((message) => message.id === fresh.id)
        ? messages.map((message) => (message.id === fresh.id ? fresh : message))
        : messages,
    )
  } catch {
    // The next open reads it.
  }
}

/**
 * Reads the held messages a reaction changed again. Those among the last few
 * come with a catch-up from the earliest of them, through the thread's own
 * query (`refetch`); one further back is read on its own.
 */
function rereadReacted(
  client: QueryClient,
  userId: string,
  groupId: string,
  ids: string[],
  refetch: () => void,
) {
  const held = client.getQueryData<GroupThread>(messagesKey(userId, groupId))?.messages
  if (!held) return
  const at = ids
    .map((id) => held.findIndex((message) => message.id === id))
    .filter((index) => index >= 0)
  const tail = held.length - REACTION_TAIL
  const near = at.filter((index) => index >= tail)
  if (near.length) {
    const earliest = held[Math.min(...near)]
    const from = earliest ? earlierBy(earliest.created_at, 1_000) : null
    askThread(client, userId, groupId, from ?? WHOLE)
    refetch()
  }
  for (const index of at.filter((index) => index < tail)) {
    void rereadMessage(client, userId, groupId, held[index + 1])
  }
}

/** Every message held for a group's thread, changed in place. */
function patchThread(
  client: QueryClient,
  userId: string,
  groupId: string,
  patch: (messages: GroupMessage[]) => GroupMessage[],
) {
  client.setQueryData<GroupThread>(messagesKey(userId, groupId), (thread) => {
    if (!thread) return thread
    const messages = patch(thread.messages)
    return messages === thread.messages ? thread : { ...thread, messages }
  })
}

/**
 * The viewer's own message as drawn before the server's list has it. Only the
 * author's id is read for a row of one's own, to run bubbles together.
 */
export function ownMessage(
  userId: string,
  id: string,
  body: string,
  createdAt: string,
  extra?: Pick<GroupMessage, 'reply_to' | 'food' | 'workout'>,
): GroupMessage {
  return {
    id,
    author: { id: userId, name: '', handle: '', avatar_path: null },
    body,
    created_at: createdAt,
    mine: true,
    reply_to: extra?.reply_to ?? null,
    food: extra?.food ?? null,
    workout: extra?.workout ?? null,
    reactions: [],
    my_reaction: null,
  }
}

/** The ids a chat broadcast names. The database sends nothing else. */
function broadcastIds(payload: Record<string, unknown>): string[] {
  const ids = payload.ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

/** The group's private Realtime topic, shared by its open chat and its board's chat bar. */
const chatTopic = (groupId: string) => `group-chat:${groupId}`

/**
 * Keeps an open chat current over the group's private Realtime channel, and
 * answers whether it is joined, which is what slows the poll to a minute.
 *
 * A broadcast names message ids and nothing more, so a new one is drawn by
 * refetching the thread's newest page, where blocks and reports are applied.
 * Nothing is asked for an id already in the thread, nor while the viewer's own
 * send to it is on its way, since that send refetches the thread when it
 * lands. A removed one is taken out in place. Each time the channel joins,
 * first or after a drop, the thread is read once more, since anything sent
 * while it was not listening was never going to be heard.
 */
export function useGroupChatLive(groupId: string): boolean {
  const userId = useUserId()
  const client = useQueryClient()
  const [live, setLive] = useState(false)
  useEffect(() => {
    const key = messagesKey(userId, groupId)
    // A fetch already on its way may have read the thread before the news.
    // Restarting it would hold back the first paint, so it lands first and the
    // thread is read once more after it.
    const refetch = () => {
      const query = client.getQueryCache().find({ queryKey: key, exact: true })
      const pending = query?.state.fetchStatus === 'fetching' ? query.promise : undefined
      const again = () => void client.invalidateQueries({ queryKey: key })
      if (pending) void pending.then(again, again)
      else again()
    }
    const pendingOf = (action: GroupAction['action']) =>
      client
        .getMutationCache()
        .findAll({ status: 'pending' })
        .some((mutation) => {
          const input = mutation.state.variables as GroupAction | undefined
          return input?.action === action && 'groupId' in input && input.groupId === groupId
        })
    const sending = () => pendingOf('message')
    const stop = listen(chatTopic(groupId), {
      onLive: (next) => {
        setLive(next)
        if (!next) return
        // A catch-up finds what was written while the channel was down, but
        // not what was removed or reacted to then. Only a join right after a
        // whole read (opening the chat) can skip reading whole again.
        const readAt = client.getQueryData<GroupThread>(key)?.readAt
        if (readAt === undefined || Date.now() - readAt > 15_000) {
          askThread(client, userId, groupId, WHOLE)
        }
        refetch()
      },
      onEvent: (event, payload) => {
        const ids = broadcastIds(payload)
        if (!ids.length) return
        if (event === 'removed') {
          patchThread(client, userId, groupId, (messages) =>
            messages.some((message) => ids.includes(message.id))
              ? messages.filter((message) => !ids.includes(message.id))
              : messages,
          )
        } else if (event === 'message') {
          const held = client.getQueryData<GroupThread>(key)?.messages
          if (held && ids.every((id) => held.some((message) => message.id === id))) return
          if (sending()) return
          refetch()
        } else if (event === 'reacted') {
          // Only messages held have counts to redraw, and the viewer's own
          // reaction is already drawn and rereads when it lands.
          if (pendingOf('reactMessage')) return
          rereadReacted(client, userId, groupId, ids, refetch)
        }
      },
    })
    return () => {
      stop()
      setLive(false)
    }
  }, [client, userId, groupId])
  return live
}

/**
 * The board's chat bar: the unread count and the thread's latest message.
 * Polled every half minute while the board has no channel; with one,
 * `useGroupBoardChatLive` rereads it as messages are written and a minute's
 * poll is the net.
 */
export function useGroupChatSummary(groupId: string, enabled: boolean, live: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: summaryKey(userId, groupId),
    queryFn: async ({ signal }) =>
      (await rpc('group_chat_summary', { p_group_id: groupId }, signal)) as unknown as ChatSummary,
    enabled,
    // Joined, a slow poll stays as the net for a socket that died silently.
    refetchInterval: enabled ? (live ? 60_000 : 30_000) : false,
    ...SHORT,
  })
}

/**
 * Keeps the board's chat bar current while the board is on top, over the
 * group's private Realtime topic, and answers whether it is joined. A
 * broadcast names ids and nothing else, so the bar is reread with
 * `group_chat_summary`: one small read, not the board with every member's day
 * of food. One read in flight at a time; a burst ends with one more.
 *
 * Without a channel (joining, a refused join, the server gone), a chat push
 * that reaches the open app rereads the bar instead, and failing that its own
 * half-minute poll catches up.
 *
 * Only while the board is on top: under the chat the count is being read away,
 * and a reread then would draw it back. The chat holds the same channel, so
 * moving between the two does not leave and rejoin it.
 */
export function useGroupBoardChatLive(groupId: string, enabled: boolean): boolean {
  const userId = useUserId()
  const client = useQueryClient()
  const [joined, setJoined] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const key = summaryKey(userId, groupId)
    let live = false
    let stopped = false
    let busy = false
    let again = false
    const reread = async () => {
      if (busy) {
        again = true
        return
      }
      busy = true
      try {
        const summary = (await rpc('group_chat_summary', {
          p_group_id: groupId,
        })) as unknown as ChatSummary
        if (stopped) return
        // A fetch of the bar still on its way read it before this message, and
        // would land over this answer.
        await client.cancelQueries({ queryKey: key })
        client.setQueryData(key, summary)
      } catch {
        // The bar's own poll is the net.
      } finally {
        busy = false
        if (again && !stopped) {
          again = false
          void reread()
        }
      }
    }
    const stopListening = listen(chatTopic(groupId), {
      onLive: (next) => {
        live = next
        setJoined(next)
        if (!next) return
        // Each join, first or after a drop, may have missed a message, unless
        // the bar itself was just read or is being read.
        const state = client.getQueryCache().find({ queryKey: key, exact: true })?.state
        const fresh =
          state?.fetchStatus === 'fetching' || Date.now() - (state?.dataUpdatedAt ?? 0) < 5_000
        if (!fresh) void reread()
      },
      onEvent: (event, payload) => {
        if ((event === 'message' || event === 'removed') && broadcastIds(payload).length) {
          void reread()
        }
      },
    })
    const stopPushes = onGroupChatPush((pushed) => {
      if (pushed === groupId && !live) void client.invalidateQueries({ queryKey: key })
    })
    return () => {
      stopped = true
      stopListening()
      stopPushes()
      setJoined(false)
    }
  }, [client, userId, groupId, enabled])
  return joined
}

/**
 * Marks an open chat read as a message from someone else lands in it, while
 * the viewer is looking (`watching`: the chat on top and the app in front).
 * The groups function sends a message's push a few seconds after it was written
 * and leaves out whoever has read the chat since, so this is what keeps a phone
 * from buzzing about a message its owner just watched arrive. The thread as it
 * first loaded (`opened`) was read on opening. One read in flight at a time; a
 * burst ends with one more.
 */
export function useReadAsItArrives(
  groupId: string,
  latestFromOthers: string | null,
  opened: string | null | undefined,
  watching: boolean,
) {
  const action = useGroupAction()
  const read = action.mutateAsync
  const state = useRef({ busy: false, again: false, through: null as string | null })
  useEffect(() => {
    const current = state.current
    if (!watching || !latestFromOthers || latestFromOthers === opened) return
    if (current.through === latestFromOthers) return
    current.through = latestFromOthers
    const go = () => {
      if (current.busy) {
        current.again = true
        return
      }
      current.busy = true
      void read({ action: 'read', groupId })
        .catch(() => {
          // Not read, so the next message, or coming back, tries again.
          current.through = null
        })
        .finally(() => {
          current.busy = false
          if (current.again) {
            current.again = false
            go()
          }
        })
    }
    go()
  }, [read, groupId, latestFromOthers, opened, watching])
}

/**
 * People to invite with one tap: the viewer's follows and followers who are
 * not in the group or invited yet, mutual follows first.
 */
export function useGroupInviteSuggestions(groupId: string, enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: suggestionsKey(userId, groupId),
    queryFn: async ({ signal }) =>
      (await rpc(
        'group_invite_suggestions',
        { p_group_id: groupId, p_limit: 5 },
        signal,
      )) as unknown as GroupPerson[],
    enabled,
    ...SHORT,
  })
}

/** A fellow member's workout, as its own page draws it. */
export type GroupWorkoutView = {
  owner: GroupPerson
} & (
  | { workout: WorkoutDetail; session?: undefined }
  | { session: ActivitySession; workout?: undefined }
)

/**
 * Someone's workout opened from the board or a chat card: the rows the
 * owner's own page reads, less their notes and records, through
 * `group_workout_detail`, which checks the two share the group.
 */
export function useGroupWorkout(groupId: string, source: 'workout' | 'activity', id: string) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_workout_detail', { groupId, source, id }),
    queryFn: async ({ signal }): Promise<GroupWorkoutView> => {
      const answer = (await rpc(
        'group_workout_detail',
        { p_group_id: groupId, p_source: source, p_id: id },
        signal,
      )) as unknown as {
        owner: GroupPerson
        session?: Tables<'activity_sessions'>
        summary?: Parameters<typeof workoutDetailFrom>[0]['summary']
        exercises?: Tables<'workout_exercises'>[]
        sets?: Parameters<typeof workoutDetailFrom>[0]['sets']
        heart?: Parameters<typeof workoutDetailFrom>[0]['heart']
      }
      if (answer.session) return { owner: answer.owner, session: toSession(answer.session) }
      if (!answer.summary) throw new Error('Workout unavailable')
      return {
        owner: answer.owner,
        workout: workoutDetailFrom({
          summary: answer.summary,
          exercises: answer.exercises ?? [],
          sets: answer.sets ?? [],
          heart: answer.heart ?? null,
        }),
      }
    },
    ...SHORT,
  })
}

/** A food post of the viewer's own, as the chat's food picker lists it. */
export type RecentFoodPost = {
  id: string
  food_name: string | null
  icon_set: string | null
  icon_name: string | null
  photo_path: string | null
  kcal: number | null
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
  created_at: string
  review_status: string
  quarantined: boolean
}

/**
 * The viewer's last five food posts that can still be shared, which the chat's
 * + sends as food cards. One withdrawn by moderation is left out: the server
 * refuses to share it, and the send would sit there failed.
 */
export function useRecentFoodPosts(enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'recent_food_posts'),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc('social_profile_posts', { p_user_id: userId, p_limit: 10, p_kinds: ['food'] })
        .abortSignal(signal)
      if (error) throw error
      return ((data ?? []) as RecentFoodPost[])
        .filter(
          (post) =>
            post.food_name !== null && post.review_status === 'approved' && !post.quarantined,
        )
        .slice(0, 5)
    },
    enabled,
    ...SHORT,
  })
}

/**
 * The viewer's last five workouts to share from the chat's +: the logger's and
 * a health store's together, newest first. A logger workout saved to Apple
 * Health comes back as a session too, and is listed once, as the logger's.
 * Demo data is left out, as it is from sharing on its own.
 */
export function useRecentWorkouts(enabled: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'recent_workouts'),
    queryFn: async ({ signal }): Promise<ChatWorkout[]> => {
      const [logged, recorded] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, name, started_at, duration_s, kcal, health_workout_id')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(5)
          .abortSignal(signal),
        supabase
          .from('activity_sessions')
          .select(
            'id, kind, kind_label, started_at, duration_s, active_kcal, distance_m, external_id',
          )
          .eq('user_id', userId)
          .neq('provider', 'demo')
          .order('started_at', { ascending: false })
          .limit(10)
          .abortSignal(signal),
      ])
      if (logged.error) throw logged.error
      if (recorded.error) throw recorded.error
      const copies = new Set(
        (logged.data ?? []).map((row) => row.health_workout_id).filter((id) => id !== null),
      )
      return [
        ...(logged.data ?? []).map(
          (row): ChatWorkout => ({
            source: 'workout',
            id: row.id,
            name: row.name,
            kind: 'strength',
            started_at: row.started_at,
            duration_s: row.duration_s ?? 0,
            kcal: row.kcal,
            distance_m: null,
            sets: null,
            exercises: null,
          }),
        ),
        ...(recorded.data ?? [])
          .filter((row) => !copies.has(row.external_id))
          .map(
            (row): ChatWorkout => ({
              source: 'activity',
              id: row.id,
              name: row.kind_label?.trim() || null,
              kind: row.kind,
              started_at: row.started_at,
              duration_s: row.duration_s,
              kcal: row.active_kcal,
              distance_m: row.distance_m,
              sets: null,
              exercises: null,
            }),
          ),
      ]
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 5)
    },
    enabled,
    ...SHORT,
  })
}

export function useGroupDetails(groupId: string) {
  const userId = useUserId()
  return useQuery({
    queryKey: detailsKey(userId, groupId),
    queryFn: async ({ signal }) =>
      (await rpc('group_details', { p_group_id: groupId }, signal)) as unknown as GroupDetails,
    ...SHORT,
  })
}

type GroupAction =
  | { action: 'create'; name: string; iconName: string; isPublic: boolean }
  | { action: 'update'; groupId: string; name?: string; isPublic?: boolean }
  | { action: 'invite'; groupId: string; target: string }
  | { action: 'respond'; groupId: string; accept: boolean }
  | { action: 'join'; groupId: string }
  | { action: 'leave'; groupId: string; newLeader?: string }
  | { action: 'remove'; groupId: string; userId: string }
  | { action: 'preferences'; groupId: string; order?: string[]; notify?: boolean }
  | { action: 'react'; entryId: string; value: -1 | 0 | 1 }
  | { action: 'move'; entryId: string; meal: GroupMeal }
  | { action: 'nudge'; groupId: string; day: string; targetId: string; meal: GroupMeal }
  | {
      action: 'message'
      groupId: string
      body: string
      requestId: string
      /** The message this answers. */
      replyTo?: string
      /** One of the viewer's own food posts to share; the body may then be empty. */
      postId?: string
      /** One of the viewer's own workouts to share, from the logger or a health store. */
      workout?: Pick<ChatWorkout, 'source' | 'id'>
      /** The quote and the card as drawn while sending, kept on the row until a refetch. */
      sent?: Pick<GroupMessage, 'reply_to' | 'food' | 'workout'>
    }
  | {
      action: 'reactMessage'
      groupId: string
      messageId: string
      /** Null takes the viewer's reaction back. */
      emoji: MessageReaction | null
    }
  | { action: 'deleteMessage'; groupId: string; messageId: string }
  | { action: 'reportMessage'; groupId: string; messageId: string }
  | { action: 'reportGroup'; groupId: string }
  /** `refresh` rereads the chat bar once the read lands: the chat was just open. */
  | { action: 'read'; groupId: string; refresh?: boolean }

/**
 * Asks the groups function to push a nudge, an invite or a chat message. Fire
 * and forget: the write has landed, and a missing push is not worth an error on
 * screen. The server marks each one pushed, so a resent message rings nobody twice.
 */
function notify(kind: 'nudge' | 'invite' | 'message', id: unknown) {
  if (typeof id !== 'string') return
  void supabase.functions.invoke('groups', { body: { kind, id } }).catch(() => undefined)
}

/** An invite answered after its group filled. The invite is withdrawn. */
class GroupFullError extends Error {
  hint = 'group_full'
}

async function perform(input: GroupAction): Promise<unknown> {
  switch (input.action) {
    case 'create':
      return await rpc('create_group', {
        p_name: input.name,
        p_icon_name: input.iconName,
        p_is_public: input.isPublic,
      })
    case 'update':
      return await rpc('update_group', {
        p_group_id: input.groupId,
        p_name: unset(input.name),
        p_icon_name: unset<string>(null),
        p_is_public: unset(input.isPublic),
      })
    case 'invite': {
      const id = await rpc('invite_to_group', { p_group_id: input.groupId, p_target: input.target })
      notify('invite', id)
      return id
    }
    case 'respond': {
      const answer = await rpc('respond_to_group_invite', {
        p_group_id: input.groupId,
        p_accept: input.accept,
      })
      if (answer === 'full') throw new GroupFullError('group full')
      return answer
    }
    case 'join':
      return await rpc('join_group', { p_group_id: input.groupId })
    case 'leave':
      return await rpc('leave_group', {
        p_group_id: input.groupId,
        p_new_leader: unset(input.newLeader),
      })
    case 'remove':
      return await rpc('remove_group_member', {
        p_group_id: input.groupId,
        p_user_id: input.userId,
      })
    case 'preferences':
      return await rpc('set_group_preferences', {
        p_group_id: input.groupId,
        p_board_order: unset(input.order),
        p_notify: unset(input.notify),
      })
    case 'react':
      return await rpc('set_group_reaction', { p_entry_id: input.entryId, p_value: input.value })
    case 'move':
      return await rpc('set_entry_board_meal', { p_entry_id: input.entryId, p_meal: input.meal })
    case 'nudge': {
      const id = await rpc('nudge_group_member', {
        p_group_id: input.groupId,
        p_target_id: input.targetId,
        p_day: input.day,
        p_meal: input.meal,
      })
      notify('nudge', id)
      return id
    }
    case 'message': {
      const id = await rpc('send_group_message', {
        p_group_id: input.groupId,
        p_body: input.body,
        p_request_id: input.requestId,
        p_reply_to: unset(input.replyTo),
        p_post_id: unset(input.postId),
        p_workout_id: unset(input.workout?.source === 'workout' ? input.workout.id : null),
        p_activity_id: unset(input.workout?.source === 'activity' ? input.workout.id : null),
      })
      notify('message', id)
      return id
    }
    case 'reactMessage':
      return await rpc('set_group_message_reaction', {
        p_message_id: input.messageId,
        p_emoji: unset<string>(input.emoji),
      })
    case 'deleteMessage':
      return await rpc('delete_group_message', { p_message_id: input.messageId })
    case 'reportMessage':
      return await rpc('report_group_message', { p_message_id: input.messageId })
    case 'reportGroup':
      return await rpc('report_group', { p_group_id: input.groupId })
    case 'read':
      return await rpc('mark_group_chat_read', { p_group_id: input.groupId })
  }
}

const named = (name: string) => (query: { queryKey: readonly unknown[] }) =>
  query.queryKey[2] === name
const ofGroup = (groupId: string) => (query: { queryKey: readonly unknown[] }) =>
  (query.queryKey[3] as { groupId?: string } | undefined)?.groupId === groupId

/** Every cached board, patched in place: a reaction or a move shows in every group at once. */
function patchEntry(
  client: QueryClient,
  userId: string,
  entryId: string,
  patch: (entry: BoardEntry) => BoardEntry,
) {
  client.setQueriesData<GroupBoard>(
    { queryKey: keys.groups(userId), predicate: named('group_board') },
    (board) =>
      board && {
        ...board,
        members: board.members.map((member) =>
          member.entries.some((entry) => entry.id === entryId)
            ? {
                ...member,
                entries: member.entries.map((entry) =>
                  entry.id === entryId ? patch(entry) : entry,
                ),
              }
            : member,
        ),
      },
  )
}

/**
 * Every cached thread's cards of one food, patched in place, as `patchEntry`
 * does the boards: a thumb given in the chat shows on the board and back.
 */
function patchFoodCards(
  client: QueryClient,
  userId: string,
  entryId: string,
  patch: (food: ChatFood) => ChatFood,
) {
  client.setQueriesData<GroupThread>(
    { queryKey: keys.groups(userId), predicate: named('group_messages') },
    (thread) =>
      thread?.messages.some((message) => message.food?.entry_id === entryId)
        ? {
            ...thread,
            messages: thread.messages.map((message) =>
              message.food?.entry_id === entryId
                ? { ...message, food: patch(message.food) }
                : message,
            ),
          }
        : thread,
  )
}

function findFoodCard(client: QueryClient, userId: string, entryId: string): ChatFood | undefined {
  for (const [, thread] of client.getQueriesData<GroupThread>({
    queryKey: keys.groups(userId),
    predicate: named('group_messages'),
  })) {
    const food = thread?.messages.find((message) => message.food?.entry_id === entryId)?.food
    if (food) return food
  }
  return undefined
}

/**
 * The viewer's own vote moved from one answer to another. Each board and each
 * chat counts only its own group's members, so the counts differ by group and
 * are shifted, never copied from one to the rest.
 */
function shiftVote<T extends { likes?: number; dislikes?: number; mine?: -1 | 0 | 1 }>(
  votes: T,
  to: -1 | 0 | 1,
): T {
  const from = votes.mine ?? 0
  return {
    ...votes,
    likes: (votes.likes ?? 0) - (from === 1 ? 1 : 0) + (to === 1 ? 1 : 0),
    dislikes: (votes.dislikes ?? 0) - (from === -1 ? 1 : 0) + (to === -1 ? 1 : 0),
    mine: to,
  }
}

function findEntry(client: QueryClient, userId: string, entryId: string): BoardEntry | undefined {
  for (const [, board] of client.getQueriesData<GroupBoard>({
    queryKey: keys.groups(userId),
    predicate: named('group_board'),
  })) {
    for (const member of board?.members ?? []) {
      const entry = member.entries.find((candidate) => candidate.id === entryId)
      if (entry) return entry
    }
  }
  return undefined
}

/** A message with the viewer's reaction moved to `emoji`, its counts shifted to match. */
export function reacted(message: GroupMessage, emoji: string | null): GroupMessage {
  const from = message.my_reaction ?? null
  if (from === emoji) return message
  const counts = new Map((message.reactions ?? []).map((r) => [r.emoji, r.count]))
  if (from) counts.set(from, (counts.get(from) ?? 1) - 1)
  if (emoji) counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
  return {
    ...message,
    my_reaction: emoji,
    reactions: [...counts]
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ emoji: key, count })),
  }
}

/** Puts back exactly what an optimistic write changed. */
type Rollback = () => void

export function useGroupAction() {
  const userId = useUserId()
  const client = useQueryClient()
  const root = keys.groups(userId)
  /** Refetches the named reads, of one group when `groupId` is given. */
  const refresh = (groupId: string | null, ...names: string[]) => {
    void client.invalidateQueries({
      queryKey: root,
      predicate: (query) =>
        names.includes(String(query.queryKey[2])) && (!groupId || ofGroup(groupId)(query)),
    })
  }
  return useMutation<unknown, unknown, GroupAction, Rollback | undefined>({
    mutationFn: perform,
    onMutate: async (input) => {
      switch (input.action) {
        case 'react': {
          // Drawn at once on every board and chat card of this food, and
          // reconciled by the board's own poll and the thread's next read, so
          // a quick like then unlike never redraws the first tap's answer over
          // the second. A read already on its way saw the entry before this
          // write, and would draw the old answer over it; only the threads
          // holding this food are stopped, so a thread fetching a message
          // that just arrived keeps it. A refusal puts each cache's own vote
          // back, not whole boards.
          const holds = (query: Query) =>
            named('group_board')(query) ||
            (named('group_messages')(query) &&
              Boolean(
                (query.state.data as GroupThread | undefined)?.messages.some(
                  (message) => message.food?.entry_id === input.entryId,
                ),
              ))
          await client.cancelQueries({ queryKey: root, predicate: holds })
          const onBoard = findEntry(client, userId, input.entryId)?.mine
          const onCard = findFoodCard(client, userId, input.entryId)?.mine
          if (onBoard === undefined && onCard === undefined) return undefined
          patchEntry(client, userId, input.entryId, (entry) => shiftVote(entry, input.value))
          patchFoodCards(client, userId, input.entryId, (food) => shiftVote(food, input.value))
          return () => {
            if (onBoard !== undefined) {
              patchEntry(client, userId, input.entryId, (entry) => shiftVote(entry, onBoard))
            }
            if (onCard !== undefined) {
              patchFoodCards(client, userId, input.entryId, (food) => shiftVote(food, onCard))
            }
          }
        }
        case 'move': {
          // Drawn at once and reconciled by the board's own poll. A refusal
          // restores this one entry, not whole boards.
          await client.cancelQueries({ queryKey: root, predicate: named('group_board') })
          const before = findEntry(client, userId, input.entryId)
          if (!before) return undefined
          patchEntry(client, userId, input.entryId, (entry) => ({ ...entry, meal: input.meal }))
          return () =>
            patchEntry(client, userId, input.entryId, (entry) => ({ ...entry, meal: before.meal }))
        }
        case 'reactMessage': {
          // Drawn at once, as a heart is on Instagram; a refusal puts the
          // message back as it was.
          const key = messagesKey(userId, input.groupId)
          await client.cancelQueries({ queryKey: key })
          const before = client
            .getQueryData<GroupThread>(key)
            ?.messages.find((message) => message.id === input.messageId)
          if (!before) return undefined
          const swap = (message: GroupMessage) =>
            message.id === input.messageId ? reacted(before, input.emoji) : message
          patchThread(client, userId, input.groupId, (messages) => messages.map(swap))
          return () =>
            patchThread(client, userId, input.groupId, (messages) =>
              messages.map((message) => (message.id === input.messageId ? before : message)),
            )
        }
        case 'read':
          // Reading clears the bar's count; nothing to refetch.
          client.setQueryData<ChatSummary>(
            summaryKey(userId, input.groupId),
            (summary) => summary && { ...summary, unread: 0 },
          )
          return undefined
        case 'preferences':
        case 'update': {
          // A switch that snapped back until the refetch landed read as a tap
          // that did not take.
          const key = detailsKey(userId, input.groupId)
          const before = client.getQueryData<GroupDetails>(key)
          if (!before) return undefined
          client.setQueryData<GroupDetails>(key, {
            ...before,
            ...(input.action === 'preferences' && input.notify !== undefined
              ? { notify: input.notify }
              : {}),
            ...(input.action === 'update' && input.isPublic !== undefined
              ? { is_public: input.isPublic }
              : {}),
            ...(input.action === 'update' && input.name !== undefined ? { name: input.name } : {}),
          })
          return () => client.setQueryData(key, before)
        }
        default:
          return undefined
      }
    },
    onError: (_error, _input, rollback) => rollback?.(),
    // Not awaited, so a sheet or a toast does not wait on the refetch.
    onSettled: (data, error, input) => {
      switch (input.action) {
        case 'react':
        case 'move':
          return
        case 'reactMessage':
          // The counts others added meanwhile come with a reread of it.
          rereadReacted(client, userId, input.groupId, [input.messageId], () => {
            void client.invalidateQueries({ queryKey: messagesKey(userId, input.groupId) })
          })
          return
        case 'read':
          if (input.refresh) {
            void client.invalidateQueries({ queryKey: summaryKey(userId, input.groupId) })
          }
          return
        case 'nudge':
          void client.invalidateQueries({ queryKey: boardKey(userId, input.groupId, input.day) })
          return
        case 'message':
        case 'deleteMessage':
        case 'reportMessage': {
          const key = messagesKey(userId, input.groupId)
          // The sent message joins the thread the moment the server answers,
          // rather than after the refetch, so its "Sending" clears at once and
          // its own broadcast finds it already there. The refetch puts the
          // server's time on it.
          if (input.action === 'message' && !error && typeof data === 'string') {
            patchThread(client, userId, input.groupId, (messages) =>
              messages.some((message) => message.id === data)
                ? messages
                : [
                    ...messages,
                    ownMessage(userId, data, input.body, new Date().toISOString(), input.sent),
                  ],
            )
          }
          if (input.action === 'message') {
            void client.invalidateQueries({ queryKey: key })
            return
          }
          // Deleted or reported, it leaves the thread here and needs no reread;
          // only the chat bar's preview may have been that message.
          if (!error) {
            patchThread(client, userId, input.groupId, (messages) =>
              messages.filter((message) => message.id !== input.messageId),
            )
          }
          void client.invalidateQueries({ queryKey: summaryKey(userId, input.groupId) })
          return
        }
        case 'invite':
          refresh(input.groupId, 'group_details', 'group_invite_suggestions')
          return
        case 'preferences':
          refresh(input.groupId, 'group_details', ...(input.order ? ['group_board'] : []))
          return
        case 'update':
          refresh(input.groupId, 'group_details', 'group_board')
          refresh(null, 'my_groups')
          return
        case 'reportGroup':
          refresh(null, 'public_groups')
          return
        case 'leave':
          // Its boards and chats are no longer this person's to read.
          if (!error) client.removeQueries({ queryKey: root, predicate: ofGroup(input.groupId) })
          refresh(null, 'my_groups')
          return
        default:
          // Membership changed: lists, boards and the invite count may all differ.
          void client.invalidateQueries({ queryKey: root })
      }
    },
  })
}
