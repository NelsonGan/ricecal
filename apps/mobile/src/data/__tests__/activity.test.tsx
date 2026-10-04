import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { useClearDemoActivity } from '../activity'

const mockFrom = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))
jest.mock('../session', () => ({ useUserId: () => 'reader' }))

type Result = { data: { log_date: string }[] | null; error: Error | null }
let results: Record<string, Result>
let queries: { table: string; delete: jest.Mock; eq: jest.Mock; in: jest.Mock }[]

beforeEach(() => {
  results = { activity_days: { data: [{ log_date: '2026-10-01' }], error: null } }
  queries = []
  mockFrom.mockReset().mockImplementation((table: string) => {
    const query = Object.assign(Promise.resolve(results[table] ?? { data: null, error: null }), {
      table,
      select: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
    })
    queries.push(query)
    return query
  })
})

async function clearDemo() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, unmount } = await renderHook(useClearDemoActivity, { wrapper })
  try {
    await act(async () => result.current.mutateAsync())
  } finally {
    await unmount()
    client.clear()
  }
}

it('deletes only the captured account and demo dates, keeping real activity', async () => {
  await clearDemo()
  expect(queries.map(({ table }) => table)).toEqual([
    'activity_days',
    'activity_hours',
    'activity_sessions',
    'activity_days',
    'health_connections',
  ])
  for (const query of queries) expect(query.eq).toHaveBeenCalledWith('user_id', 'reader')
  expect(queries[1].in).toHaveBeenCalledWith('log_date', ['2026-10-01'])
  for (const query of [queries[0], ...queries.slice(2)]) {
    expect(query.eq).toHaveBeenCalledWith('provider', 'demo')
  }
})

it('skips the hourly delete when no demo days were found', async () => {
  results.activity_days.data = []
  await clearDemo()
  expect(mockFrom).not.toHaveBeenCalledWith('activity_hours')
})

it('keeps demo days and their ownership markers if hourly deletion fails', async () => {
  const error = new Error('hourly delete refused')
  results.activity_hours = { data: null, error }
  await expect(clearDemo()).rejects.toBe(error)
  expect(queries.map(({ table }) => table)).toEqual(['activity_days', 'activity_hours'])
})

it('deletes nothing when the demo date lookup fails', async () => {
  const error = new Error('day read refused')
  results.activity_days = { data: null, error }
  await expect(clearDemo()).rejects.toBe(error)
  expect(queries).toHaveLength(1)
  expect(queries[0].delete).not.toHaveBeenCalled()
})

it.each(['activity_sessions', 'health_connections'])(
  'reports a failed %s delete',
  async (table) => {
    const error = new Error(`${table} delete refused`)
    results[table] = { data: null, error }
    await expect(clearDemo()).rejects.toBe(error)
  },
)
