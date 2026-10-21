import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'

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
export const GROUP_CAPACITY = 10

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
  chat: {
    /** Across the whole group since the viewer last read it. */
    unread: number
    /** This day's latest message. */
    last: { author: GroupPerson; body: string } | null
  }
}

export type GroupMessage = {
  id: string
  author: GroupPerson
  body: string
  created_at: string
  mine: boolean
  /** Not yet confirmed by the server. */
  pending?: boolean
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
const messagesKey = (userId: string, groupId: string, day: string) =>
  keys.groupsRead(userId, 'group_messages', { groupId, day })
const detailsKey = (userId: string, groupId: string) =>
  keys.groupsRead(userId, 'group_details', { groupId })

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
      (await rpc('my_group_invites', undefined, signal)) as unknown as GroupInvite[],
    enabled,
    ...SHORT,
  })
}

/**
 * The red number on the tab. An invite also arrives as a push, which is what
 * makes it timely; this only has to catch up, so it asks every five minutes
 * while the app is in front, and the Groups tab refreshes it on focus.
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
      (await rpc(
        'public_groups',
        { p_query: trimmed || undefined, p_limit: 20 },
        signal,
      )) as unknown as PublicGroup[],
    placeholderData: (previous) => previous,
    ...SHORT,
  })
}

/**
 * One day of a group. `live` polls every half minute, which is what makes a
 * friend's lunch appear without pulling; the pages either side are fetched
 * once so a swipe lands on a drawn board, and do not poll.
 */
export function useGroupBoard(groupId: string, day: string, enabled: boolean, live: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: boardKey(userId, groupId, day),
    queryFn: async ({ signal }) =>
      (await rpc(
        'group_board',
        { p_group_id: groupId, p_day: day },
        signal,
      )) as unknown as GroupBoard,
    enabled,
    refetchInterval: live ? 30_000 : false,
    ...SHORT,
  })
}

export function useGroupMessages(groupId: string, day: string, open: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: messagesKey(userId, groupId, day),
    queryFn: async ({ signal }) =>
      (await rpc(
        'group_messages',
        { p_group_id: groupId, p_day: day },
        signal,
      )) as unknown as GroupMessage[],
    enabled: open,
    refetchInterval: open ? 5_000 : false,
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
  | { action: 'react'; groupId: string; day: string; entryId: string; value: -1 | 0 | 1 }
  | { action: 'move'; entryId: string; meal: GroupMeal }
  | { action: 'nudge'; groupId: string; day: string; targetId: string; meal: GroupMeal }
  | { action: 'message'; groupId: string; day: string; body: string; requestId: string }
  | { action: 'deleteMessage'; groupId: string; day: string; messageId: string }
  | { action: 'reportMessage'; groupId: string; day: string; messageId: string }
  | { action: 'reportGroup'; groupId: string }
  | { action: 'read'; groupId: string }

/**
 * Asks the groups function to push a nudge or an invite. Fire and forget: the
 * write has landed, and a missing push is not worth an error on screen.
 */
function notify(kind: 'nudge' | 'invite', id: unknown) {
  if (typeof id !== 'string') return
  void supabase.functions.invoke('groups', { body: { kind, id } }).catch(() => undefined)
}

/** An invite answered after its group filled. The invite is withdrawn. */
export class GroupFullError extends Error {
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
    case 'message':
      return await rpc('send_group_message', {
        p_group_id: input.groupId,
        p_day: input.day,
        p_body: input.body,
        p_request_id: input.requestId,
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

/** Puts back exactly what an optimistic write changed. */
type Rollback = () => void

export function useGroupAction() {
  const userId = useUserId()
  const client = useQueryClient()
  const root = keys.groups(userId)
  const refresh = (...names: string[]) => {
    void client.invalidateQueries({
      queryKey: root,
      predicate: (query) => names.includes(String(query.queryKey[2])),
    })
  }
  return useMutation<unknown, unknown, GroupAction, Rollback | undefined>({
    mutationFn: perform,
    onMutate: async (input) => {
      switch (input.action) {
        case 'react':
        case 'move': {
          // Drawn at once and reconciled by the board's own poll, so a quick
          // like then unlike never redraws the first tap's answer over the
          // second. A refusal restores this one entry, not whole boards.
          const before = findEntry(client, userId, input.entryId)
          if (!before) return undefined
          patchEntry(client, userId, input.entryId, (entry) => {
            if (input.action === 'move') return { ...entry, meal: input.meal }
            const likes = entry.likes - (entry.mine === 1 ? 1 : 0) + (input.value === 1 ? 1 : 0)
            const dislikes =
              entry.dislikes - (entry.mine === -1 ? 1 : 0) + (input.value === -1 ? 1 : 0)
            return { ...entry, likes, dislikes, mine: input.value }
          })
          return () =>
            patchEntry(client, userId, input.entryId, (entry) =>
              input.action === 'move'
                ? { ...entry, meal: before.meal }
                : { ...entry, likes: before.likes, dislikes: before.dislikes, mine: before.mine },
            )
        }
        case 'message': {
          const key = messagesKey(userId, input.groupId, input.day)
          await client.cancelQueries({ queryKey: key })
          client.setQueryData<GroupMessage[]>(key, (messages) => [
            ...(messages ?? []),
            {
              id: input.requestId,
              author: { id: userId, name: '', handle: '', avatar_path: null },
              body: input.body,
              created_at: new Date().toISOString(),
              mine: true,
              pending: true,
            },
          ])
          return () =>
            client.setQueryData<GroupMessage[]>(key, (messages) =>
              messages?.filter((message) => message.id !== input.requestId),
            )
        }
        case 'read':
          // Reading clears the count on this group's boards; nothing to refetch.
          client.setQueriesData<GroupBoard>(
            {
              queryKey: root,
              predicate: (query) => named('group_board')(query) && ofGroup(input.groupId)(query),
            },
            (board) => board && { ...board, chat: { ...board.chat, unread: 0 } },
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
    onSettled: (_data, error, input) => {
      switch (input.action) {
        case 'react':
        case 'move':
        case 'read':
          return
        case 'nudge':
          void client.invalidateQueries({ queryKey: boardKey(userId, input.groupId, input.day) })
          return
        case 'message':
        case 'deleteMessage':
        case 'reportMessage':
          void client.invalidateQueries({ queryKey: messagesKey(userId, input.groupId, input.day) })
          if (input.action !== 'message') {
            void client.invalidateQueries({ queryKey: boardKey(userId, input.groupId, input.day) })
          }
          return
        case 'invite':
          refresh('group_details')
          return
        case 'preferences':
          refresh('group_details', ...(input.order ? ['group_board'] : []))
          return
        case 'update':
          refresh('group_details', 'group_board', 'my_groups')
          return
        case 'reportGroup':
          refresh('public_groups')
          return
        case 'leave':
          // Its boards and chats are no longer this person's to read.
          if (!error) client.removeQueries({ queryKey: root, predicate: ofGroup(input.groupId) })
          refresh('my_groups')
          return
        default:
          // Membership changed: lists, boards and the invite count may all differ.
          void client.invalidateQueries({ queryKey: root })
      }
    },
  })
}
