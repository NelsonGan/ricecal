import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  useQuery,
} from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import type { HealthReading } from '@/lib/health'
import { useAddWater, useDayMarks } from '../day'
import { invalidateAfterSync, readingFingerprints } from '../health-sync'
import { invalidateEatenTotals, invalidateEntryPosts, keys } from '../keys'
import { useRecipeQuota } from '../recipes'
import { useSocialFeed } from '../social'
import type { DayLog } from '../types'
import { ReadsWhileShown } from '../while-shown'

/**
 * What a write refetches, and what it leaves alone.
 *
 * None of these can fail visibly: a refetch too many draws the same screen. It
 * only shows in the request log, where one return to the app was 29 requests
 * and a meal logged behind a mounted Feed tab was 11. Each rule here took some
 * of those away, and a later edit that widens an invalidation puts them back
 * without a test going red anywhere else.
 */

const USER = 'eater'

let mockEntitled = false
const mockRpc = jest.fn()
const mockCount = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: () => ({
      select: () => ({ eq: () => mockCount() }),
    }),
  },
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../session', () => ({ useUserId: () => 'eater' }))
jest.mock('../subscription', () => ({
  useEntitlement: () => ({ entitled: mockEntitled, loading: false }),
}))
jest.mock('../pending-snaps', () => ({
  usePendingSnaps: () => ({ snaps: [], remove: () => {} }),
  pendingAsEntry: () => null,
}))
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), setPersonProps: jest.fn() }))

const clients: QueryClient[] = []

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

/**
 * A query somebody is looking at: cached, with a subscriber, counting every
 * fetch after the one that filled it.
 */
function watched(
  client: QueryClient,
  queryKey: readonly unknown[],
  meta?: Record<string, unknown>,
) {
  const fetches = { count: 0 }
  client.setQueryData(queryKey, 'cached')
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: async () => {
      fetches.count += 1
      return 'fresh'
    },
    staleTime: Number.POSITIVE_INFINITY,
    meta,
  })
  const stop = observer.subscribe(() => {})
  return { fetches, stop, stale: () => client.getQueryState(queryKey)?.isInvalidated === true }
}

const settle = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  mockEntitled = false
  mockRpc.mockReset()
  mockCount.mockReset()
})

// A cached query keeps a collection timer, and Jest waits on it.
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})

describe('a meal written', () => {
  it('leaves movement alone, which a meal cannot change', async () => {
    const { client } = setup()
    const day = watched(client, keys.activityDay(USER, '2026-11-10'))
    const sessions = watched(client, keys.activitySessions(USER, '2026-11-10'))
    const marks = watched(client, keys.dayMarks(USER, '2026-11-09', '2026-11-15'))

    invalidateEatenTotals(client, USER)
    await settle()

    expect(day.fetches.count).toBe(0)
    expect(sessions.fetches.count).toBe(0)
    // The dots under the strip do count what was eaten.
    expect(marks.fetches.count).toBe(1)
    for (const query of [day, sessions, marks]) query.stop()
  })

  it('marks the mounted Feed tab stale instead of refetching it', async () => {
    const { client } = setup()
    // As `useSocialFeed` marks a feed whose tab is behind another.
    const feed = watched(client, keys.socialRead(USER, 'social_feed', { p_mode: 'following' }), {
      shown: false,
    })
    const profile = watched(client, keys.socialRead(USER, 'social_profile', { p_user_id: USER }))
    const post = watched(client, keys.socialRead(USER, 'social_post', { id: 'post-1' }))
    const entry = watched(client, keys.socialRead(USER, 'entry', { entryId: 'entry-1' }))
    const notifications = watched(client, keys.socialRead(USER, 'social_notifications'))

    await invalidateEntryPosts(client, USER)
    await settle()

    // The tab's reads wait for the tab to be shown, which refetches stale ones.
    expect(feed.fetches.count).toBe(0)
    expect(feed.stale()).toBe(true)
    expect(profile.fetches.count).toBe(0)
    expect(profile.stale()).toBe(true)
    // The screens drawing this meal's post are on top, so they ask now.
    expect(post.fetches.count).toBe(1)
    expect(entry.fetches.count).toBe(1)
    // And a meal moves nothing else on the social side.
    expect(notifications.fetches.count).toBe(0)
    expect(notifications.stale()).toBe(false)
    for (const query of [feed, profile, post, entry, notifications]) query.stop()
  })

  it('refetches the feed when it is the tab in front', async () => {
    const { client, wrapper } = setup()
    // `abortSignal` is how the social reads send theirs.
    mockRpc.mockImplementation(() => ({ abortSignal: async () => ({ data: [], error: null }) }))

    // A scan can finish after its sheet has closed over the Feed tab.
    const inFront = await renderHook(() => useSocialFeed('following', 'all', true), { wrapper })
    await settle()
    const mounted = mockRpc.mock.calls.length

    await invalidateEntryPosts(client, USER)
    await settle()
    expect(mockRpc.mock.calls.length).toBe(mounted + 1)
    await inFront.unmount()

    const behind = await renderHook(() => useSocialFeed('discover', 'all', false), { wrapper })
    await settle()
    const hidden = mockRpc.mock.calls.length

    await invalidateEntryPosts(client, USER)
    await settle()
    expect(mockRpc.mock.calls.length).toBe(hidden)
    await behind.unmount()
  })
})

