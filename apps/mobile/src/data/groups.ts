import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'

/**
 * Groups read members' diaries live on the server, so nothing here copies an
 * entry. Each screen is one RPC that answers jsonb, typed below by hand because
 * the generated types only know it as `Json`.
 */

export type GroupMeal = Database['public']['Enums']['group_meal']
export const GROUP_MEALS: readonly GroupMeal[] = ['breakfast', 'lunch', 'dinner']

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
  is_public: boolean
  member_count: number
  inviter: GroupPerson
  created_at: string
}

export type PublicGroup = { id: string; name: string; icon_name: string; member_count: number }

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
  quantity: number
  /** The owner put it in this column by hand. */
  moved: boolean
  likes: number
  dislikes: number
  /** The viewer's own reaction: 1, -1 or 0. */
  mine: -1 | 0 | 1
}

export type BoardNudge = { by: GroupPerson; at: string }

export type BoardMember = {
  person: GroupPerson
  /** The member's own calendar date now, which decides what "today" is for them. */
  today: string
  entries: BoardEntry[]
  nudges: Partial<Record<GroupMeal, BoardNudge>>
  nudgeable: GroupMeal[]
  workout: {
    name: string
    kind: string
    duration_s: number
    distance_m: number | null
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
  day: string
  members: BoardMember[]
  chat: {
    count: number
    unread: number
    last: { author: GroupPerson; body: string; at: string } | null
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

export type GroupDetails = {
  id: string
  name: string
  icon_name: string
  is_public: boolean
  leader_id: string | null
  notify: boolean
  members: GroupPerson[]
  invites: { person: GroupPerson; created_at: string }[]
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
    ...LIVE,
  })
}

/** The red number on the tab and on the invites button. Polled, since there is no push in-app. */
export function useGroupInviteCount() {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_invite_count'),
    queryFn: async ({ signal }) => await rpc('group_invite_count', undefined, signal),
    refetchInterval: 60_000,
    ...LIVE,
  })
}

export function usePublicGroups(query: string, enabled: boolean) {
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
    enabled,
    placeholderData: (previous) => previous,
    ...LIVE,
  })
}

/**
 * One day of a group. Refreshed every half minute while on screen, which is
 * what makes a friend's lunch appear without pulling.
 */
export function useGroupBoard(groupId: string, day: string, active: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_board', { groupId, day }),
    queryFn: async ({ signal }) =>
      (await rpc(
        'group_board',
        { p_group_id: groupId, p_day: day },
        signal,
      )) as unknown as GroupBoard,
    enabled: active,
    refetchInterval: active ? 30_000 : false,
    ...LIVE,
  })
}

export function useGroupMessages(groupId: string, day: string, open: boolean) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_messages', { groupId, day }),
    queryFn: async ({ signal }) =>
      (await rpc(
        'group_messages',
        { p_group_id: groupId, p_day: day },
        signal,
      )) as unknown as GroupMessage[],
    enabled: open,
    refetchInterval: open ? 5_000 : false,
    ...LIVE,
  })
}

export function useGroupDetails(groupId: string) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.groupsRead(userId, 'group_details', { groupId }),
    queryFn: async ({ signal }) =>
      (await rpc('group_details', { p_group_id: groupId }, signal)) as unknown as GroupDetails,
    ...LIVE,
  })
}

export type GroupAction =
  | { action: 'create'; name: string; iconName: string; isPublic: boolean }
  | { action: 'update'; groupId: string; name?: string; iconName?: string; isPublic?: boolean }
  | { action: 'invite'; groupId: string; target: string }
  | { action: 'respond'; groupId: string; accept: boolean }
  | { action: 'join'; groupId: string }
  | { action: 'leave'; groupId: string; newLeader?: string }
  | { action: 'remove'; groupId: string; userId: string }
  | { action: 'preferences'; groupId: string; order?: string[]; notify?: boolean }
  | { action: 'react'; groupId: string; day: string; entryId: string; value: -1 | 0 | 1 }
  | { action: 'move'; entryId: string; meal: GroupMeal | null }
  | { action: 'nudge'; groupId: string; day: string; targetId: string; meal: GroupMeal }
  | { action: 'message'; groupId: string; day: string; body: string; requestId: string }
  | { action: 'deleteMessage'; groupId: string; day: string; messageId: string }
  | { action: 'reportMessage'; groupId: string; day: string; messageId: string }
  | { action: 'read'; groupId: string }

/**
 * Asks the groups function to push a nudge or an invite. Fire and forget: the
 * write has landed, and a missing push is not worth an error on screen.
 */
