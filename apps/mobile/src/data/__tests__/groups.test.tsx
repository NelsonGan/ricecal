import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { announceGroupChatPush } from '@/lib/groupChatPushes'
import type { Listener } from '@/lib/realtime'
import {
  type BoardEntry,
  type ChatSummary,
  catchUpFrom,
  type GroupBoard,
  type GroupMessage,
  type GroupThread,
  groupError,
  mergeNewer,
  mergeNewest,
  reacted,
  THREAD_PAGE,
  useGroupAction,
  useGroupBoard,
  useGroupBoardChatLive,
  useGroupChatLive,
  useGroupThread,
  useReadAsItArrives,
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

it('asks the groups function to push a chat message once it is written', async () => {
  const { wrapper } = setup()
  mockRpc.mockReturnValue(response('message-id'))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      action: 'message',
      groupId: 'g1',
      body: 'Laksa tonight?',
      requestId: 'r1',
    })
  })
  expect(mockInvoke).toHaveBeenCalledWith('groups', {
    body: { kind: 'message', id: 'message-id' },
  })
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

const TOPIC = 'group-chat:g1'
const messagesKey = keys.groupsRead('viewer', 'group_messages', { groupId: 'g1' })
const summaryKey = keys.groupsRead('viewer', 'group_chat_summary', { groupId: 'g1' })
const message = (id: string, mine = false, minute = 0): GroupMessage => ({
  id,
  author: { id: mine ? 'viewer' : 'friend', name: 'Aisha', handle: 'aisha', avatar_path: null },
  body: `message ${id}`,
  created_at: new Date(Date.UTC(2026, 9, 21, 4, minute)).toISOString(),
  mine,
})
const thread = (...messages: GroupMessage[]): GroupThread => ({ messages, more: false })
const ids = (client: QueryClient) =>
  client.getQueryData<GroupThread>(messagesKey)?.messages.map((row) => row.id)

/** A thread query with an observer, so an invalidation refetches it. */
function watchMessages(client: QueryClient) {
  return new QueryObserver(client, {
    queryKey: messagesKey,
    queryFn: () =>
      mockRpc('group_messages').then((answer: { data: GroupMessage[] }) => thread(...answer.data)),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

describe('one thread, a page at a time', () => {
  /** `count` messages a minute apart, oldest first, named by their minute. */
  const run = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => message(`m${from + index}`, false, from + index))

  it('takes a short newest page as the whole thread', () => {
    expect(mergeNewest(undefined, run(0, 3))).toEqual({ messages: run(0, 3), more: false })
  })

  it('lays the newest page over older pages already scrolled through', () => {
    const held = { messages: run(0, THREAD_PAGE + 10), more: true }
    const newest = run(12, THREAD_PAGE)
    const merged = mergeNewest(held, newest)
    expect(merged.more).toBe(true)
    expect(merged.messages.map((row) => row.id)).toEqual(
      run(0, THREAD_PAGE + 12).map((row) => row.id),
    )
  })

  it('drops what the newest page no longer has, and starts again after a gap', () => {
    const held = { messages: run(0, THREAD_PAGE), more: false }
    const newest = run(5, THREAD_PAGE).filter((row) => row.id !== 'm20')
    newest.push(message('m55', false, 55))
    const merged = mergeNewest(held, newest)
    expect(merged.messages.map((row) => row.id)).not.toContain('m20')
    expect(merged.messages[0]?.id).toBe('m0')

    const far = run(200, THREAD_PAGE)
    expect(mergeNewest(held, far)).toEqual({ messages: far, more: true })
  })

  it("keeps one copy of the viewer's own message drawn with a slow clock", () => {
    const newest = run(100, THREAD_PAGE)
    // Drawn at send with a clock an hour behind, then fetched with the server's time.
    const mine = { ...message('m149', true, 40), id: 'mine' }
    const held = { messages: [...run(90, 10), ...newest.slice(0, -1), mine], more: true }
    const merged = mergeNewest(held, [
      ...newest.slice(1),
      { ...mine, created_at: newest[49]!.created_at },
    ])
    expect(merged.messages.filter((row) => row.id === 'mine')).toHaveLength(1)
  })

  it('orders messages from the same millisecond by the microseconds the server keeps', () => {
    const at = (id: string, createdAt: string) => ({ ...message(id), created_at: createdAt })
    const newest = [at('b', '2026-10-21T04:00:00.000900+00:00'), ...run(1, THREAD_PAGE - 1)]
    // Same millisecond, earlier microsecond, and an id that sorts after: older.
    const held = { messages: [at('z', '2026-10-21T04:00:00.000100+00:00'), ...newest], more: true }
    expect(
      mergeNewest(held, newest)
        .messages.map((row) => row.id)
        .slice(0, 2),
    ).toEqual(['z', 'b'])
  })

  it('keeps a page that loaded while a refetch was on its way', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, { messages: run(100, THREAD_PAGE), more: true })
    const { result } = await renderHook(() => useGroupThread('g1', true), { wrapper })
    const newest = pending()
    mockRpc.mockReturnValueOnce(newest.request)
    await act(async () => {
      void client.refetchQueries({ queryKey: messagesKey })
    })
    mockRpc.mockReturnValueOnce(response(run(50, THREAD_PAGE)))
    await act(async () => {
      await result.current.loadOlder()
    })
    expect(ids(client)?.[0]).toBe('m50')
    await act(async () => newest.settle({ data: run(101, THREAD_PAGE), error: null }))
    await waitFor(() => expect(ids(client)?.at(-1)).toBe('m150'))
    expect(ids(client)?.[0]).toBe('m50')
  })

  it('reads the page before the oldest message held, once, as the viewer scrolls up', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, { messages: run(100, THREAD_PAGE), more: true })
    const { result } = await renderHook(() => useGroupThread('g1', true), { wrapper })
    const older = pending()
    mockRpc.mockReturnValueOnce(older.request)
    await act(async () => {
      void result.current.loadOlder()
      void result.current.loadOlder()
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('group_messages', {
      p_group_id: 'g1',
      p_before_at: message('m100', false, 100).created_at,
      p_before_id: 'm100',
      p_limit: THREAD_PAGE,
    })
    await act(async () => older.settle({ data: run(90, 10), error: null }))
    await waitFor(() => expect(ids(client)?.[0]).toBe('m90'))
    expect(client.getQueryData<GroupThread>(messagesKey)?.more).toBe(false)
    expect(ids(client)).toHaveLength(THREAD_PAGE + 10)
  })
})

