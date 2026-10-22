import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import type { Listener } from '@/lib/realtime'
import {
  type BoardEntry,
  type GroupBoard,
  type GroupMessage,
  groupError,
  useGroupAction,
  useGroupChatLive,
} from '../groups'
import { keys } from '../keys'

const mockRpc = jest.fn()
const mockInvoke = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))
jest.mock('../session', () => ({ useUserId: () => 'viewer' }))
const mockListeners = new Map<string, Listener>()
const mockStops: string[] = []
jest.mock('@/lib/realtime', () => ({
  listen: (topic: string, listener: Listener) => {
    mockListeners.set(topic, listener)
    return () => {
      mockStops.push(topic)
      mockListeners.delete(topic)
    }
  },
}))

function response(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error })
  return Object.assign(promise, { abortSignal: () => promise })
}
const clients: QueryClient[] = []
afterEach(() => {
  // Query timers would otherwise keep jest alive after the last test.
  for (const client of clients.splice(0)) client.clear()
})

function pending() {
  let settle!: (value: unknown) => void
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  return { request: Object.assign(promise, { abortSignal: () => promise }), settle }
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const entry = (patch: Partial<BoardEntry> = {}): BoardEntry => ({
  id: 'e1',
  meal: 'lunch',
  name: 'Chicken rice',
  kcal: 610,
  carbs_g: 78,
  protein_g: 32,
  fat_g: 16,
  photo_path: null,
  icon_set: 'dishes',
  icon_name: 'chicken-rice',
  logged_at: '2026-10-21T04:45:00Z',
  serving_label: '1 plate',
  likes: 2,
  dislikes: 0,
  mine: 0,
  ...patch,
})
const board = (entries: BoardEntry[]): GroupBoard => ({
  group: {
    id: 'g1',
    name: 'Makan',
    icon_name: 'rice-bowl',
    is_public: false,
    leader_id: 'a',
    member_count: 2,
  },
  members: [
    {
      person: { id: 'friend', name: 'Aisha', handle: 'aisha', avatar_path: null },
      entries,
      nudges: {},
      nudgeable: [],
      workout: null,
    },
  ],
  chat: { unread: 0, last: null },
})
const boardKey = (groupId: string) =>
  keys.groupsRead('viewer', 'group_board', { groupId, day: '2026-10-21' })

beforeEach(() => {
  jest.clearAllMocks()
  mockListeners.clear()
  mockStops.length = 0
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
})

it('reads the refusal the database names in its hint', () => {
  expect(groupError({ hint: 'group_full' })).toBe('group_full')
  expect(groupError({ message: 'boom' })).toBeNull()
  expect(groupError(null)).toBeNull()
})

it('sends an unchanged field as null, so the function is still found by its signature', async () => {
  const { wrapper } = setup()
  mockRpc.mockReturnValue(response(null))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ action: 'update', groupId: 'g1', isPublic: true })
  })
  expect(mockRpc).toHaveBeenCalledWith('update_group', {
    p_group_id: 'g1',
    p_name: null,
    p_icon_name: null,
    p_is_public: true,
  })
})

it('asks the groups function to push a nudge once the nudge is written', async () => {
  const { wrapper } = setup()
  mockRpc.mockReturnValue(response('nudge-id'))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      action: 'nudge',
      groupId: 'g1',
      day: '2026-10-21',
      targetId: 'friend',
      meal: 'lunch',
    })
  })
  expect(mockInvoke).toHaveBeenCalledWith('groups', { body: { kind: 'nudge', id: 'nudge-id' } })
})

it('does not push when the database refused the nudge', async () => {
  const { wrapper } = setup()
  mockRpc.mockReturnValue(response(null, { message: 'Nudged recently', hint: 'nudge_closed' }))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        action: 'nudge',
        groupId: 'g1',
        day: '2026-10-21',
        targetId: 'friend',
        meal: 'lunch',
      }),
    ).rejects.toMatchObject({ hint: 'nudge_closed' })
  })
  expect(mockInvoke).not.toHaveBeenCalled()
})

it('draws a reaction on every cached board at once, and puts it back when refused', async () => {
  const { client, wrapper } = setup()
  // The same plate, counted by each group's own members.
  client.setQueryData(boardKey('g1'), board([entry()]))
  client.setQueryData(boardKey('g2'), board([entry({ likes: 0 })]))
  let refuse!: (value: unknown) => void
  mockRpc.mockReturnValueOnce(
    Object.assign(
      new Promise((resolve) => {
        refuse = resolve
      }),
      { abortSignal: () => undefined },
    ),
  )
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    result.current.mutate({
      action: 'react',
      entryId: 'e1',
      value: 1,
    })
  })
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g2'))?.members[0].entries[0]).toMatchObject({
      likes: 1,
      mine: 1,
    }),
  )
  expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0].likes).toBe(3)
  await act(async () => refuse({ data: null, error: { message: 'no' } }))
  // Each board gets its own count back, not the first one's.
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      likes: 2,
      mine: 0,
    }),
  )
  expect(client.getQueryData<GroupBoard>(boardKey('g2'))?.members[0].entries[0]).toMatchObject({
    likes: 0,
    mine: 0,
  })
})