function notify(kind: 'nudge' | 'invite', id: unknown) {
  if (typeof id !== 'string') return
  void supabase.functions.invoke('groups', { body: { kind, id } }).catch(() => undefined)
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
        p_icon_name: unset(input.iconName),
        p_is_public: unset(input.isPublic),
      })
    case 'invite': {
      const id = await rpc('invite_to_group', { p_group_id: input.groupId, p_target: input.target })
      notify('invite', id)
      return id
    }
    case 'respond':
      return await rpc('respond_to_group_invite', {
        p_group_id: input.groupId,
        p_accept: input.accept,
      })
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
      return await rpc('set_entry_board_meal', {
        p_entry_id: input.entryId,
        p_meal: unset(input.meal),
      })
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
    case 'read':
      return await rpc('mark_group_chat_read', { p_group_id: input.groupId })
  }
}

type Snapshot = { queryKey: readonly unknown[]; data: unknown }[]

/** Every cached board, patched in place: a reaction or a move shows in every group at once. */
function patchBoards(
  client: QueryClient,
  userId: string,
  patch: (entry: BoardEntry) => BoardEntry,
) {
  client.setQueriesData<GroupBoard>(
    { queryKey: keys.groups(userId), predicate: (query) => query.queryKey[2] === 'group_board' },
    (board) =>
      board && {
        ...board,
        members: board.members.map((member) => ({ ...member, entries: member.entries.map(patch) })),
      },
  )
}

export function useGroupAction() {
  const userId = useUserId()
  const client = useQueryClient()
  const root = keys.groups(userId)
  const named = (...names: string[]) => ({
    queryKey: root,
    predicate: (query: { queryKey: readonly unknown[] }) =>
      names.includes(String(query.queryKey[2])),
  })
  return useMutation<unknown, unknown, GroupAction, Snapshot | undefined>({
    mutationFn: perform,
    onMutate: async (input) => {
      if (input.action === 'react') {
        const filter = named('group_board')
        await client.cancelQueries(filter)
        const snapshot = client
          .getQueriesData(filter)
          .map(([queryKey, data]) => ({ queryKey, data }))
        patchBoards(client, userId, (entry) => {
          if (entry.id !== input.entryId) return entry
          const likes = entry.likes - (entry.mine === 1 ? 1 : 0) + (input.value === 1 ? 1 : 0)
          const dislikes =
            entry.dislikes - (entry.mine === -1 ? 1 : 0) + (input.value === -1 ? 1 : 0)
          return { ...entry, likes, dislikes, mine: input.value }
        })
        return snapshot
      }
      if (input.action === 'move' && input.meal) {
        const filter = named('group_board')
        await client.cancelQueries(filter)
        const snapshot = client
          .getQueriesData(filter)
          .map(([queryKey, data]) => ({ queryKey, data }))
        const meal = input.meal
        patchBoards(client, userId, (entry) =>
          entry.id === input.entryId ? { ...entry, meal, moved: true } : entry,
        )
        return snapshot
      }
      if (input.action === 'message') {
        const filter = {
          queryKey: keys.groupsRead(userId, 'group_messages', {
            groupId: input.groupId,
            day: input.day,
          }),
        }
        await client.cancelQueries(filter)
        client.setQueryData<GroupMessage[]>(filter.queryKey, (messages) => [
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
        return undefined
      }
      return undefined
    },
    onError: (_error, input, snapshot) => {
      for (const { queryKey, data } of snapshot ?? []) client.setQueryData(queryKey, data)
      if (input.action === 'message') {
        client.setQueryData<GroupMessage[]>(
          keys.groupsRead(userId, 'group_messages', { groupId: input.groupId, day: input.day }),
          (messages) => messages?.filter((message) => message.id !== input.requestId),
        )
      }
    },
    onSettled: async (_data, _error, input) => {
      switch (input.action) {
        case 'react':
        case 'move':
          // Drawn already; a quiet refetch reconciles counts from others.
          await client.invalidateQueries({ ...named('group_board'), refetchType: 'active' })
          return
        case 'nudge':
          await client.invalidateQueries({
            queryKey: keys.groupsRead(userId, 'group_board', {
              groupId: input.groupId,
              day: input.day,
            }),
          })
          return
        case 'message':
        case 'deleteMessage':
        case 'reportMessage':
          await client.invalidateQueries({
            queryKey: keys.groupsRead(userId, 'group_messages', {
              groupId: input.groupId,
              day: input.day,
            }),
          })
          await client.invalidateQueries({
            queryKey: keys.groupsRead(userId, 'group_board', {
              groupId: input.groupId,
              day: input.day,
            }),
          })
          return
        case 'read':
          await client.invalidateQueries(named('group_board'))
          return
        case 'invite':
        case 'preferences':
          await client.invalidateQueries(named('group_details', 'group_board'))
          return
        default:
          // Membership changed: every list and board may be different now.
          await client.invalidateQueries({ queryKey: root })
      }
    },
  })
}