describe('catching up rather than reading the newest page again', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 21, 4, minute)).toISOString()
  /** Ten seconds before the given minute, as a catch-up starts there. */
  const overlap = (minute: number) =>
    new Date(Date.UTC(2026, 9, 21, 4, minute) - 10_000).toISOString()
  const held = (readAt: number, ...messages: GroupMessage[]): GroupThread => ({
    messages,
    more: false,
    newest: messages.at(-1)?.created_at,
    newestId: messages.at(-1)?.id,
    readAt,
  })
  /** The chat's first read, which is whole however fresh the thread held. */
  async function opened(client: QueryClient, ...messages: GroupMessage[]) {
    mockRpc.mockReturnValueOnce(response(messages))
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
    })
    mockRpc.mockClear()
  }

  it('catches up from ten seconds before the newest message, until a whole read is due', () => {
    const now = Date.now()
    expect(catchUpFrom(held(now, message('m1', false, 5)), now, 60_000)).toEqual({
      p_after_at: overlap(5),
    })
    // Settled, it starts at the newest message exactly, ordered by id within its time.
    expect(
      catchUpFrom(
        { ...held(now, message('m1', false, 5)), settled: true, newestId: 'm1' },
        now,
        60_000,
      ),
    ).toEqual({ p_after_at: at(5), p_after_id: 'm1' })
    expect(catchUpFrom(held(now - 60_000, message('m1', false, 5)), now, 60_000)).toBeNull()
    // Never read whole, or nothing to start from.
    expect(catchUpFrom(thread(message('m1', false, 5)), now, 60_000)).toBeNull()
    expect(catchUpFrom(held(now), now, 60_000)).toBeNull()
  })

  it('adds what is new, replaces what it read again, and keeps the order', () => {
    const before = held(1, message('m1', false, 1), message('m2', false, 2))
    expect(mergeNewer(before, [])).toBe(before)

    const again = { ...message('m2', false, 2), body: 'edited' }
    const merged = mergeNewer(before, [again, message('m3', false, 3)])
    expect(merged.messages.map((row) => row.body)).toEqual(['message m1', 'edited', 'message m3'])
    expect(merged.newest).toBe(at(3))
    expect(merged.readAt).toBe(1)

    // The viewer's own message, drawn with a clock running fast, gives way to
    // the server's copy and the others fall in around it.
    const mine = { ...message('mine', true, 30) }
    const sorted = mergeNewer(held(1, message('m1', false, 1), mine), [
      message('m2', false, 2),
      { ...mine, created_at: at(3) },
      message('m4', false, 4),
    ])
    expect(sorted.messages.map((row) => row.id)).toEqual(['m1', 'm2', 'mine', 'm4'])
  })

  it('takes a full catch-up as the newest page, gap and all', () => {
    const far = Array.from({ length: THREAD_PAGE }, (_, index) =>
      message(`n${index}`, false, 100 + index),
    )
    const merged = mergeNewer(held(1, message('m1', false, 1)), far)
    expect(merged.messages.map((row) => row.id)).toEqual(far.map((row) => row.id))
    expect(merged.more).toBe(true)
    expect(merged.newest).toBe(far.at(-1)?.created_at)
  })

  it('reads only what is newer while a whole read is not due, and whole once it is', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, held(Date.now(), message('m1', false, 1)))
    await renderHook(() => useGroupThread('g1', true), { wrapper })
    await opened(client, message('m1', false, 1))
    mockRpc.mockReturnValue(response([message('m1', false, 1), message('m2', false, 2)]))
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
      p_after_at: overlap(1),
    })
    expect(ids(client)).toEqual(['m1', 'm2'])

    client.setQueryData<GroupThread>(messagesKey, (current) => current && { ...current, readAt: 0 })
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.readAt).toBeGreaterThan(0)
    expect(client.getQueryData<GroupThread>(messagesKey)?.newest).toBe(at(2))
  })

  it('reads whole, from then on, from a server that does not know catch-ups', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, held(Date.now(), message('m1', false, 1)))
    await renderHook(() => useGroupThread('g1', true), { wrapper })
    await opened(client, message('m1', false, 1))
    mockRpc
      .mockReturnValueOnce(response(null, { code: 'PGRST202', message: 'no such function' }))
      .mockReturnValue(response([message('m1', false, 1), message('m2', false, 2)]))
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(ids(client)).toEqual(['m1', 'm2'])
    expect(mockRpc).toHaveBeenCalledTimes(2)
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenCalledTimes(3)
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
    })
  })

  it('catches up on the opening join, and reads whole on a rejoin', async () => {
    const { client, wrapper } = setup()
    mockRpc.mockReturnValue(response([message('m1', false, 1)]))
    await renderHook(
      () => {
        useGroupThread('g1', true)
        return useGroupChatLive('g1')
      },
      { wrapper },
    )
    // The opening read is whole, so the opening join only catches up.
    await waitFor(() => expect(client.getQueryData<GroupThread>(messagesKey)?.readAt).toBeDefined())
    mockRpc.mockClear()
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
      p_after_at: overlap(1),
    })

    // A drop may have missed a removal or a reaction, which no catch-up sees.
    mockRpc.mockClear()
    await act(async () => mockListeners.get(TOPIC)?.onLive(false))
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
    })
  })

  it('reads whole on the first join to a thread held from before the chat opened', async () => {
    const { client, wrapper } = setup()
    // Read whole 30 seconds ago, by an earlier visit: not yet due by the poll's
    // schedule, but removals since then were heard by nobody.
    client.setQueryData(messagesKey, held(Date.now() - 30_000, message('m1', false, 1)))
    mockRpc.mockReturnValue(response([message('m1', false, 1)]))
    await renderHook(
      () => {
        useGroupThread('g1', true)
        return useGroupChatLive('g1')
      },
      { wrapper },
    )
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() =>
      expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
        p_group_id: 'g1',
        p_limit: THREAD_PAGE,
      }),
    )
  })

  it('reads again a read that was on its way when a message went', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(
      messagesKey,
      held(Date.now(), message('m1', false, 1), message('m2', false, 2)),
    )
    await renderHook(
      () => {
        useGroupThread('g1', true)
        return useGroupChatLive('g1')
      },
      { wrapper },
    )
    const late = pending()
    mockRpc.mockReturnValueOnce(late.request)
    let done!: Promise<unknown>
    await act(async () => {
      done = client.refetchQueries({ queryKey: messagesKey })
    })
    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { ids: ['m2'] }))
    expect(ids(client)).toEqual(['m1'])
    // Read again after the removal, the server no longer has it.
    mockRpc.mockReturnValue(response([message('m1', false, 1), message('m3', false, 3)]))
    await act(async () => {
      late.settle({ data: [message('m2', false, 2), message('m3', false, 3)], error: null })
      await done
    })
    expect(ids(client)).toEqual(['m1', 'm3'])
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('reads the opening page again when a removal is heard before it lands', async () => {
    const { client, wrapper } = setup()
    const opening = pending()
    mockRpc.mockReturnValueOnce(opening.request)
    await renderHook(
      () => {
        useGroupThread('g1', true)
        return useGroupChatLive('g1')
      },
      { wrapper },
    )
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { ids: ['m2'] }))
    mockRpc.mockReturnValue(response([message('m1', false, 1)]))
    await act(async () =>
      opening.settle({ data: [message('m1', false, 1), message('m2', false, 2)], error: null }),
    )
    await waitFor(() => expect(ids(client)).toEqual(['m1']))
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('catches up from the newest message exactly once nothing can be on its way behind it', async () => {
    const { client, wrapper } = setup()
    const now = Date.now()
    // First seen 20 seconds ago: a read reaching back past it now settles it.
    client.setQueryData(messagesKey, {
      ...held(now, message('m1', false, 1)),
      newestAt: now - 20_000,
    })
    await renderHook(() => useGroupThread('g1', true), { wrapper })
    await opened(client, message('m1', false, 1))
    expect(client.getQueryData<GroupThread>(messagesKey)?.settled).toBe(true)
    mockRpc.mockReturnValue(response([]))
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
      p_after_at: at(1),
      p_after_id: 'm1',
    })
    // A new message starts the overlap again.
    mockRpc.mockReturnValue(response([message('m2', false, 2)]))
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.settled).toBe(false)
    expect(client.getQueryData<GroupThread>(messagesKey)?.newestId).toBe('m2')
    await act(async () => {
      await client.refetchQueries({ queryKey: messagesKey })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_messages', {
      p_group_id: 'g1',
      p_limit: THREAD_PAGE,
      p_after_at: overlap(2),
    })
  })

  it('rereads just the messages a reaction names, by id, however far back', async () => {
    const { client, wrapper } = setup()
    const rows = Array.from({ length: THREAD_PAGE + 5 }, (_, index) =>
      message(`m${index}`, false, index),
    )
    client.setQueryData(messagesKey, { ...held(Date.now(), ...rows), more: true })
    mockRpc.mockReturnValue(
      response([
        { ...message('m0', false, 0), reactions: [{ emoji: '❤️', count: 1 }] },
        { ...message('m53', false, 53), reactions: [{ emoji: '🔥', count: 2 }] },
      ]),
    )
    await renderHook(() => useGroupChatLive('g1'), { wrapper })
    await act(async () =>
      mockListeners.get(TOPIC)?.onEvent('reacted', { ids: ['m53', 'elsewhere', 'm0'] }),
    )
    await waitFor(() =>
      expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0]?.reactions).toEqual([
        { emoji: '❤️', count: 1 },
      ]),
    )
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('group_messages', {
      p_group_id: 'g1',
      p_ids: ['m53', 'm0'],
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.messages[53]?.reactions).toEqual([
      { emoji: '🔥', count: 2 },
    ])
    expect(ids(client)).toHaveLength(THREAD_PAGE + 5)
  })

  it('rereads more than a hundred named messages a hundred at a time', async () => {
    const { client, wrapper } = setup()
    const rows = Array.from({ length: 150 }, (_, index) => message(`m${index}`, false, index))
    client.setQueryData(messagesKey, { ...held(Date.now(), ...rows), more: true })
    mockRpc.mockReturnValue(response([]))
    await renderHook(() => useGroupChatLive('g1'), { wrapper })
    await act(async () =>
      mockListeners.get(TOPIC)?.onEvent('reacted', { ids: rows.map((row) => row.id) }),
    )
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2))
    expect(
      mockRpc.mock.calls.map(([, args]) => (args as { p_ids: string[] }).p_ids.length),
    ).toEqual([100, 50])
  })

  it("leaves a message the viewer's own reaction is on its way to", async () => {
    const { client, wrapper } = setup()
    client.setQueryData(
      messagesKey,
      held(Date.now(), message('m1', false, 1), message('m2', false, 2)),
    )
    const { result } = await renderHook(
      () => ({ action: useGroupAction(), live: useGroupChatLive('g1') }),
      { wrapper },
    )
    const write = pending()
    mockRpc.mockReturnValueOnce(write.request)
    let done!: Promise<unknown>
    await act(async () => {
      done = result.current.action.mutateAsync({
        action: 'reactMessage',
        groupId: 'g1',
        messageId: 'm1',
        emoji: '❤️',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    mockRpc.mockReturnValue(
      response([{ ...message('m2', false, 2), reactions: [{ emoji: '😂', count: 1 }] }]),
    )
    await act(async () => mockListeners.get(TOPIC)?.onEvent('reacted', { ids: ['m1', 'm2'] }))
    await waitFor(() =>
      expect(client.getQueryData<GroupThread>(messagesKey)?.messages[1]?.reactions).toEqual([
        { emoji: '😂', count: 1 },
      ]),
    )
    // Both are read, but m1 keeps the viewer's heart until their own write lands.
    expect(mockRpc).toHaveBeenCalledWith('group_messages', {
      p_group_id: 'g1',
      p_ids: ['m1', 'm2'],
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0]?.my_reaction).toBe('❤️')

    mockRpc.mockReturnValue(
      response([
        { ...message('m1', false, 1), reactions: [{ emoji: '❤️', count: 2 }], my_reaction: '❤️' },
      ]),
    )
    await act(async () => {
      write.settle({ data: null, error: null })
      await done
    })
    await waitFor(() =>
      expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0]?.reactions).toEqual([
        { emoji: '❤️', count: 2 },
      ]),
    )
  })
})

