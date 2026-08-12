import type { ReviewSummary } from '@/data/types'
import { parseReviewId, periodTitle, reviewId, reviewSteps, underGoalShare } from '../period'

/**
 * How a review is addressed, named, and cut into steps.
 *
 * Three things worth pinning, and all three fail quietly:
 *
 *   1. THE ID. It is the one value in the flow that arrives from outside the
 *      app, and a story that takes an unparseable one on trust asks the server
 *      for the review of `NaN`.
 *   2. THE STEPS. How many there are is decided from what came back, so a
 *      period with no scale and no watch has to lose its last step outright —
 *      the progress bar counts these, and a fourth segment leading to an empty
 *      card is a promise the tap does not keep.
 *   3. THE SHARE. `daysUnderGoal / daysLogged` divides by zero on a period with
 *      a budget and nothing logged, and a progress bar handed `NaN` renders
 *      full — which reads as a perfect week.
 */

const summary = (over: Partial<ReviewSummary> = {}): ReviewSummary => ({
  kind: 'week',
  start: '2026-08-03',
  end: '2026-08-09',
  days: 7,
  daysLogged: 7,
  daysUnderGoal: 5,
  streakDays: 12,

  kcal: 1800,
  kcalGoal: 2000,
  carbs: 200,
  protein: 90,
  fat: 60,
  lightestOn: '2026-08-08',
  lightestKcal: 1500,
  heaviestOn: '2026-08-05',
  heaviestKcal: 2200,

  entries: 21,
  homeCooked: 4,

  water: 6,
  waterGoalDays: 3,

  weightLast: 68,
  weightChange: -0.4,
  weighIns: 4,

  activeDays: 6,
  activeKcal: 280,
  steps: 8000,
  stepGoalDays: 2,
  stepGoal: 8000,
  distanceM: 34000,
  exerciseMinutes: 200,
  sessions: 2,
  ...over,
})

describe('the route a review lives at', () => {
  it('round trips', () => {
    expect(parseReviewId(reviewId('week', '2026-08-03'))).toEqual({
      kind: 'week',
      start: '2026-08-03',
    })
    expect(parseReviewId(reviewId('month', '2026-07-01'))).toEqual({
      kind: 'month',
      start: '2026-07-01',
    })
  })

  it('refuses anything it did not write', () => {
    expect(parseReviewId(undefined)).toBeNull()
    expect(parseReviewId('')).toBeNull()
    // A kind that is not one of ours, a date that is not a date, and the two
    // halves the other way round.
    expect(parseReviewId('year-2026-01-01')).toBeNull()
    expect(parseReviewId('week-tomorrow')).toBeNull()
    expect(parseReviewId('2026-08-03-week')).toBeNull()
    // The shape is right and the date is short. Left through, this reaches
    // Postgres as a date literal and errors on the request rather than here.
    expect(parseReviewId('week-2026-8-3')).toBeNull()
  })
})

describe('what a period is called', () => {
  it('names the month once when the week stays inside it', () => {
    expect(periodTitle('week', '2026-08-03', '2026-08-09')).toBe('3 to 9 August')
  })

  it('names both when it crosses one', () => {
    expect(periodTitle('week', '2026-07-27', '2026-08-02')).toBe('27 July to 2 August')
  })

  it('gives a month its year, since a review list reaches back over one', () => {
    expect(periodTitle('month', '2026-07-01', '2026-07-31')).toBe('July 2026')
  })
})

describe('how many steps a story has', () => {
  it('is four when the period has food, dishes, a scale and a watch', () => {
    expect(reviewSteps(summary(), 5)).toEqual(['card', 'food', 'calories', 'body'])
  })

  it('drops the body step when there is neither a weigh in nor a watch', () => {
    expect(reviewSteps(summary({ weighIns: 0, activeDays: 0 }), 5)).toEqual([
      'card',
      'food',
      'calories',
    ])
  })

  it('keeps it for a scale alone, and for a watch alone', () => {
    expect(reviewSteps(summary({ activeDays: 0 }), 5)).toContain('body')
    expect(reviewSteps(summary({ weighIns: 0 }), 5)).toContain('body')
  })

  it('drops the food step when nothing came back to list', () => {
    expect(reviewSteps(summary(), 0)).toEqual(['card', 'calories', 'body'])
  })

  it('has no steps at all without a summary', () => {
    expect(reviewSteps(null, 5)).toEqual([])
  })
})

describe('the share of the period spent under budget', () => {
  it('is over the days that have food in them, not over the period', () => {
    expect(underGoalShare(summary({ days: 7, daysLogged: 5, daysUnderGoal: 4 }))).toBe(0.8)
  })

  it('is zero rather than NaN when nothing was logged', () => {
    expect(underGoalShare(summary({ daysLogged: 0, daysUnderGoal: 0 }))).toBe(0)
  })
})