describe('a health sync landed', () => {
  const reading = (over: Partial<HealthReading> = {}): HealthReading => ({
    days: [],
    workouts: [],
    hours: [],
    weights: [],
    deviceName: null,
    ...over,
  })
  const step = (steps: number) =>
    reading({ days: [{ date: '2026-11-10', steps } as HealthReading['days'][number]] })

  it('tells more steps apart from a new weigh-in', () => {
    const before = readingFingerprints('2026-11-04', '2026-11-10', [step(4000)])
    const walked = readingFingerprints('2026-11-04', '2026-11-10', [step(4200)])
    expect(walked.movement).not.toBe(before.movement)
    expect(walked.workouts).toBe(before.workouts)
    expect(walked.weights).toBe(before.weights)

    const weighed = readingFingerprints('2026-11-04', '2026-11-10', [
      { ...step(4000), weights: [{ date: '2026-11-10', kg: 71.2, bodyFatPct: null }] },
    ])
    expect(weighed.weights).not.toBe(before.weights)
    expect(weighed.movement).toBe(before.movement)
  })

  it('reads the window sliding a day as a change', () => {
    const monday = readingFingerprints('2026-11-03', '2026-11-09', [reading()])
    const tuesday = readingFingerprints('2026-11-04', '2026-11-10', [reading()])
    expect(tuesday.weights).not.toBe(monday.weights)
  })

  function mounted(client: QueryClient) {
    return {
      diary: watched(client, keys.day(USER, '2026-11-10')),
      movement: watched(client, keys.activityDay(USER, '2026-11-10')),
      sessions: watched(client, keys.activitySessions(USER, '2026-11-10')),
      marks: watched(client, keys.dayMarks(USER, '2026-11-09', '2026-11-15')),
      weighIns: watched(client, keys.weighIns(USER)),
      targets: watched(client, keys.goals(USER)),
      charts: watched(client, keys.trendSummary(USER, '30d')),
    }
  }

  it('refetches the movement and the dots for new steps, and nothing else', async () => {
    const { client } = setup()
    const queries = mounted(client)

    invalidateAfterSync(client, USER, { movement: true, workouts: false, weights: false })
    await settle()

    expect(queries.movement.fetches.count).toBe(1)
    expect(queries.marks.fetches.count).toBe(1)
    // The diary is not the health store's. It was refetched on every pass.
    expect(queries.diary.fetches.count).toBe(0)
    expect(queries.sessions.fetches.count).toBe(0)
    expect(queries.weighIns.fetches.count).toBe(0)
    expect(queries.targets.fetches.count).toBe(0)
    expect(queries.charts.fetches.count).toBe(0)
    for (const query of Object.values(queries)) query.stop()
  })

  it('refetches the budget and the charts for a weigh-in, which moves the target', async () => {
    const { client } = setup()
    const queries = mounted(client)

    invalidateAfterSync(client, USER, { movement: false, workouts: false, weights: true })
    await settle()

    expect(queries.weighIns.fetches.count).toBe(1)
    expect(queries.targets.fetches.count).toBe(1)
    expect(queries.charts.fetches.count).toBe(1)
    expect(queries.marks.fetches.count).toBe(1)
    expect(queries.movement.fetches.count).toBe(0)
    expect(queries.diary.fetches.count).toBe(0)
    for (const query of Object.values(queries)) query.stop()
  })

  it('refetches the session lists for a workout', async () => {
    const { client } = setup()
    const queries = mounted(client)

    invalidateAfterSync(client, USER, { movement: false, workouts: true, weights: false })
    await settle()

    expect(queries.sessions.fetches.count).toBe(1)
    expect(queries.movement.fetches.count).toBe(0)
    expect(queries.marks.fetches.count).toBe(0)
    for (const query of Object.values(queries)) query.stop()
  })

  it('refetches everything a sync can move after a connect', async () => {
    const { client } = setup()
    const queries = mounted(client)

    invalidateAfterSync(client, USER)
    await settle()

    const { diary, ...moved } = queries
    for (const query of Object.values(moved)) expect(query.fetches.count).toBe(1)
    expect(diary.fetches.count).toBe(0)
    for (const query of Object.values(queries)) query.stop()
  })
})

