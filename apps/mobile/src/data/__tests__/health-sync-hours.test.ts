import { QueryClient } from '@tanstack/react-query'
import { syncRange } from '@/data/health-sync'
import { demoHealth, type HealthReading } from '@/lib/health'

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: { from: jest.Mock; rpc: jest.Mock }
}

const empty = (): HealthReading => ({
  days: [],
  workouts: [],
  hours: [],
  weights: [],
  deviceName: null,
})

const measured = (date: string): HealthReading => ({
  ...empty(),
  days: [
    {
      date,
      activeKcal: 0,
      restingKcal: null,
      steps: 0,
      distanceM: null,
      exerciseMinutes: null,
      standHours: null,
      flights: null,
      moveGoalKcal: null,
      exerciseGoalMin: null,
      standGoalHr: null,
    },
  ],
})

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-03T12:00:00'))
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  supabase.from.mockReset().mockReturnValue(query)
  supabase.rpc.mockReset().mockResolvedValue({ data: 0, error: null })
})

afterEach(() => jest.useRealTimers())

it('sends hourly readings atomically with the captured account and exact read window', async () => {
  const read = jest.fn().mockResolvedValue({
    ...empty(),
    hours: [{ date: '2026-10-02', hour: 9, steps: 100, activeKcal: 5, distanceM: null }],
  })
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(supabase.rpc).toHaveBeenCalledWith('replace_activity_hours', {
    p_user_id: 'account-a',
    p_from: '2026-10-01',
    p_to: '2026-10-03',
    p_hours: [{ log_date: '2026-10-02', hour: 9, steps: 100, active_kcal: 5, distance_m: null }],
  })
  expect(supabase.from).not.toHaveBeenCalledWith('activity_hours')
})

it('a measured day with no hourly records still removes disappeared source hours', async () => {
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(supabase.rpc).toHaveBeenCalledWith('replace_activity_hours', {
    p_user_id: 'account-a',
    p_from: '2026-10-01',
    p_to: '2026-10-03',
    p_hours: [],
  })
})

it('an unavailable store or revoked access cannot erase the last good hourly data', async () => {
  const read = jest.fn().mockResolvedValue(empty())
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(supabase.rpc).not.toHaveBeenCalled()
})

it('historical backfill leaves hourly data alone while still reading the full date range', async () => {
  const read = jest.fn().mockImplementation(async (from: string) => measured(from))
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-08-31',
    '2026-09-05',
  )
  expect(read.mock.calls.map(([from, to, options]) => [from, to, options.withHours])).toEqual([
    ['2026-08-31', '2026-09-02', false],
    ['2026-09-03', '2026-09-05', true],
  ])
  expect(supabase.rpc).toHaveBeenCalledTimes(1)
  expect(supabase.rpc.mock.calls[0][1].p_from).toBe('2026-09-03')
})

it('a provider read failure cannot start a replacement', async () => {
  const read = jest.fn().mockRejectedValue(new Error('health read failed'))
  await expect(
    syncRange(new QueryClient(), 'account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03'),
  ).rejects.toThrow('health read failed')
  expect(supabase.rpc).not.toHaveBeenCalled()
})

it('a failed atomic replacement fails the sync for retry', async () => {
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  supabase.rpc.mockResolvedValue({ data: null, error: new Error('request interrupted') })
  await expect(
    syncRange(new QueryClient(), 'account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03'),
  ).rejects.toThrow('request interrupted')
})

it('folds the repeated hour of a daylight-saving night into one row', async () => {
  const read = jest.fn().mockResolvedValue({
    ...empty(),
    hours: [
      { date: '2026-10-02', hour: 1, steps: 100, activeKcal: 4, distanceM: null },
      { date: '2026-10-02', hour: 1, steps: 50, activeKcal: 2, distanceM: 30 },
      { date: '2026-10-02', hour: 2, steps: 10, activeKcal: 1, distanceM: null },
    ],
  })
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(supabase.rpc.mock.calls[0][1].p_hours).toEqual([
    { log_date: '2026-10-02', hour: 1, steps: 150, active_kcal: 6, distance_m: 30 },
    { log_date: '2026-10-02', hour: 2, steps: 10, active_kcal: 1, distance_m: null },
  ])
})

it('says whether a pass read anything the last one did not', async () => {
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  const pass = () =>
    syncRange(new QueryClient(), 'account-b', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  expect((await pass()).changed).toBe(true)
  // Still written: a late edit has to land even when nothing on screen moves.
  supabase.rpc.mockClear()
  expect((await pass()).changed).toBe(false)
  expect(supabase.rpc).toHaveBeenCalledWith('replace_activity_hours', expect.anything())
  read.mockResolvedValue(measured('2026-10-03'))
  expect((await pass()).changed).toBe(true)
})