describe('a board polled while nothing changes', () => {
  it('hands back its version and keeps the board it has when told nothing changed', async () => {
    const { client, wrapper } = setup()
    const held = { ...board([entry()]), version: 'v1' }
    client.setQueryData(boardKey('g1'), held)
    await renderHook(() => useGroupBoard('g1', '2026-10-21', true, true), { wrapper })
    mockRpc.mockReturnValue(response({ unchanged: true, version: 'v1' }))
    await act(async () => {
      await client.refetchQueries({ queryKey: boardKey('g1') })
    })
    expect(mockRpc).toHaveBeenCalledWith('group_board', {
      p_group_id: 'g1',
      p_day: '2026-10-21',
      p_known: 'v1',
    })
    expect(client.getQueryData(boardKey('g1'))).toBe(held)

    const changed = { ...board([entry({ likes: 3 })]), version: 'v2' }
    mockRpc.mockReturnValue(response(changed))
    await act(async () => {
      await client.refetchQueries({ queryKey: boardKey('g1') })
    })
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0]?.entries[0]?.likes).toBe(3)
  })

  it('asks again without the version when the server does not know it yet', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(boardKey('g1'), { ...board([entry()]), version: 'v1' })
    await renderHook(() => useGroupBoard('g1', '2026-10-21', true, true), { wrapper })
    mockRpc
      .mockReturnValueOnce(response(null, { code: 'PGRST202', message: 'no such function' }))
      .mockReturnValue(response(board([entry({ likes: 4 })])))
    await act(async () => {
      await client.refetchQueries({ queryKey: boardKey('g1') })
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_board', {
      p_group_id: 'g1',
      p_day: '2026-10-21',
    })
    const now = client.getQueryData<GroupBoard>(boardKey('g1'))
    expect(now?.members[0]?.entries[0]?.likes).toBe(4)
    expect(now?.version).toBeUndefined()
  })

  it('asks for the whole board when it holds no version', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(boardKey('g1'), board([entry()]))
    await renderHook(() => useGroupBoard('g1', '2026-10-21', true, true), { wrapper })
    mockRpc.mockReturnValue(response({ ...board([entry()]), version: 'v1' }))
    await act(async () => {
      await client.refetchQueries({ queryKey: boardKey('g1') })
    })
    expect(mockRpc).toHaveBeenCalledWith('group_board', { p_group_id: 'g1', p_day: '2026-10-21' })
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.version).toBe('v1')
  })

  it('reads the whole board again when the one it held changed while it asked', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(boardKey('g1'), { ...board([entry()]), version: 'v1' })
    await renderHook(() => useGroupBoard('g1', '2026-10-21', true, true), { wrapper })
    const answer = pending()
    mockRpc
      .mockReturnValueOnce(answer.request)
      .mockReturnValue(response({ ...board([entry({ likes: 9 })]), version: 'v1' }))
    let done!: Promise<unknown>
    await act(async () => {
      done = client.refetchQueries({ queryKey: boardKey('g1') })
    })
    // A block clears boards and a new read can land first; either way, what is
    // held is no longer the board that version names.
    client.setQueryData(boardKey('g1'), { ...board([entry()]), version: 'v0' })
    await act(async () => {
      answer.settle({ data: { unchanged: true, version: 'v1' }, error: null })
      await done
    })
    expect(mockRpc).toHaveBeenLastCalledWith('group_board', {
      p_group_id: 'g1',
      p_day: '2026-10-21',
    })
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0]?.entries[0]?.likes).toBe(9)
  })
})

