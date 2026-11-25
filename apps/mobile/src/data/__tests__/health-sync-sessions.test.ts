import { QueryClient } from '@tanstack/react-query'
import { syncRange, workoutWindow } from '@/data/health-sync'
import { demoHealth, type HealthReading, type WorkoutReading } from '@/lib/health'

/**
 * Garmin Connect re-saves each workout in Apple Health under a new id, and an
 * upsert alone kept every copy: one run showed four times on Today. Each pass
 * now tells the server which workouts the store still holds before it upserts.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: { from: jest.Mock; rpc: jest.Mock }
}

const run = (over: Partial<WorkoutReading> = {}): WorkoutReading => ({
  externalId: '6B78A821',
  date: '2026-11-16',
  kind: 'run',
  kindLabel: null,
  startedAt: '2026-11-16T13:55:29.000Z',
  endedAt: '2026-11-16T14:18:49.000Z',
  durationS: 1400,
  activeKcal: 153,
  distanceM: 3000,
  avgHr: null,
  maxHr: null,
  elevationM: null,
  hrZones: null,
  sourceName: 'Connect',
  ...over,
})

const reading = (workouts: WorkoutReading[]): HealthReading => ({
  days: [],
  workouts,
  hours: [],
  weights: [],
  deviceName: null,
})

let order: string[]

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-20T12:00:00'))
  order = []
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn(async () => {
      order.push('upsert')
      return { data: null, error: null }
    }),
  }
  supabase.from.mockReset().mockReturnValue(query)
  supabase.rpc.mockReset().mockImplementation(async (name: string) => {
    order.push(name)
    return { data: name === 'reconcile_activity_sessions' ? 3 : 0, error: null }
  })
})

afterEach(() => jest.useRealTimers())

const sync = (workouts: WorkoutReading[]) =>
  syncRange(
    new QueryClient(),
    'account-a',
    { ...demoHealth, read: jest.fn().mockResolvedValue(reading(workouts)) },
    '2026-11-14',
    '2026-11-20',
  )

it('reconciles the window before upserting what was read', async () => {
  // An impossible session is not written, but it is still in the store.
  const result = await sync([run(), run({ externalId: 'BROKEN', durationS: -5 })])

  const window = workoutWindow('2026-11-14', '2026-11-20')
  expect(supabase.rpc).toHaveBeenCalledWith('reconcile_activity_sessions', {
    p_provider: 'demo',
    p_from: window.from,
    p_to: window.to,
    p_sessions: [
      {
        external_id: '6B78A821',
        started_at: '2026-11-16T13:55:29.000Z',
        kind: 'run',
        source_name: 'Connect',
      },
      {
        external_id: 'BROKEN',
        started_at: '2026-11-16T13:55:29.000Z',
        kind: 'run',
        source_name: 'Connect',
      },
    ],
    p_user_id: 'account-a',
  })
  expect(order.indexOf('reconcile_activity_sessions')).toBeLessThan(order.indexOf('upsert'))
  expect(result.changed.workouts).toBe(true)
})

it('copies removed refetch the lists even when the reading is unchanged', async () => {
  let removed = 0
  supabase.rpc.mockImplementation(async (name: string) => ({
    data: name === 'reconcile_activity_sessions' ? removed : 0,
    error: null,
  }))
  const pass = () =>
    syncRange(
      new QueryClient(),
      'account-unchanged',
      { ...demoHealth, read: jest.fn().mockResolvedValue(reading([run()])) },
      '2026-11-14',
      '2026-11-20',
    )

  await pass()
  // The same reading again, with nothing to tidy: nothing to refetch.
  expect((await pass()).changed.workouts).toBe(false)
  // The same reading again, but the server removed three copies.
  removed = 3
  expect((await pass()).changed.workouts).toBe(true)
})

it('an empty read asks nothing to be removed', async () => {
  await sync([])
  expect(supabase.rpc).not.toHaveBeenCalledWith('reconcile_activity_sessions', expect.anything())
})

it('a failed reconcile still writes the workouts', async () => {
  supabase.rpc.mockImplementation(async (name: string) => {
    order.push(name)
    return name === 'reconcile_activity_sessions'
      ? { data: null, error: { message: 'boom' } }
      : { data: 0, error: null }
  })
  await expect(sync([run()])).resolves.toBeDefined()
  expect(order).toContain('upsert')
})

it('the window is local midnight to the midnight after the last day', () => {
  const window = workoutWindow('2026-11-14', '2026-11-20')
  expect(new Date(window.from)).toEqual(new Date(2026, 10, 14))
  expect(new Date(window.to)).toEqual(new Date(2026, 10, 21))
})

describe('a reconcile that fails', () => {
  const errors = require('@/lib/errors') as typeof import('@/lib/errors')
  let reporter: jest.Mock

  beforeEach(() => {
    reporter = jest.fn()
    errors.registerErrorReporter(reporter)
  })
  afterEach(() => errors.registerErrorReporter(null))

  const failWith = (answer: { error: { message: string; code: string }; status: number }) =>
    supabase.rpc.mockImplementation(async (name: string) =>
      name === 'reconcile_activity_sessions'
        ? { data: null, ...answer }
        : { data: 0, error: null, status: 200 },
    )

  // supabase-js answers a request that never arrived with status 0, and the
  // client's fetch already reports a host that cannot be reached. Filing each
  // dropped connection here too made one PostHog issue of ordinary bad signal.
  it('on a dropped connection is not reported', async () => {
    failWith({
      error: { message: 'Error: fetch failed: The network connection was lost.', code: '' },
      status: 0,
    })
    await sync([run()])
    expect(reporter).not.toHaveBeenCalled()
  })

  it('with an answer from the server is still reported', async () => {
    failWith({ error: { message: 'permission denied', code: '42501' }, status: 403 })
    await sync([run()])
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ scope: 'health_reconcile' }),
    )
  })
})
