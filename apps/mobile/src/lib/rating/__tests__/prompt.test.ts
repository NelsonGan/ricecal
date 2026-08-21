import * as StoreReview from 'expo-store-review'

import { track } from '@/lib/analytics'
import {
  ASK_DELAY_MS,
  askForRating,
  type RatingRequest,
  ratingDismissed,
  ratingLiked,
  recordMealLogged,
  recordReviewOpened,
  resetRatingStateForTest,
  subscribeToRatingPrompt,
} from '../prompt'
import { MEALS_PER_CHECKPOINT } from '../state'

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

/**
 * Stands in for the embedded manifest, and mutable because the version is one of
 * the gates: `checkRating` refuses to put the same question twice on one build,
 * so a test that wants a second ask has to move this.
 */
const expoConfig = { version: '1.2.0' }
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig }
  },
}))

/**
 * The half of the feature that touches disk and the store.
 *
 * What the arithmetic in `state.test.ts` cannot check: that a counter actually
 * persists, that the question is only ever handed to a sheet that exists, and
 * that every route out of the sheet stamps the cooldown. The last is the one
 * that matters most, because forgetting it turns a polite question into one put
 * again on every fifteenth meal for ever.
 */

const USER = 'user-rating'
const DAY = 24 * 60 * 60 * 1000
const START = Date.UTC(2026, 5, 1, 9, 0, 0)
/** Long enough after the first meal to clear the install and version gates. */
const READY = START + 30 * DAY

const seen: RatingRequest[] = []
let unsubscribe: (() => void) | null = null

/**
 * Run out the beat an automatic ask waits before the sheet arrives. The manual
 * one does not wait, so it never needs this.
 */
function settle(): void {
  jest.advanceTimersByTime(ASK_DELAY_MS)
}

/** A mounted sheet, torn down after every case however the case ended. */
function mountSheet(): void {
  unsubscribe = subscribeToRatingPrompt((request) => seen.push(request))
}

/**
 * Fourteen meals across three days: everything the gate wants except the meal
 * that crosses the checkpoint.
 */
function logToTheBrink(): void {
  recordMealLogged(USER, 1, START)
  for (let i = 0; i < 6; i++) recordMealLogged(USER, 1, START + DAY)
  for (let i = 0; i < 7; i++) recordMealLogged(USER, 1, START + 2 * DAY)
}

beforeEach(() => {
  // Fake, because every automatic ask is booked on a timer. Real ones would
  // make each case below a second long and flaky at the end of it.
  jest.useFakeTimers()
  resetRatingStateForTest(USER)
  seen.length = 0
  jest.clearAllMocks()
})

afterAll(() => {
  jest.useRealTimers()
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = null
})

describe('recordMealLogged', () => {
  it('asks on the meal that crosses the checkpoint, and not before it', () => {
    mountSheet()
    logToTheBrink()
    expect(seen).toHaveLength(0)

    recordMealLogged(USER, 1, READY)
    // Booked, not shown: the sheet is held back until a navigation started in
    // the same breath as the write has had time to land.
    expect(seen).toHaveLength(0)
    settle()
    expect(seen).toEqual([{ trigger: 'meal_milestone', userId: USER }])
    expect(track).toHaveBeenCalledWith('Rating Prompt Shown', { trigger: 'meal_milestone' })
  })

  it('reports why the gate turned a crossing down', () => {
    mountSheet()
    // One meal on the day this account was first seen, then a fortnight of them
    // a month later: fifteen meals, and only two days with anything on them.
    recordMealLogged(USER, 1, START)
    for (let i = 0; i < MEALS_PER_CHECKPOINT - 1; i++) recordMealLogged(USER, 1, READY)

    settle()
    expect(seen).toHaveLength(0)
    expect(track).toHaveBeenCalledWith('Rating Prompt Skipped', {
      trigger: 'meal_milestone',
      reason: 'too_few_active_days',
    })
  })

  it('spends nothing when no sheet is mounted', () => {
    // A trigger that fires before the root has rendered. Marking the cooldown
    // here would buy sixty days of silence for a dialog nobody saw.
    logToTheBrink()
    recordMealLogged(USER, 1, READY)
    settle()
    expect(track).not.toHaveBeenCalledWith('Rating Prompt Shown', expect.anything())

    // And the count survived, so the next checkpoint still arrives.
    mountSheet()
    for (let i = 0; i < MEALS_PER_CHECKPOINT; i++) recordMealLogged(USER, 1, READY)
    settle()
    expect(seen).toEqual([{ trigger: 'meal_milestone', userId: USER }])
  })
})