describe("the board's chat bar", () => {
  const summary = (count: number, body: string | null): ChatSummary => ({
    unread: count,
    last: body
      ? { author: { id: 'friend', name: 'Aisha', handle: 'aisha', avatar_path: null }, body }
      : null,
  })
  const push = (data: Record<string, unknown>) =>
    act(async () => {
      if (data.kind === 'group' && data.chat === true) announceGroupChatPush(String(data.groupId))
    })
  const hear = (event: string, messageIds: string[] = ['m9']) =>
    act(async () => mockListeners.get(TOPIC)?.onEvent(event, { ids: messageIds }))
  function watchSummary(client: QueryClient) {
    return new QueryObserver(client, {
      queryKey: summaryKey,
      queryFn: () => mockRpc('group_chat_summary').then((answer: { data: unknown }) => answer.data),
      staleTime: Number.POSITIVE_INFINITY,
    })
  }

  it("listens on the group's topic and rereads the bar alone when a message is written", async () => {
    const { client, wrapper } = setup()
    client.setQueryData(summaryKey, summary(0, null))
    await renderHook(() => useGroupBoardChatLive('g1', true), { wrapper })
    expect(mockListeners.has(TOPIC)).toBe(true)

    mockRpc.mockReturnValue(response(summary(1, 'makan?')))
    await hear('message')
    await waitFor(() => expect(client.getQueryData(summaryKey)).toEqual(summary(1, 'makan?')))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('group_chat_summary', { p_group_id: 'g1' })
  })

  it('rereads once more after a burst, not once per message', async () => {
    const { client, wrapper } = setup()
    await renderHook(() => useGroupBoardChatLive('g1', true), { wrapper })
    const first = pending()
    mockRpc.mockReturnValueOnce(first.request).mockReturnValue(response(summary(3, 'three')))
    await hear('message', ['m1'])
    await hear('message', ['m2'])
    await hear('removed', ['m1'])
    expect(mockRpc).toHaveBeenCalledTimes(1)
    await act(async () => first.settle({ data: summary(2, 'two'), error: null }))
    await waitFor(() =>
      expect(client.getQueryData<ChatSummary>(summaryKey)?.last?.body).toBe('three'),
    )
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('catches up on joining unless the bar was just read, and says it is live', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(summaryKey, summary(0, null))
    const { result } = await renderHook(() => useGroupBoardChatLive('g1', true), { wrapper })
    expect(result.current).toBe(false)
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    expect(result.current).toBe(true)
    expect(mockRpc).not.toHaveBeenCalled()

    client.setQueryData(summaryKey, summary(0, null), { updatedAt: Date.now() - 60_000 })
    mockRpc.mockReturnValue(response(summary(4, 'missed')))
    await act(async () => mockListeners.get(TOPIC)?.onLive(false))
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() => expect(client.getQueryData<ChatSummary>(summaryKey)?.unread).toBe(4))
  })

  it("falls back to that group's chat push while the channel is not joined", async () => {
    const { client, wrapper } = setup()
    client.setQueryData(summaryKey, summary(0, null))
    const unsubscribe = watchSummary(client).subscribe(() => undefined)
    await renderHook(() => useGroupBoardChatLive('g1', true), { wrapper })

    // A nudge, or another group's message, is not this chat's news.
    await push({ kind: 'group', groupId: 'g1' })
    await push({ kind: 'group', groupId: 'g2', chat: true })
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockReturnValue(response(summary(1, 'hi')))
    await push({ kind: 'group', groupId: 'g1', chat: true })
    await waitFor(() => expect(client.getQueryData<ChatSummary>(summaryKey)?.unread).toBe(1))

    // Joined, the channel already said so; the push rereads nothing.
    client.setQueryData(summaryKey, summary(1, 'hi'), { updatedAt: Date.now() })
    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    mockRpc.mockClear()
    await push({ kind: 'group', groupId: 'g1', chat: true })
    expect(mockRpc).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('does not listen while the board is covered', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(summaryKey, summary(0, null))
    const unsubscribe = watchSummary(client).subscribe(() => undefined)
    const { rerender } = await renderHook(
      ({ on }: { on: boolean }) => useGroupBoardChatLive('g1', on),
      { wrapper, initialProps: { on: true } },
    )
    await rerender({ on: false })
    expect(mockStops).toEqual([TOPIC])
    await push({ kind: 'group', groupId: 'g1', chat: true })
    expect(mockRpc).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('clears the count the moment the chat is read', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(summaryKey, summary(5, 'hi'))
    mockRpc.mockReturnValue(response(null))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ action: 'read', groupId: 'g1' })
    })
    expect(client.getQueryData<ChatSummary>(summaryKey)).toEqual(summary(0, 'hi'))
  })
})

