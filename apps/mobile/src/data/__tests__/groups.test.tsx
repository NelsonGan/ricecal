import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { announceGroupChatPush } from '@/lib/groupChatPushes'
import type { Listener } from '@/lib/realtime'
import {
  type BoardEntry,
  type ChatSummary,
  type GroupBoard,
  type GroupMessage,
  type GroupThread,
  groupError,
  mergeNewest,
  THREAD_PAGE,
  useGroupAction,
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
