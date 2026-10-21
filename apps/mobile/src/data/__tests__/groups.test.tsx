import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { type BoardEntry, type GroupBoard, groupError, useGroupAction } from '../groups'
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
  quantity: 1,
  moved: false,
  likes: 2,
  dislikes: 0,
  mine: 0,
  ...patch,
})
const board = (entries: BoardEntry[]): GroupBoard => ({
  group: { id: 'g1', name: 'Makan', icon_name: 'rice-bowl', is_public: false, leader_id: 'a', member_count: 2 },
  day: '2026-10-21',
  members: [
    {
      person: { id: 'friend', name: 'Aisha', handle: 'aisha', avatar_path: null },
      today: '2026-10-21',
      entries,
      nudges: {},
      nudgeable: [],
      workout: null,
    },
  ],
  chat: { count: 0, unread: 0, last: null },
})
const boardKey = (groupId: string) => keys.groupsRead('viewer', 'group_board', { groupId, day: '2026-10-21' })

beforeEach(() => {
  jest.clearAllMocks()
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
  client.setQueryData(boardKey('g1'), board([entry()]))
  client.setQueryData(boardKey('g2'), board([entry()]))
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
    result.current.mutate({ action: 'react', groupId: 'g1', day: '2026-10-21', entryId: 'e1', value: 1 })
  })
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g2'))?.members[0].entries[0]).toMatchObject({
      likes: 3,
      mine: 1,
    }),
  )
  await act(async () => refuse({ data: null, error: { message: 'no' } }))
  await waitFor(() =>
    expect(client.getQueryData<GroupBoard>(boardKey('g1'))?.members[0].entries[0]).toMatchObject({
      likes: 2,
      mine: 0,
    }),
  )
})

it('swaps a like for a dislike without double counting', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(boardKey('g1'), board([entry({ likes: 2, mine: 1 })]))
  const write = pending()
  mockRpc.mockReturnValueOnce(write.request).mockReturnValue(response(null))
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    result.current.mutate({ action: 'react', groupId: 'g1', day: '2026-10-21', entryId: 'e1', value: -1 })
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
      moved: true,
    }),
  )
  await act(async () => write.settle({ data: null, error: null }))
})

it('shows a sent message at once and takes it back if it fails', async () => {
  const { client, wrapper } = setup()
  const messagesKey = keys.groupsRead('viewer', 'group_messages', { groupId: 'g1', day: '2026-10-21' })
  client.setQueryData(messagesKey, [])
  let settle!: (value: unknown) => void
  mockRpc.mockReturnValueOnce(
    Object.assign(
      new Promise((resolve) => {
        settle = resolve
      }),
      { abortSignal: () => undefined },
    ),
  )
  const { result } = await renderHook(() => useGroupAction(), { wrapper })
  await act(async () => {
    result.current.mutate({
      action: 'message',
      groupId: 'g1',
      day: '2026-10-21',
      body: 'hello',
      requestId: 'r1',
    })
  })
  await waitFor(() =>
    expect(client.getQueryData<{ body: string; pending?: boolean }[]>(messagesKey)).toEqual([
      expect.objectContaining({ body: 'hello', pending: true }),
    ]),
  )
  await act(async () => settle({ data: null, error: { message: 'no' } }))
  await waitFor(() => expect(client.getQueryData(messagesKey)).toEqual([]))
})