describe('live chat', () => {
  it("listens on the group's topic while mounted, and says when it is live", async () => {
    const { wrapper } = setup()
    const { result, unmount } = await renderHook(() => useGroupChatLive('g1'), { wrapper })
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
    client.setQueryData(messagesKey, thread(message('m1')))
    const query = watchMessages(client)
    const unsubscribe = query.subscribe(() => undefined)
    mockRpc.mockReturnValue(response([message('m1'), message('m2')]))
    await renderHook(() => useGroupChatLive('g1'), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onLive(true))
    await waitFor(() => expect(ids(client)).toHaveLength(2))
    unsubscribe()
  })

  it('refetches for a message it has not got, and not for one it has', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1', true)))
    const query = watchMessages(client)
    const unsubscribe = query.subscribe(() => undefined)
    await renderHook(() => useGroupChatLive('g1'), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onEvent('message', { ids: ['m1'] }))
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockReturnValue(response([message('m1', true), message('m2')]))
    await act(async () => mockListeners.get(TOPIC)?.onEvent('message', { ids: ['m2'] }))
    await waitFor(() => expect(ids(client)).toHaveLength(2))
    expect(mockRpc).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('takes a removed message out in place, without asking the server', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1'), message('m2')))
    await renderHook(() => useGroupChatLive('g1'), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { ids: ['m1'] }))
    expect(ids(client)).toEqual(['m2'])
    expect(mockRpc).not.toHaveBeenCalled()

    await act(async () => mockListeners.get(TOPIC)?.onEvent('removed', { nonsense: true }))
    expect(ids(client)).toEqual(['m2'])
  })

  it('puts a sent message in the thread as soon as the server answers', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1')))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    const sent = pending()
    mockRpc.mockReturnValueOnce(sent.request)
    let done!: Promise<unknown>
    await act(async () => {
      done = result.current.mutateAsync({
        action: 'message',
        groupId: 'g1',
        body: 'on my way',
        requestId: 'r1',
      })
    })
    expect(ids(client)).toHaveLength(1)
    expect(mockRpc).toHaveBeenCalledWith('send_group_message', {
      p_group_id: 'g1',
      p_body: 'on my way',
      p_request_id: 'r1',
      // Sent as null rather than left out: PostgREST finds a function by the
      // names it is given, and the server's defaults then do the rest.
      p_reply_to: null,
      p_post_id: null,
      p_workout_id: null,
      p_activity_id: null,
    })
    await act(async () => {
      sent.settle({ data: 'm2', error: null })
      await done
    })
    const rows = client.getQueryData<GroupThread>(messagesKey)?.messages
    expect(rows?.map((row) => [row.id, row.body, row.mine])).toEqual([
      ['m1', 'message m1', false],
      ['m2', 'on my way', true],
    ])
  })

  it('takes a deleted message out once the delete lands', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1', true), message('m2')))
    mockRpc.mockReturnValue(response(null))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ action: 'deleteMessage', groupId: 'g1', messageId: 'm1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(ids(client)).toEqual(['m2'])
  })
})

