import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { usePrefetchActivityDays } from '../activity'
import { usePrefetchDays } from '../day'
import { keys } from '../keys'
import { usePrefetchDateRange } from '../use-prefetch-date-range'

const mockFrom = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))
jest.mock('../session', () => ({ useUserId: () => 'reader' }))

const from = '2026-10-01'
const to = '2026-10-03'
const dates = [from, '2026-10-02', to]
const values = [{ date: from }, null, { date: to }]
const fetchRange = jest.fn<
  Promise<readonly (typeof values)[number][]>,
  [string, string, string, string[]]
>()

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function query(data: unknown) {
  return Object.assign(Promise.resolve({ data, error: null }), {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  })
}

beforeEach(() => {
  onlineManager.setOnline(true)
  fetchRange.mockReset().mockResolvedValue(values)
  mockFrom.mockReset().mockImplementation(() => query([]))
})

afterEach(() => onlineManager.setOnline(true))

it('buckets meals, water and movement by their dates, filling only the gaps', async () => {
  mockFrom.mockImplementation((table: string) =>
    query(
      {
        food_log_details: [
          { id: 'later', log_date: to, food_name: 'Lunch' },
          { id: 'earlier', log_date: from, food_name: 'Breakfast' },
        ],
        daily_logs: [{ log_date: from, water_ml: 500 }],
        activity_days: [{ log_date: to, provider: 'demo', steps: 2500, active_kcal: 100 }],
      }[table] ?? [],
    ),
  )
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(
    () => {
      usePrefetchDays(from, to)
      usePrefetchActivityDays(from, to)
    },
    { wrapper },
  )
  await waitFor(() =>
    expect(client.getQueryData(keys.activityDay('reader', to))).toMatchObject({ steps: 2500 }),
  )
  expect(client.getQueryData(keys.day('reader', from))).toMatchObject({
    date: from,
    waterMl: 500,
    entries: [{ id: 'earlier' }],
  })
  expect(client.getQueryData(keys.day('reader', dates[1]))).toEqual({
    date: dates[1],
    waterMl: 0,
    entries: [],
  })
  expect(client.getQueryData(keys.day('reader', to))).toMatchObject({
    date: to,
    waterMl: 0,
    entries: [{ id: 'later' }],
  })
  expect(client.getQueryData(keys.activityDay('reader', from))).toBeNull()
  await unmount()
  client.clear()
})

it('seeds individual dates, including a measured absence, without caching a range', async () => {
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  await waitFor(() => expect(client.getQueryData(keys.day('reader', to))).toEqual(values[2]))
  expect(fetchRange).toHaveBeenCalledWith('reader', from, to, dates)
  expect(client.getQueryData(keys.day('reader', dates[1]))).toBeNull()
  expect(client.getQueryCache().getAll()).toHaveLength(3)
  await unmount()
  client.clear()
})

it('does not request a known range or a reversed range', async () => {
  const { client, wrapper } = setup()
  for (const date of dates) client.setQueryData(keys.day('reader', date), null)
  const { rerender, unmount } = await renderHook(
    ({ start, end }: { start: string; end: string }) =>
      usePrefetchDateRange('reader', start, end, keys.day, fetchRange),
    { wrapper, initialProps: { start: from, end: to } },
  )
  await rerender({ start: to, end: from })
  expect(fetchRange).not.toHaveBeenCalled()
  await unmount()
  client.clear()
})

it('shares an in-flight request when the same range mounts twice', async () => {
  const pending = deferred<typeof values>()
  fetchRange.mockReturnValue(pending.promise)
  const { client, wrapper } = setup()
  const first = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  const second = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  expect(fetchRange).toHaveBeenCalledTimes(1)
  await first.unmount()
  await act(async () => pending.resolve(values))
  expect(client.getQueryData(keys.day('reader', from))).toEqual(values[0])
  await second.unmount()
  client.clear()
})

