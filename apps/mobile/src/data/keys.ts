/**
 * Every query key in the app.
 *
 * One file, so a mutation invalidating "the day" cannot spell it differently
 * from the query that reads it. That mistake shows up as a screen that
 * silently does not refresh, which looks like a caching bug and is a typo.
 *
 * Keys are scoped to the user even though RLS already scopes the data, so
 * the wrong account cannot read them if the sign-out cache clear regresses.
 */
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  settings: (userId: string) => ['settings', userId] as const,
  mealTimes: (userId: string) => ['meal-times', userId] as const,
  goals: (userId: string) => ['goals', userId] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
  /**
   * What the store says, as against what our own mirror says.
   *
   * A second key rather than a field on the one above, because the two answer
   * at different times: this is the RevenueCat SDK's cached receipt, ready the
   * instant a purchase settles, and `subscription` is the row a webhook writes
   * some seconds later. `useEntitlement` reads both.
   */
  storeEntitlement: (userId: string) => ['store-entitlement', userId] as const,
  /**
   * Every account's store answer, for the one reader with no session to ask
   * with (`storeSaysPaid` in `data/refusals.ts`). Only ever one entry, since
   * the cache is cleared on an account change.
   */
  storeEntitlementAll: () => ['store-entitlement'] as const,
  /**
   * How many of today's scans are left. Keyed by user, not by date: only the
   * server knows which day is the user's, so a key carrying the phone's idea of
   * today goes stale at the wrong midnight for anybody who has flown.
   */
  scanQuota: (userId: string) => ['scan-quota', userId] as const,
  /**
   * What each plan costs, as the store reports it.
   *
   * Not keyed by user: the price belongs to the device's storefront, not to who
   * is signed in. Refetched rarely, since a price change takes days.
   */
  planPrices: () => ['plan-prices'] as const,

  day: (userId: string, date: string) => ['day', userId, date] as const,
  /**
   * Every day of this account.
   *
   * The prefix exists for the health sync, the one writer that changes a figure
   * on a day it cannot name: a watch backfilling Tuesday moves Tuesday's
   * budget, and the pass that wrote it has a window rather than a date.
   */
  dayAll: (userId: string) => ['day', userId] as const,
  /** Totals for a date range, for the charts and the weekly report. */
  nutrition: (userId: string, from: string, to: string) => ['nutrition', userId, from, to] as const,
  /**
   * One week of dots under the strip on Today: eaten, goal and movement per day.
   */
  dayMarks: (userId: string, from: string, to: string) => ['day-marks', userId, from, to] as const,
  /**
   * Every week of them, which is what the write side wants. A logged meal moves
   * one day's dot and a health sync moves seven, and neither mutation knows
   * which week is on screen.
   */
  dayMarksAll: (userId: string) => ['day-marks', userId] as const,
  /**
   * The picture in each day's cell on the month calendar. Its own key because
   * the week strip wants the dots on every swipe while the calendar wants both
   * once a month, but still under the `day-marks` prefix so a logged meal moves
   * the picture as well as the dots.
   */
  dayPlates: (userId: string, from: string, to: string) =>
    ['day-marks', userId, 'plates', from, to] as const,
  streak: (userId: string) => ['streak', userId] as const,

  /**
   * The parts of one scanned plate.
   *
   * Keyed by entry rather than by user. An ingredient list is only asked for
   * from the screen editing that entry, and every write to it has the id.
   */
  entryIngredients: (entryId: string) => ['entry-ingredients', entryId] as const,

  foodSearch: (userId: string, query: string) => ['food-search', userId, query] as const,
  food: (id: string) => ['food', id] as const,
  /**
   * What this account has eaten before, newest first, one row per dish. Not
   * under the `day` prefix: it reads across every day, so no single day's
   * invalidation fits. The three writes that change it name it explicitly.
   */
  recentFoods: (userId: string) => ['recent-foods', userId] as const,

  /**
   * One shelf of the recipe list: mine, the RiceCal kitchen, or the community,
   * with whatever is in the search field. The shelf is part of the key because
   * the three are different queries with different ordering and visibility.
   */
  recipes: (userId: string, shelf: string, query: string) =>
    ['recipes', userId, shelf, query] as const,
  /**
   * The prefix of all of them, which is what the write side wants. Publishing a
   * recipe moves it off my shelf onto the community's and saving a copy moves
   * one the other way, and neither mutation knows which shelf is on screen.
   */
  recipesAll: (userId: string) => ['recipes', userId] as const,
  /**
   * How many recipes this account owns, which the free tier caps. Under the
   * shelves' prefix so every write that could change the count already moves
   * it; the literal segment cannot collide with a shelf name.
   */
  recipeCount: (userId: string) => ['recipes', userId, 'count'] as const,
  /** One recipe, asked for by id alone. */
  recipe: (id: string) => ['recipe', id] as const,
  recipeIngredients: (recipeId: string) => ['recipe-ingredients', recipeId] as const,

  weighIns: (userId: string) => ['weigh-ins', userId] as const,

  /** The chart columns for one range of the Trends screen. */
  trendSeries: (userId: string, range: string) => ['trends', userId, range, 'series'] as const,
  /** The same range folded to one row: the metric tiles and the footnotes. */
  trendSummary: (userId: string, range: string) => ['trends', userId, range, 'summary'] as const,
  /**
   * The prefix of both, across all three ranges, which is what the write side
   * wants. A logged meal, a glass of water and a weigh-in each move a number on
   * every range, and no mutation knows which one is on screen.
   */
  trendsAll: (userId: string) => ['trends', userId] as const,

  /**
   * Reviews: the finished weeks or months, and the three reads one story makes
   * of a period. `reviewPeriods` is shared between Trends, the list and a
   * story's comparison chart.
   *
   * No `reviewsAll`, unlike every other area here: a review covers a period
   * that has ended, so only a backdated meal can move one, and the
   * thirty-second stale time already covers that.
   */
  reviewPeriods: (userId: string, kind: string) => ['reviews', userId, kind, 'periods'] as const,
  reviewSummary: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'summary'] as const,
  reviewSeries: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'series'] as const,
  reviewMeals: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'meals'] as const,

  /**
   * Movement: the same series and summary pair as Trends, plus the two lists
   * the Activity tab needs, a day's sessions and a day's hours.
   *
   * `activitySessions` takes a nullable date because one query serves both the
   * day's list and the whole history. The null is part of the key so the two
   * cannot overwrite each other.
   */
  activityDay: (userId: string, date: string) => ['activity', userId, 'day', date] as const,
  activityHours: (userId: string, date: string) => ['activity', userId, 'hours', date] as const,
  activitySessions: (userId: string, date: string | null) =>
    ['activity', userId, 'sessions', date ?? 'all'] as const,
  activitySeries: (userId: string, range: string) => ['activity', userId, range, 'series'] as const,
  activitySummary: (userId: string, range: string) =>
    ['activity', userId, range, 'summary'] as const,
  /**
   * The prefix of all of the above, and what the sync invalidates. One pass
   * moves a day, a chart column, a summary tile and possibly a session list,
   * and it does not know which range or date is on screen.
   */
  activityAll: (userId: string) => ['activity', userId] as const,
  /** Keyed by session, since it is only asked for by id. */
  activitySession: (id: string) => ['activity-session', id] as const,
  healthConnection: (userId: string) => ['health-connection', userId] as const,

  photo: (path: string) => ['photo', path] as const,
} as const
