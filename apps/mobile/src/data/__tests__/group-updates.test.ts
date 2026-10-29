import { QueryClient } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { pushGroupUpdates } from '../group-updates'
import { keys } from '../keys'

const mockRpc = jest.fn()
const mockInvoke = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

const myGroups = keys.groupsRead('viewer', 'my_groups')
let client: QueryClient

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
})
afterEach(() => {
  client.clear()
  jest.useRealTimers()
})

async function settle() {
  await jest.runAllTimersAsync()
}

it('asks once for a burst of writes, when the viewer is in a group', async () => {
  client.setQueryData(myGroups, [{ id: 'g1' }])
  pushGroupUpdates(client, myGroups)
  pushGroupUpdates(client, myGroups)
  pushGroupUpdates(client, myGroups)
  await settle()
  expect(mockInvoke).toHaveBeenCalledTimes(1)
  expect(mockInvoke).toHaveBeenCalledWith('groups', { body: { kind: 'updates' } })
})

it('never calls the function for someone in no group', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null })
  pushGroupUpdates(client, myGroups)
  await settle()
  expect(mockRpc).toHaveBeenCalledWith('my_groups')
  expect(mockInvoke).not.toHaveBeenCalled()
})

it('asks at once when the app is already in the background, since its timers stop', async () => {
  client.setQueryData(myGroups, [{ id: 'g1' }])
  // The jest preset's AppState has no real state to replace.
  const before = Object.getOwnPropertyDescriptor(AppState, 'currentState')
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
  try {
    pushGroupUpdates(client, myGroups)
    await Promise.resolve()
    await Promise.resolve()
  } finally {
    if (before) Object.defineProperty(AppState, 'currentState', before)
  }
  expect(mockInvoke).toHaveBeenCalledWith('groups', { body: { kind: 'updates' } })
})
