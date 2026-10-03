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
  await syncRange('account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
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
  await syncRange('account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  expect(supabase.rpc).toHaveBeenCalledWith('replace_activity_hours', {
    p_user_id: 'account-a',
    p_from: '2026-10-01',
    p_to: '2026-10-03',
    p_hours: [],
  })
})

it('an unavailable store or revoked access cannot erase the last good hourly data', async () => {
  const read = jest.fn().mockResolvedValue(empty())
  await syncRange('account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  expect(supabase.rpc).not.toHaveBeenCalled()
})

it('historical backfill leaves hourly data alone while still reading the full date range', async () => {
  const read = jest.fn().mockImplementation(async (from: string) => measured(from))
  await syncRange('account-a', { ...demoHealth, read }, '2026-08-31', '2026-09-05')
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
    syncRange('account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03'),
  ).rejects.toThrow('health read failed')
  expect(supabase.rpc).not.toHaveBeenCalled()
})

it('a failed atomic replacement fails the sync for retry', async () => {
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  supabase.rpc.mockResolvedValue({ data: null, error: new Error('request interrupted') })
  await expect(
    syncRange('account-a', { ...demoHealth, read }, '2026-10-01', '2026-10-03'),
  ).rejects.toThrow('request interrupted')
})