describe('a drink recorded', () => {
  const DATE = '2026-11-10'
  const day = (waterMl: number): DayLog => ({ date: DATE, entries: [], waterMl })

  it("writes the server's total back and does not refetch the day", async () => {
    const { client, wrapper } = setup()
    const diary = watched(client, keys.day(USER, DATE))
    client.setQueryData(keys.day(USER, DATE), day(500))
    // The server clamps and counts drinks from other devices, so its total can
    // differ from the phone's arithmetic. It is the one kept.
    mockRpc.mockResolvedValue({ data: 800, error: null })

    const { result, unmount } = await renderHook(() => useAddWater(DATE), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(250)
    })
    await settle()

    expect(mockRpc).toHaveBeenCalledWith('add_water', { p_ml: 250, p_date: DATE })
    expect(client.getQueryData<DayLog>(keys.day(USER, DATE))?.waterMl).toBe(800)
    expect(diary.fetches.count).toBe(0)
    diary.stop()
    await unmount()
  })

  it('asks for the day when two taps were out at once', async () => {
    const { client, wrapper } = setup()
    const diary = watched(client, keys.day(USER, DATE))
    client.setQueryData(keys.day(USER, DATE), day(500))
    const answers: Array<(reply: { data: number; error: null }) => void> = []
    mockRpc.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve as (typeof answers)[number])),
    )

    const { result, unmount } = await renderHook(() => useAddWater(DATE), { wrapper })
    await act(async () => {
      result.current.mutate(250)
      result.current.mutate(250)
    })
    await settle()
    // Both shown at once, before either answer.
    expect(client.getQueryData<DayLog>(keys.day(USER, DATE))?.waterMl).toBe(1000)

    // Answered out of order: the second tap's total lands first.
    await act(async () => {
      answers[1]({ data: 1000, error: null })
      answers[0]({ data: 750, error: null })
    })
    await settle()

    // Neither total is trusted over the other, so the day is read again.
    expect(diary.fetches.count).toBe(1)
    diary.stop()
    await unmount()
  })

  it('settles the day the drink was added to, not the one selected by then', async () => {
    const { client, wrapper } = setup()
    const TUESDAY = '2026-11-11'
    client.setQueryData(keys.day(USER, DATE), day(500))
    client.setQueryData(keys.day(USER, TUESDAY), { date: TUESDAY, entries: [], waterMl: 0 })
    let answer: (reply: { data: number; error: null }) => void = () => {}
    mockRpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )

    const { result, rerender, unmount } = await renderHook(
      ({ date }: { date: string }) => useAddWater(date),
      { wrapper, initialProps: { date: DATE } },
    )
    await act(async () => {
      result.current.mutate(250)
    })
    // The week strip is tapped before the answer is back.
    await rerender({ date: TUESDAY })
    await act(async () => {
      answer({ data: 750, error: null })
    })
    await settle()

    expect(mockRpc).toHaveBeenCalledWith('add_water', { p_ml: 250, p_date: DATE })
    expect(client.getQueryData<DayLog>(keys.day(USER, DATE))?.waterMl).toBe(750)
    expect(client.getQueryData<DayLog>(keys.day(USER, TUESDAY))?.waterMl).toBe(0)

    // And the next drink on the first day is not left waiting on that one.
    mockRpc.mockResolvedValue({ data: 1000, error: null })
    await rerender({ date: DATE })
    await act(async () => {
      await result.current.mutateAsync(250)
    })
    await settle()
    expect(client.getQueryData<DayLog>(keys.day(USER, DATE))?.waterMl).toBe(1000)
    await unmount()
  })

  it('still reads the day when the tap cancelled a read of it', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(keys.day(USER, DATE), day(500))
    const reads = { count: 0 }
    // A read of the day that is out when the tap lands, as after a return to
    // the app: a meal may be on its way in it.
    const observer = new QueryObserver(client, {
      queryKey: keys.day(USER, DATE),
      queryFn: () => {
        reads.count += 1
        return new Promise<DayLog>((resolve) => setTimeout(() => resolve(day(500)), 20))
      },
    })
    // Subscribing to a stale day starts the read.
    const stop = observer.subscribe(() => {})
    await settle()
    expect(reads.count).toBe(1)
    mockRpc.mockResolvedValue({ data: 750, error: null })

    const { result, unmount } = await renderHook(() => useAddWater(DATE), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(250)
    })
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 40)))

    // The read the tap cancelled is asked again rather than dropped.
    expect(reads.count).toBe(2)
    stop()
    await unmount()
  })

  it('does not let a read that started during the tap put the drink back', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(keys.day(USER, DATE), day(500))
    // The server's row: the drink is in it once the tap has been answered, and
    // a read sees the row as it was when the read began.
    let committed = false
    const observer = new QueryObserver(client, {
      queryKey: keys.day(USER, DATE),
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: () => {
        const seen = committed ? 750 : 500
        return new Promise<DayLog>((resolve) => setTimeout(() => resolve(day(seen)), 30))
      },
    })
    const stop = observer.subscribe(() => {})
    let answer: (reply: { data: number; error: null }) => void = () => {}
    mockRpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )

    const { result, unmount } = await renderHook(() => useAddWater(DATE), { wrapper })
    await act(async () => {
      result.current.mutate(250)
    })
    // A meal finishes saving while the drink is out, and the day is read again.
    await act(async () => {
      client.invalidateQueries({ queryKey: keys.day(USER, DATE) })
    })
    await act(async () => {
      committed = true
      answer({ data: 750, error: null })
    })
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 80)))

    expect(client.getQueryData<DayLog>(keys.day(USER, DATE))?.waterMl).toBe(750)
    stop()
    await unmount()
  })

  it('asks for the day when the drink failed', async () => {
    const { client, wrapper } = setup()
    const diary = watched(client, keys.day(USER, DATE))
    client.setQueryData(keys.day(USER, DATE), day(500))
    mockRpc.mockResolvedValue({ data: null, error: { message: 'nope' } })

    const { result, unmount } = await renderHook(() => useAddWater(DATE), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(250).catch(() => {})
    })
    await settle()

    expect(diary.fetches.count).toBe(1)
    diary.stop()
    await unmount()
  })
})