it("leaves a broadcast to the viewer's own send while it is on its way", async () => {
  const { client, wrapper } = setup()
  client.setQueryData(messagesKey, thread(message('m1')))
  const query = watchMessages(client)
  const unsubscribe = query.subscribe(() => undefined)
  const { result } = await renderHook(
    () => ({ action: useGroupAction(), live: useGroupChatLive('g1') }),
    { wrapper },
  )
  const sent = pending()
  mockRpc.mockReturnValueOnce(sent.request)
  let done!: Promise<unknown>
  await act(async () => {
    done = result.current.action.mutateAsync({
      action: 'message',
      groupId: 'g1',
      body: 'on my way',
      requestId: 'r1',
    })
    // react-query tells the hook on a timer; let that land inside act.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  // Its own broadcast, ahead of the answer.
  await act(async () => mockListeners.get(TOPIC)?.onEvent('message', { ids: ['m2'] }))
  expect(mockRpc).toHaveBeenCalledTimes(1)

  mockRpc.mockReturnValue(response([message('m1'), message('m2', true)]))
  await act(async () => {
    sent.settle({ data: 'm2', error: null })
    await done
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2))
  expect(mockRpc).toHaveBeenLastCalledWith('group_messages')
  unsubscribe()
})

it('lets a fetch already on its way land before catching up, rather than restarting it', async () => {
  const { client, wrapper } = setup()
  const first = pending()
  mockRpc.mockReturnValueOnce(first.request)
  const query = watchMessages(client)
  const unsubscribe = query.subscribe(() => undefined)
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1))
  await renderHook(() => useGroupChatLive('g1'), { wrapper })

  mockRpc.mockReturnValue(response([message('m1'), message('m2')]))
  await act(async () => mockListeners.get(TOPIC)?.onLive(true))
  expect(mockRpc).toHaveBeenCalledTimes(1)

  await act(async () => first.settle({ data: [message('m1')], error: null }))
  await waitFor(() => expect(ids(client)).toHaveLength(2))
  expect(mockRpc).toHaveBeenCalledTimes(2)
  unsubscribe()
})