it('preserves an optimistic update and a null filled while the request was out', async () => {
  const pending = deferred<typeof values>()
  fetchRange.mockReturnValue(pending.promise)
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  client.setQueryData(keys.day('reader', from), { waterMl: 750 })
  client.setQueryData(keys.day('reader', to), null)
  await act(async () => pending.resolve(values))
  expect(client.getQueryData(keys.day('reader', from))).toEqual({ waterMl: 750 })
  expect(client.getQueryData(keys.day('reader', to))).toBeNull()
  await unmount()
  client.clear()
})

it('does not seed a result after its last view unmounts', async () => {
  const pending = deferred<typeof values>()
  fetchRange.mockReturnValue(pending.promise)
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  await unmount()
  await act(async () => pending.resolve(values))
  expect(client.getQueryCache().getAll()).toHaveLength(0)
  client.clear()
})

it('keeps an old account response out of the cache after the account changes', async () => {
  const previous = deferred<typeof values>()
  const next = deferred<typeof values>()
  fetchRange.mockReturnValueOnce(previous.promise).mockReturnValueOnce(next.promise)
  const { client, wrapper } = setup()
  const { rerender, unmount } = await renderHook(
    ({ userId }: { userId: string }) =>
      usePrefetchDateRange(userId, from, to, keys.day, fetchRange),
    { wrapper, initialProps: { userId: 'previous' } },
  )
  await rerender({ userId: 'next' })
  await act(async () => {
    previous.resolve(values)
    next.resolve(values)
  })
  expect(client.getQueryData(keys.day('previous', from))).toBeUndefined()
  expect(client.getQueryData(keys.day('next', from))).toEqual(values[0])
  await unmount()
  client.clear()
})

it('does not share requests across accounts or between meals and movement', async () => {
  const pending = deferred<typeof values>()
  fetchRange.mockReturnValue(pending.promise)
  const { client, wrapper } = setup()
  const { unmount } = await renderHook(
    () => {
      usePrefetchDateRange('reader', from, to, keys.day, fetchRange)
      usePrefetchDateRange('other', from, to, keys.day, fetchRange)
      usePrefetchDateRange('reader', from, to, keys.activityDay, fetchRange)
    },
    { wrapper },
  )
  expect(fetchRange).toHaveBeenCalledTimes(3)
  await act(async () => pending.resolve(values))
  await unmount()
  client.clear()
})

it('leaves a failed range empty and allows a later mount to retry it', async () => {
  fetchRange.mockRejectedValueOnce(new Error('unavailable'))
  const { client, wrapper } = setup()
  const first = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  await act(async () => {})
  expect(client.getQueryData(keys.day('reader', from))).toBeUndefined()
  await first.unmount()
  const second = await renderHook(
    () => usePrefetchDateRange('reader', from, to, keys.day, fetchRange),
    { wrapper },
  )
  await waitFor(() => expect(client.getQueryData(keys.day('reader', from))).toEqual(values[0]))
  expect(fetchRange).toHaveBeenCalledTimes(2)
  await second.unmount()
  client.clear()
})

describe.each([
  ['meals', usePrefetchDays, keys.day],
  ['movement', usePrefetchActivityDays, keys.activityDay],
] as const)('%s warm-up', (_name, useWarmUp, keyForDate) => {
  it('sends no requests offline, then warms the mounted range on reconnect', async () => {
    onlineManager.setOnline(false)
    const { client, wrapper } = setup()
    const { unmount } = await renderHook(() => useWarmUp(from, to), { wrapper })
    expect(mockFrom).not.toHaveBeenCalled()
    await act(async () => onlineManager.setOnline(true))
    await waitFor(() => expect(client.getQueryData(keyForDate('reader', to))).not.toBeUndefined())
    expect(mockFrom.mock.calls.map(([table]) => table)).toEqual(
      _name === 'meals' ? ['food_log_details', 'daily_logs'] : ['activity_days'],
    )
    await unmount()
    client.clear()
  })

  it('does not warm an unmounted range on reconnect', async () => {
    onlineManager.setOnline(false)
    const { client, wrapper } = setup()
    const { unmount } = await renderHook(() => useWarmUp(from, to), { wrapper })
    await unmount()
    await act(async () => onlineManager.setOnline(true))
    expect(mockFrom).not.toHaveBeenCalled()
    client.clear()
  })
})
