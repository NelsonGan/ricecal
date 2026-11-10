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

it('leaves out an impossible hour instead of failing the window and the weigh-ins after it', async () => {
  const read = jest.fn().mockResolvedValue({
    ...empty(),
    hours: [
      { date: '2026-10-02', hour: 9, steps: 100, activeKcal: 9000, distanceM: null },
      { date: '2026-10-02', hour: 10, steps: 200, activeKcal: 12, distanceM: 900_000 },
      { date: '2026-10-02', hour: 11, steps: 300, activeKcal: 15, distanceM: 210 },
    ],
    weights: [{ date: '2026-10-02', kg: 70, bodyFatPct: null }],
  })
  await syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(supabase.rpc.mock.calls[0][1].p_hours).toEqual([
    { log_date: '2026-10-02', hour: 10, steps: 200, active_kcal: 12, distance_m: null },
    { log_date: '2026-10-02', hour: 11, steps: 300, active_kcal: 15, distance_m: 210 },
  ])
  expect(supabase.rpc).toHaveBeenCalledWith('sync_weight_readings', expect.anything())
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

it('says which parts of a pass read anything the last one did not', async () => {
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  const pass = () =>
    syncRange(new QueryClient(), 'account-b', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  // A first pass has nothing to compare with, so everything is new.
  expect((await pass()).changed).toEqual({ movement: true, workouts: true, weights: true })
  // Still written: a late edit has to land even when nothing on screen moves.
  supabase.rpc.mockClear()
  expect((await pass()).changed).toEqual({ movement: false, workouts: false, weights: false })
  expect(supabase.rpc).toHaveBeenCalledWith('replace_activity_hours', expect.anything())
  // A different day's movement is movement alone: the weigh-ins and the
  // workouts read as they did, so nothing they feed is refetched.
  read.mockResolvedValue(measured('2026-10-03'))
  expect((await pass()).changed).toEqual({ movement: true, workouts: false, weights: false })
  read.mockResolvedValue({
    ...measured('2026-10-03'),
    weights: [{ date: '2026-10-03', kg: 71.4, bodyFatPct: null }],
  })
  expect((await pass()).changed).toEqual({ movement: false, workouts: false, weights: true })
})

it("takes the server's word that a weigh-in was written, even when nothing new was read", async () => {
  const read = jest.fn().mockResolvedValue({
    ...measured('2026-10-02'),
    weights: [{ date: '2026-10-02', kg: 71.4, bodyFatPct: null }],
  })
  const pass = () =>
    syncRange(new QueryClient(), 'account-e', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  await pass()
  expect((await pass()).changed.weights).toBe(false)

  // The same reading, but this time it changed a row: the typed weigh-in that
  // was keeping it out has been deleted. The budget moved with it.
  supabase.rpc.mockImplementation(async (name: string) => ({
    data: name === 'sync_weight_readings' ? 1 : 0,
    error: null,
  }))
  expect((await pass()).changed).toEqual({ movement: false, workouts: false, weights: true })
})

it('does not call a pass over while one of its writes is still out', async () => {
  const read = jest.fn().mockResolvedValue({
    ...measured('2026-10-02'),
    weights: [{ date: '2026-10-02', kg: 71.4, bodyFatPct: null }],
  })
  let hoursLanded = false
  supabase.rpc.mockImplementation((name: string) =>
    name === 'replace_activity_hours'
      ? new Promise((resolve) =>
          setTimeout(() => {
            hoursLanded = true
            resolve({ data: 0, error: null })
          }, 50),
        )
      : Promise.resolve({ data: null, error: new Error('weigh-ins refused') }),
  )
  const pass = syncRange(
    new QueryClient(),
    'account-f',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  const failed = expect(pass).rejects.toThrow('weigh-ins refused')
  await jest.advanceTimersByTimeAsync(60)
  await failed
  // Had it rejected at the first failure, the next pass could start with the
  // hours of this one still on the wire.
  expect(hoursLanded).toBe(true)
})

it('writes the four tables together, and a failure in one does not skip the others', async () => {
  const read = jest.fn().mockResolvedValue({
    ...measured('2026-10-02'),
    weights: [{ date: '2026-10-02', kg: 71.4, bodyFatPct: null }],
  })
  // The hours are refused. In turn, the weigh-ins behind them were never sent.
  supabase.rpc.mockImplementation(async (name: string) =>
    name === 'replace_activity_hours'
      ? { data: null, error: new Error('hours refused') }
      : { data: 1, error: null },
  )
  const pass = () =>
    syncRange(new QueryClient(), 'account-d', { ...demoHealth, read }, '2026-10-01', '2026-10-03')
  await expect(pass()).rejects.toThrow('hours refused')
  expect(supabase.rpc).toHaveBeenCalledWith('sync_weight_readings', expect.anything())
  // And the pass still counts as not landed, so the next one sends it all again.
  supabase.rpc.mockResolvedValue({ data: 1, error: null })
  expect((await pass()).changed).toEqual({ movement: true, workouts: true, weights: true })
})

it('syncs without the person when their profile cannot be read', async () => {
  const query = supabase.from()
  query.maybeSingle.mockResolvedValue({ data: null, error: new Error('profile unavailable') })
  const read = jest.fn().mockResolvedValue(measured('2026-10-02'))
  await syncRange(
    new QueryClient(),
    'account-c',
    { ...demoHealth, read },
    '2026-10-01',
    '2026-10-03',
  )
  expect(read).toHaveBeenCalledWith(
    '2026-10-01',
    '2026-10-03',
    expect.objectContaining({ age: null, basalKcal: null }),
  )
})

it('drops an hour outside the read window instead of failing the sync and the weigh-ins after it', async () => {
  const read = jest.fn().mockResolvedValue({
    ...empty(),
    hours: [
      { date: '2026-09-30', hour: 23, steps: 40, activeKcal: 0, distanceM: null },
      { date: '2026-10-02', hour: 9, steps: 100, activeKcal: 0, distanceM: null },
      { date: '2026-10-04', hour: 0, steps: 12, activeKcal: 0, distanceM: null },
    ],
    weights: [{ date: '2026-10-02', kg: 70, bodyFatPct: null }],
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
    p_hours: [{ log_date: '2026-10-02', hour: 9, steps: 100, active_kcal: 0, distance_m: null }],
  })
  expect(supabase.rpc).toHaveBeenCalledWith('sync_weight_readings', expect.anything())
})