describe('replies, food and reactions', () => {
  it("moves the viewer's reaction and shifts the counts to match", () => {
    const base = { ...message('m1'), reactions: [{ emoji: '❤️', count: 2 }], my_reaction: null }
    const hearted = reacted(base, '❤️')
    expect(hearted.reactions).toEqual([{ emoji: '❤️', count: 3 }])
    expect(hearted.my_reaction).toBe('❤️')
    const laughed = reacted(hearted, '😂')
    expect(laughed.reactions).toEqual([
      { emoji: '❤️', count: 2 },
      { emoji: '😂', count: 1 },
    ])
    const none = reacted(laughed, null)
    expect(none.reactions).toEqual([{ emoji: '❤️', count: 2 }])
    expect(none.my_reaction).toBeNull()
    // A message from a server older than reactions has none to shift.
    expect(reacted(message('m2'), '🔥').reactions).toEqual([{ emoji: '🔥', count: 1 }])
  })

  it('draws a reaction at once and puts it back when refused', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1')))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    const sent = pending()
    mockRpc.mockReturnValueOnce(sent.request)
    let done!: Promise<unknown>
    await act(async () => {
      done = result.current
        .mutateAsync({ action: 'reactMessage', groupId: 'g1', messageId: 'm1', emoji: '❤️' })
        .catch(() => undefined)
    })
    expect(mockRpc).toHaveBeenCalledWith('set_group_message_reaction', {
      p_message_id: 'm1',
      p_emoji: '❤️',
    })
    const drawn = client.getQueryData<GroupThread>(messagesKey)?.messages[0]
    expect(drawn?.my_reaction).toBe('❤️')
    expect(drawn?.reactions).toEqual([{ emoji: '❤️', count: 1 }])
    mockRpc.mockReturnValue(response([message('m1')]))
    await act(async () => {
      sent.settle({ data: null, error: { message: 'no' } })
      await done
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0]?.my_reaction).toBeUndefined()
  })

  it('draws a thumb on a chat food card and the board together, and takes both back when refused', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(boardKey('g1'), board([entry({ likes: 2, mine: 0 })]))
    const food = {
      post_id: 'p1',
      name: 'Chicken rice',
      icon_set: null,
      icon_name: null,
      photo_path: null,
      serving_label: null,
      logged_at: '2026-10-21T04:00:00Z',
      kcal: 610,
      carbs_g: 78,
      protein_g: 32,
      fat_g: 16,
      entry_id: 'e1',
      likes: 1,
      dislikes: 0,
      mine: 0 as const,
    }
    client.setQueryData(messagesKey, thread({ ...message('m1'), food }))
    const write = pending()
    mockRpc.mockReturnValueOnce(write.request)
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    let done!: Promise<unknown>
    await act(async () => {
      done = result.current
        .mutateAsync({ action: 'react', entryId: 'e1', value: 1 })
        .catch(() => undefined)
    })
    // Each counts its own group: shifted by one, never copied across.
    await waitFor(() =>
      expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0].food).toMatchObject({
        likes: 2,
        mine: 1,
      }),
    )
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      likes: 3,
      mine: 1,
    })
    // The card is read again once the refusal lands, as the server still has it.
    mockRpc.mockReturnValue(response([{ ...message('m1'), food }]))
    await act(async () => {
      write.settle({ data: null, error: { message: 'no' } })
      await done
    })
    expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0].food).toMatchObject({
      likes: 1,
      mine: 0,
    })
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      likes: 2,
      mine: 0,
    })
  })

  it('takes a reaction back with null', async () => {
    const { wrapper } = setup()
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    mockRpc.mockReturnValue(response(null))
    await act(async () => {
      await result.current.mutateAsync({
        action: 'reactMessage',
        groupId: 'g1',
        messageId: 'm1',
        emoji: null,
      })
    })
    expect(mockRpc).toHaveBeenCalledWith('set_group_message_reaction', {
      p_message_id: 'm1',
      p_emoji: null,
    })
  })

  it('refetches for a reaction on a message it holds, and ignores the rest', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1')))
    const query = watchMessages(client)
    const unsubscribe = query.subscribe(() => undefined)
    await renderHook(() => useGroupChatLive('g1'), { wrapper })

    await act(async () => mockListeners.get(TOPIC)?.onEvent('reacted', { ids: ['elsewhere'] }))
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockReturnValue(
      response([{ ...message('m1'), reactions: [{ emoji: '😂', count: 1 }] }]),
    )
    await act(async () => mockListeners.get(TOPIC)?.onEvent('reacted', { ids: ['m1'] }))
    await waitFor(() =>
      expect(client.getQueryData<GroupThread>(messagesKey)?.messages[0]?.reactions).toEqual([
        { emoji: '😂', count: 1 },
      ]),
    )
    unsubscribe()
  })

  it("sends a health store's run as an activity and a logger workout as a workout", async () => {
    const { wrapper } = setup()
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    mockRpc.mockReturnValue(response('m9'))
    await act(async () => {
      await result.current.mutateAsync({
        action: 'message',
        groupId: 'g1',
        body: '',
        requestId: 'r9',
        workout: { source: 'activity', id: 'a1' },
      })
      await result.current.mutateAsync({
        action: 'message',
        groupId: 'g1',
        body: '',
        requestId: 'r10',
        workout: { source: 'workout', id: 'w1' },
      })
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'send_group_message',
      expect.objectContaining({ p_activity_id: 'a1', p_workout_id: null, p_post_id: null }),
    )
    expect(mockRpc).toHaveBeenCalledWith(
      'send_group_message',
      expect.objectContaining({ p_workout_id: 'w1', p_activity_id: null }),
    )
  })

  it('sends a reply and a shared food, and keeps both drawn once sent', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(messagesKey, thread(message('m1')))
    const { result } = await renderHook(() => useGroupAction(), { wrapper })
    const food = {
      post_id: 'p1',
      name: 'Nasi lemak',
      icon_set: null,
      icon_name: null,
      photo_path: null,
      serving_label: null,
      logged_at: '2026-10-21T04:00:00Z',
      kcal: 640,
      carbs_g: 70,
      protein_g: 20,
      fat_g: 30,
    }
    const quote = { id: 'm1', author: message('m1').author, body: 'message m1', is_food: false }
    mockRpc.mockReturnValueOnce(response('m2')).mockReturnValue(response([]))
    await act(async () => {
      await result.current.mutateAsync({
        action: 'message',
        groupId: 'g1',
        body: '',
        requestId: 'r1',
        replyTo: 'm1',
        postId: 'p1',
        sent: { reply_to: quote, food },
      })
    })
    expect(mockRpc).toHaveBeenCalledWith('send_group_message', {
      p_group_id: 'g1',
      p_body: '',
      p_request_id: 'r1',
      p_reply_to: 'm1',
      p_post_id: 'p1',
      p_workout_id: null,
      p_activity_id: null,
    })
    const sent = client.getQueryData<GroupThread>(messagesKey)?.messages.at(-1)
    expect(sent?.food?.name).toBe('Nasi lemak')
    expect(sent?.reply_to?.id).toBe('m1')
  })
})