describe('the week beside the one showing', () => {
  const WEEK = ['2026-11-02', '2026-11-08'] as const
  const row = { at: '2026-11-02', entry_count: 3, kcal: 1800, goal_kcal: 2000, active_kcal: 300 }

  it('asks once for a week it has never had, then draws it', async () => {
    const { wrapper } = setup()
    mockRpc.mockResolvedValue({ data: [row], error: null })

    const { result, unmount } = await renderHook(
      () => useDayMarks(WEEK[0], WEEK[1], { onScreen: false }),
      { wrapper },
    )
    await settle()

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(result.current.data?.['2026-11-02']?.kcal).toBe(1800)
    await unmount()
  })

  it('is not refetched by a meal, and catches up when it is swiped to', async () => {
    const { client, wrapper } = setup()
    mockRpc.mockResolvedValue({ data: [row], error: null })
    client.setQueryData(keys.dayMarks(USER, WEEK[0], WEEK[1]), {})

    const { rerender, unmount } = await renderHook(
      ({ onScreen }: { onScreen: boolean }) => useDayMarks(WEEK[0], WEEK[1], { onScreen }),
      { wrapper, initialProps: { onScreen: false } },
    )
    await settle()
    // Cached, so not asked for.
    expect(mockRpc).not.toHaveBeenCalled()

    invalidateEatenTotals(client, USER)
    await settle()
    expect(mockRpc).not.toHaveBeenCalled()

    await rerender({ onScreen: true })
    await settle()
    expect(mockRpc).toHaveBeenCalledTimes(1)
    await unmount()
  })
})