describe('recordReviewOpened', () => {
  it('rides on the second review once the meals are there', () => {
    mountSheet()
    logToTheBrink()
    // The meal threshold gates every trigger, not only the meal one: a review
    // is evidence of interest, and fifteen meals is evidence the app has done
    // the thing it is for. This crossing puts the sheet up and is discarded,
    // since nothing here answers it and so nothing is stamped.
    recordMealLogged(USER, 1, READY)
    settle()
    seen.length = 0

    recordReviewOpened(USER, READY)
    settle()
    expect(seen).toHaveLength(0)
    recordReviewOpened(USER, READY)
    settle()
    expect(seen).toEqual([{ trigger: 'review_opened', userId: USER }])
  })
})

it('books one sheet even when two triggers fire inside the delay', () => {
  mountSheet()
  logToTheBrink()
  recordMealLogged(USER, 1, READY)
  // A review read before the meal's timer has run out. Two sheets racing for
  // one answer would stamp the cooldown twice and report two of everything.
  recordReviewOpened(USER, READY)
  recordReviewOpened(USER, READY)
  settle()

  expect(seen).toEqual([{ trigger: 'meal_milestone', userId: USER }])
})

describe('askForRating', () => {
  it('skips every threshold, because the user asked', () => {
    mountSheet()
    // A brand new account, which fails the first gate and three more behind it.
    // No `settle()`: a row somebody tapped answers at once.
    askForRating(USER)
    expect(seen).toEqual([{ trigger: 'manual', userId: USER }])
    expect(track).toHaveBeenCalledWith('Rating Prompt Shown', { trigger: 'manual' })
  })
})

describe('the answers', () => {
  it('stamps the cooldown on a dismissal, not only on a yes', () => {
    mountSheet()
    logToTheBrink()
    recordMealLogged(USER, 1, READY)
    settle()
    expect(seen).toHaveLength(1)

    ratingDismissed(seen[0])
    seen.length = 0

    // The next checkpoint, fifteen meals and a day later.
    for (let i = 0; i < MEALS_PER_CHECKPOINT; i++) recordMealLogged(USER, 1, READY + DAY)
    settle()
    expect(seen).toHaveLength(0)
    expect(track).toHaveBeenCalledWith('Rating Prompt Skipped', {
      trigger: 'meal_milestone',
      reason: 'asked_recently',
    })
  })

  it('asks again after a release, but not before one', () => {
    mountSheet()
    logToTheBrink()
    recordMealLogged(USER, 1, READY)
    settle()
    ratingDismissed(seen[0])
    seen.length = 0

    // Well past the sixty-day cooldown, same build. Still no.
    for (let i = 0; i < MEALS_PER_CHECKPOINT; i++) recordMealLogged(USER, 1, READY + 200 * DAY)
    settle()
    expect(seen).toHaveLength(0)
    expect(track).toHaveBeenCalledWith('Rating Prompt Skipped', {
      trigger: 'meal_milestone',
      reason: 'asked_on_this_version',
    })

    // A release. The two-day settling clock starts when this account is first
    // seen on the new build rather than when it shipped, which is the meal
    // below and not the release, so a checkpoint crossed in the same breath is
    // still refused.
    expoConfig.version = '1.3.0'
    recordMealLogged(USER, 1, READY + 203 * DAY)
    for (let i = 0; i < MEALS_PER_CHECKPOINT; i++) recordMealLogged(USER, 1, READY + 206 * DAY)
    settle()
    expect(seen).toEqual([{ trigger: 'meal_milestone', userId: USER }])
  })

  it('hands a yes to the store, and survives a store that will not take it', async () => {
    const available = StoreReview.isAvailableAsync as jest.Mock
    const request: RatingRequest = { trigger: 'manual', userId: USER }

    available.mockResolvedValueOnce(true)
    await ratingLiked(request)
    expect(StoreReview.requestReview).toHaveBeenCalled()

    // No dialog available is not an error the user should ever see: the rating
    // is a courtesy, and their answer has already been recorded.
    available.mockRejectedValueOnce(new Error('no store here'))
    await expect(ratingLiked(request)).resolves.toBeUndefined()
    expect(track).toHaveBeenCalledWith('Rating Prompt Answered', {
      trigger: 'manual',
      answer: 'liked',
    })
  })
})
