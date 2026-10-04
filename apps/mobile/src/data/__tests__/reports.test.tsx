import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { useReviewMeals, useReviewPeriods, useReviewSeries, useReviewSummary } from '../reviews'
import { useTrendSeries, useTrendSummary } from '../trends'

const mockRpc = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}))
jest.mock('../session', () => ({ useUserId: () => 'reader' }))

// These represent the wire format, including numeric strings and genuine gaps.
const trendRow = {
  bucket_start: '2026-09-29',
  bucket_end: '2026-09-29',
  from_date: '2026-09-29',
  to_date: '2026-10-05',
  days: '7',
  kcal_avg: '1800.5',
  carbs_g_avg: '200',
  protein_g_avg: null,
  fat_g_avg: '60',
  days_logged: '3',
  kcal_goal: null,
  days_under_goal: null,
  water_avg: null,
  water_total: '500',
  water_best: '500',
  water_goal_days: null,
  water_habit_days: null,
  water_logged_days: '1',
  water_goal: '2000',
  weight_before: '62',
  weight_first: '61.8',
  weight_last: null,
  weight_avg: '61.8',
  weight_min: '61.8',
  weight_peak: '61.8',
  weight_peak_on: '2026-09-30',
  weigh_ins: '1',
}
const reviewRow = {
  kind: 'week',
  starts_on: '2026-09-28',
  ends_on: '2026-10-04',
  bucket_start: '2026-09-28',
  days: '7',
  days_logged: '3',
  days_under_goal: null,
  streak_days: '2',
  kcal_avg: '1800.5',
  kcal_goal: null,
  carbs_g_avg: '200',
  protein_g_avg: null,
  fat_g_avg: '60',
  lightest_on: null,
  lightest_kcal: null,
  heaviest_on: null,
  heaviest_kcal: null,
  marks: ['1800.5', null, '0'],
  water_avg: null,
  water_goal_days: null,
  weight_last: null,
  weight_change: '-0.2',
  weigh_ins: '1',
  active_days: null,
  active_kcal_avg: null,
  steps_avg: null,
  step_goal_days: null,
  step_goal: null,
  distance_total_m: null,
  exercise_min_total: null,
  sessions: null,
  name: 'Lunch',
  icon_set: null,
  icon_name: null,
  photo_path: null,
}

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })
  mockRpc
    .mockReset()
    .mockImplementation((name: string) =>
      Promise.resolve({ data: [name.startsWith('trend_') ? trendRow : reviewRow], error: null }),
    )
})
afterEach(() => client.clear())

it('preserves unknown readings and zero counts across Trends and Reviews', async () => {
  const { result, unmount } = await renderHook(
    () => ({
      trends: useTrendSeries('7d'),
      trendSummary: useTrendSummary('7d'),
      periods: useReviewPeriods('week'),
      reviews: useReviewSeries('week', '2026-09-28'),
      reviewSummary: useReviewSummary('week', '2026-09-28'),
      meals: useReviewMeals('week', '2026-09-28'),
    }),
    { wrapper },
  )
  await waitFor(() =>
    expect(Object.values(result.current).every((query) => query.isSuccess)).toBe(true),
  )
  expect(result.current.trends.data?.[0]).toMatchObject({
    kcal: 1800.5,
    protein: null,
    weight: null,
    water: 0,
    daysUnderGoal: 0,
  })
  expect(result.current.trendSummary.data).toMatchObject({
    weightBefore: 62,
    weightLast: null,
    water: 0,
    daysLogged: 3,
  })
  expect(result.current.periods.data?.[0]).toMatchObject({
    marks: [1800.5, null, 0],
    weightChange: -0.2,
  })
  expect(result.current.reviews.data?.[0]).toMatchObject({
    kcal: 1800.5,
    protein: null,
    steps: null,
  })
  expect(result.current.reviewSummary.data).toMatchObject({
    activeKcal: null,
    activeDays: 0,
    sessions: 0,
    water: 0,
  })
  expect(result.current.meals.data?.[0]).toMatchObject({ name: 'Lunch', kcal: 1800.5, protein: 0 })
  await unmount()
})

it('serves review list and detail observers with one request', async () => {
  const first = await renderHook(() => useReviewPeriods('week'), { wrapper })
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
  const second = await renderHook(() => useReviewPeriods('week'), { wrapper })
  expect(second.result.current.data).toBe(first.result.current.data)
  expect(mockRpc).toHaveBeenCalledTimes(1)
  await first.unmount()
  await second.unmount()
})

it('makes no detail requests until a route resolves to a period', async () => {
  const { unmount } = await renderHook(
    () => {
      useReviewSeries('week', '')
      useReviewSummary('week', '')
      useReviewMeals('week', '')
    },
    { wrapper },
  )
  expect(mockRpc).not.toHaveBeenCalled()
  await unmount()
})

it('surfaces failed reports rather than treating them as empty periods', async () => {
  const error = new Error('Report unavailable')
  mockRpc.mockResolvedValue({ data: null, error })
  const { result, unmount } = await renderHook(() => useTrendSeries('7d'), { wrapper })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toBe(error)
  expect(result.current.data).toBeUndefined()
  await unmount()
})