describe('the recipe count', () => {
  it('is asked for an account with a cap', async () => {
    const { wrapper } = setup()
    mockCount.mockResolvedValue({ count: 2, error: null })

    const { result, unmount } = await renderHook(useRecipeQuota, { wrapper })
    await settle()

    expect(mockCount).toHaveBeenCalledTimes(1)
    expect(result.current).toMatchObject({ count: 2, loading: false, atLimit: false })
    await unmount()
  })

  it('is not asked for Pro, which has no cap to count against', async () => {
    mockEntitled = true
    const { wrapper } = setup()

    const { result, unmount } = await renderHook(useRecipeQuota, { wrapper })
    await settle()

    expect(mockCount).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ limit: null, loading: false, atLimit: false })
    await unmount()
  })
})

describe('a tab that is mounted but not showing', () => {
  /** The app going to the back and coming to the front again. */
  const returnToApp = async () => {
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await settle()
  }

  afterEach(() => focusManager.setFocused(undefined))

  function trends(client: QueryClient, shown: boolean) {
    const fetches = { count: 0 }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ReadsWhileShown shown={shown}>{children}</ReadsWhileShown>
      </QueryClientProvider>
    )
    const useChart = () =>
      useQuery({
        queryKey: keys.trendSummary(USER, '7d'),
        queryFn: async () => {
          fetches.count += 1
          return `answer ${fetches.count}`
        },
        // Always stale, so any refetch that is allowed to happen does.
        staleTime: 0,
      })
    return { fetches, wrapper, useChart }
  }

  it('reads nothing while hidden: not on a write, not on a return to the app', async () => {
    const { client } = setup()
    client.setQueryData(keys.trendSummary(USER, '7d'), 'cached')
    const { fetches, wrapper, useChart } = trends(client, false)

    const { result, unmount } = await renderHook(useChart, { wrapper })
    await settle()
    // What is cached is still drawn.
    expect(result.current.data).toBe('cached')

    invalidateEatenTotals(client, USER)
    await settle()
    await returnToApp()

    expect(fetches.count).toBe(0)
    await unmount()
  })

  it('catches up when it is shown again', async () => {
    const { client } = setup()
    client.setQueryData(keys.trendSummary(USER, '7d'), 'cached')
    let shown = false
    const fetches = { count: 0 }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ReadsWhileShown shown={shown}>{children}</ReadsWhileShown>
      </QueryClientProvider>
    )
    const { result, rerender, unmount } = await renderHook(
      () =>
        useQuery({
          queryKey: keys.trendSummary(USER, '7d'),
          queryFn: async () => {
            fetches.count += 1
            return 'fresh'
          },
        }),
      { wrapper },
    )
    invalidateEatenTotals(client, USER)
    await settle()
    expect(fetches.count).toBe(0)

    shown = true
    await rerender(undefined)
    await settle()

    expect(fetches.count).toBe(1)
    expect(result.current.data).toBe('fresh')
    await unmount()
  })

  it('reads as usual while it is the one showing', async () => {
    const { client } = setup()
    client.setQueryData(keys.trendSummary(USER, '7d'), 'cached')
    const { fetches, wrapper, useChart } = trends(client, true)

    const { unmount } = await renderHook(useChart, { wrapper })
    await settle()
    const mounted = fetches.count
    await returnToApp()

    expect(fetches.count).toBe(mounted + 1)
    await unmount()
  })

  it('does not reload the feed behind another tab on a return to the app', async () => {
    const { client, wrapper } = setup()
    // `abortSignal` is how the social reads send theirs.
    mockRpc.mockImplementation(() => ({
      abortSignal: async () => ({ data: [], error: null }),
    }))

    const hidden = await renderHook(() => useSocialFeed('following', 'all', false), { wrapper })
    await settle()
    const first = mockRpc.mock.calls.length
    expect(first).toBe(1)

    // Stale by the time the app comes back.
    client.invalidateQueries({ queryKey: keys.social(USER), refetchType: 'none' })
    await returnToApp()
    expect(mockRpc.mock.calls.length).toBe(first)
    await hidden.unmount()

    const showing = await renderHook(() => useSocialFeed('following', 'all', true), { wrapper })
    await settle()
    const mounted = mockRpc.mock.calls.length
    client.invalidateQueries({ queryKey: keys.social(USER), refetchType: 'none' })
    await returnToApp()
    expect(mockRpc.mock.calls.length).toBe(mounted + 1)
    await showing.unmount()
  })
})