describe('reading an open chat as messages arrive', () => {
  const reads = () => mockRpc.mock.calls.filter(([name]) => name === 'mark_group_chat_read').length
  type Props = { latest: string | null; watching: boolean }
  async function open(initialProps: Props) {
    const { wrapper } = setup()
    mockRpc.mockReturnValue(response(null))
    return renderHook(
      ({ latest, watching }: Props) => useReadAsItArrives('g1', latest, 'm1', watching),
      { wrapper, initialProps },
    )
  }

  it("reads a friend's new message as it lands, once", async () => {
    const { rerender } = await open({ latest: 'm1', watching: true })
    // The thread it opened on was read by opening it.
    expect(reads()).toBe(0)
    await rerender({ latest: 'm2', watching: true })
    await waitFor(() => expect(reads()).toBe(1))
    expect(mockRpc).toHaveBeenCalledWith('mark_group_chat_read', { p_group_id: 'g1' })
    await rerender({ latest: 'm2', watching: true })
    await rerender({ latest: null, watching: true })
    expect(reads()).toBe(1)
  })

  it('waits until the viewer is looking again', async () => {
    const { rerender } = await open({ latest: 'm1', watching: false })
    await rerender({ latest: 'm2', watching: false })
    expect(reads()).toBe(0)
    await rerender({ latest: 'm2', watching: true })
    await waitFor(() => expect(reads()).toBe(1))
  })

  it('sends one more read after a burst rather than one per message', async () => {
    const first = pending()
    const { rerender } = await open({ latest: 'm1', watching: true })
    mockRpc.mockReturnValueOnce(first.request).mockReturnValue(response(null))
    await rerender({ latest: 'm2', watching: true })
    await rerender({ latest: 'm3', watching: true })
    await rerender({ latest: 'm4', watching: true })
    expect(reads()).toBe(1)
    await act(async () => first.settle({ data: null, error: null }))
    await waitFor(() => expect(reads()).toBe(2))
  })
})