it('swaps a like for a dislike without double counting', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(boardKey('g1'), board([entry({ likes: 2, mine: 1 })]))
  const write = pending()
  mockRpc.mockReturnValueOnce(write.request).mockReturnValue(response(null))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    result.current.mutate({
      action: 'react',
      entryId: 'e1',
      value: -1,
    })
  })
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      likes: 1,
      dislikes: 1,
      mine: -1,
    }),
  )
  await act(async () => write.settle({ data: null, error: null }))
})

it('moves an entry to another column on the board straight away', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(boardKey('g1'), board([entry()]))
  const write = pending()
  mockRpc.mockReturnValueOnce(write.request).mockReturnValue(response(null))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    result.current.mutate({ action: 'move', entryId: 'e1', meal: 'dinner' })
  })
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      meal: 'dinner',
    }),
  )
  await act(async () => write.settle({ data: null, error: null }))
})

const DAY = '2026-10-21'
const TOPIC = `group-chat:g1:${DAY}`
const messagesKey = keys.groupsRead('viewer', 'group_messages', { groupId: 'g1', day: DAY })
const message = (id: string, mine = false): GroupMessage => ({
  id,
  author: { id: mine ? 'viewer' : 'friend', name: 'Aisha', handle: 'aisha', avatar_path: null },
  body: `message ${id}`,
  created_at: '2026-10-21T04:45:00Z',
  mine,
})

/** A messages query with an observer, so an invalidation refetches it. */
function watchMessages(client: QueryClient) {
  return new QueryObserver(client, {
    queryKey: messagesKey,
    queryFn: () => mockRpc('group_messages').then((answer: { data: unknown }) => answer.data),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

describe('live chat', () => {
  it("listens on the day's topic while mounted, and says when it is live", async () => {
    const { wrapper } = setup()
    const { result, unmount } = await renderHook(() => useGroupChatLive('g1', DAY), { wrapper })
    expect(result.current).toBe(false)
    expect(mockListeners.has(TOPIC)).toBe(true)

    mockRpc.mockReturnValue(response([]))
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    expect(result.current).toBe(true)
    await act(async () => mockListeners.get(TOPIC)?.onLive(false))
    expect(result.current).toBe(false)

    await unmount()
    expect(mockStops).toEqual([TOPIC])
  })

  it('catches up once each time the channel joins', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, [message('m1')])
    const query = watchMessages(client)
    const unsubscribe = query.subscribe(() => undefined)
    mockRpc.mockReturnValue(response([message('m1'), message('m2')]))
    await renderHook(() => useGroupChatLive('g1', DAY), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() => expect(client.getQueryData<GroupMessage[]>(messagesKey)).toHaveLength(2))
    unsubscribe()
  })

  it('refetches for a message it has not got, and not for one it has', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, [message('m1', true)])
    const query = watchMessages(client)
    const unsubscribe = query.subscribe(() => undefined)
    await renderHook(() => useGroupChatLive('g1', DAY), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onEvent('message', { ids: ['m1'] }))
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockReturnValue(response([message('m1', true), message('m2')]))
    await act(async () => mockListeners.get(TOPIC)?.onEvent('message', { ids: ['m2'] }))
    await waitFor(() => expect(client.getQueryData<GroupMessage[]>(messagesKey)).toHaveLength(2))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('takes a removed message out in place, without asking the server', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, [message('m1'), message('m2')])
    await renderHook(() => useGroupChatLive('g1', DAY), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { ids: ['m1'] }))
    expect(client.getQueryData<GroupMessage[]>(messagesKey)?.map((row) => row.id)).toEqual(['m2'])
    expect(mockRpc).not.toHaveBeenCalled()

    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { nonsense: true }))
    expect(client.getQueryData<GroupMessage[]>(messagesKey)?.map((row) => row.id)).toEqual(['m2'])
  })

  it('puts a sent message in the thread as soon as the server answers', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, [message('m1')])
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    const sent = pending()
    mockRpc.mockReturnValueOnce(sent.request)
    let done!: Promise<unknown>
    await act(async () => {
      done = result.current.mutateAsync({
        action: 'message',
        groupId: 'g1',
        day: DAY,
        body: 'on my way',
        requestId: 'r1',
      })
    })
    expect(client.getQueryData<GroupMessage[]>(messagesKey)).toHaveLength(1)
    await act(async () => {
      sent.settle({ data: 'm2', error: null })
      await done
    })
    const rows = client.getQueryData<GroupMessage[]>(messagesKey)
    expect(rows?.map((row) => [row.id, row.body, row.mine])).toEqual([
      ['m1', 'message m1', false],
      ['m2', 'on my way', true],
    ])
  })

  it('takes a deleted message out once the delete lands', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, [message('m1', true), message('m2')])
    mockRpc.mockReturnValue(response(null))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        action: 'deleteMessage',
        groupId: 'g1',
        day: DAY,
        messageId: 'm1',
      })
    })
    expect(client.getQueryData<GroupMessage[]>(messagesKey)?.map((row) => row.id)).toEqual(['m2'])
  })
})
