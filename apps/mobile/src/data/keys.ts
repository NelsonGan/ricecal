/**
 * Every query key in the app.
 *
 * One file so that a mutation invalidating "the day" cannot spell it a
 * different way from the query that reads it — the failure mode there is a
 * screen that silently does not refresh, which looks like a caching bug and is
 * really a typo.
 *
 * Keys are user-scoped even though RLS already scopes the data. The cache is
 * cleared on sign-in and sign-out, but a key that names its user is also a key
 * that cannot be read by the wrong account if that clearing ever regresses.
 */
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  settings: (userId: string) => ['settings', userId] as const,
  mealTimes: (userId: string) => ['meal-times', userId] as const,
  goals: (userId: string) => ['goals', userId] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
  /**
   * How many of today's scans are left.
   *
   * Keyed by user and not by date. The date it is about is the USER's own, and
   * only the server knows which one that is — a key carrying the phone's idea
   * of today would go stale at the wrong midnight for anybody who has flown
   * anywhere. Every scan invalidates it, and so does a foreground.
   */
  scanQuota: (userId: string) => ['scan-quota', userId] as const,
  /**
   * What each plan costs, as the STORE reports it.
   *
   * Not keyed by user: the price is a property of the device's storefront, not
   * of who is signed in. Refetched rarely — a price change is a store-side
   * event measured in days.
   */
  planPrices: () => ['plan-prices'] as const,

  day: (userId: string, date: string) => ['day', userId, date] as const,
  /**
   * Every day of this account.
   *
   * The prefix exists for the health sync, which is the one writer that changes
   * a figure on a day it cannot name: a watch backfilling Tuesday moves
   * Tuesday's budget, and the pass that wrote it has a window rather than a
   * date on screen.
   */
  dayAll: (userId: string) => ['day', userId] as const,
  /** Totals for a date range, for the charts and the weekly report. */
  nutrition: (userId: string, from: string, to: string) => ['nutrition', userId, from, to] as const,
  /** One week of dots under the strip on Today: eaten, goal and movement per day. */
  dayMarks: (userId: string, from: string, to: string) => ['day-marks', userId, from, to] as const,
  /**
   * Every week of them. What the write side wants: a logged meal moves one
   * day's dot and a health sync moves seven, and neither mutation is in a
   * position to know which week is on screen.
   */
  dayMarksAll: (userId: string) => ['day-marks', userId] as const,
  streak: (userId: string) => ['streak', userId] as const,

  /**
   * The parts of one scanned plate.
   *
   * Keyed by entry rather than by user: an ingredient list is only ever asked
   * for from the screen editing that one entry, and every write to it — a
   * portion, a removal, a correction applied on the server — has the id in
   * hand.
   */
  entryIngredients: (entryId: string) => ['entry-ingredients', entryId] as const,

  foodSearch: (userId: string, query: string) => ['food-search', userId, query] as const,
  food: (id: string) => ['food', id] as const,

  /**
   * One shelf of the recipe list: mine, the RiceCal kitchen, or the community,
   * with whatever is in the search field.
   *
   * The shelf is part of the key rather than a filter over one cached list,
   * because the three are three different queries — different ordering,
   * different visibility rule — and folding them together would mean a write to
   * my own recipe invalidating the kitchen's.
   */
  recipes: (userId: string, shelf: string, query: string) =>
    ['recipes', userId, shelf, query] as const,
  /**
   * The prefix of all of them, which is what the write side wants. Publishing a
   * recipe moves it off my shelf and onto the community's, and saving a copy
   * moves one the other way — neither mutation knows which shelf or which
   * search is on screen.
   */
  recipesAll: (userId: string) => ['recipes', userId] as const,
  /**
   * How many recipes this account owns, which is the free tier's ceiling.
   *
   * Under the same prefix as the shelves ON PURPOSE: every write that could
   * change the count already invalidates `recipesAll`, so a new recipe, a
   * deleted one and a saved copy all move this without any of them being told
   * about it. Keyed with a literal segment rather than a shelf name, which no
   * shelf can collide with.
   */
  recipeCount: (userId: string) => ['recipes', userId, 'count'] as const,
  /** One recipe. Keyed by id alone: only ever asked for by id. */
  recipe: (id: string) => ['recipe', id] as const,
  recipeIngredients: (recipeId: string) => ['recipe-ingredients', recipeId] as const,

  weighIns: (userId: string) => ['weigh-ins', userId] as const,

  /** The chart columns for one range of the Trends screen. */
  trendSeries: (userId: string, range: string) => ['trends', userId, range, 'series'] as const,
  /** The same range folded to one row: the metric tiles and the footnotes. */
  trendSummary: (userId: string, range: string) => ['trends', userId, range, 'summary'] as const,
  /**
   * The prefix of both, across all three ranges — which is what the write side
   * wants. A logged meal, a glass of water and a weigh-in each move a number on
   * every range, and no mutation is in a position to know which one is on
   * screen.
   */
  trendsAll: (userId: string) => ['trends', userId] as const,

  /**
   * Reviews. The list of finished weeks or months, and the three reads one
   * story makes of a single period.
   *
   * `reviewPeriods` is shared deliberately: Trends asks it whether there is
   * anything to review, the list draws from it, and a story reads the same rows
   * as its comparison chart. Three screens, one entry.
   *
   * There is NO `reviewsAll`, unlike every other area in this file, and that is
   * a decision rather than an omission. A review is of a period that has ENDED,
   * so nothing logged today can move one. The only write that can is a meal
   * backdated into a finished week, and the default thirty-second stale time
   * already covers it — the review refetches the next time it is opened. A
   * prefix here would mean a line in a dozen mutations for a case that repairs
   * itself.
   */
  reviewPeriods: (userId: string, kind: string) => ['reviews', userId, kind, 'periods'] as const,
  reviewSummary: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'summary'] as const,
  reviewSeries: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'series'] as const,
  reviewMeals: (userId: string, kind: string, start: string) =>
    ['reviews', userId, kind, start, 'meals'] as const,

  /**
   * Movement. The same series/summary pair as Trends, plus the two lists the
   * Activity tab needs — a day's sessions, and a day's hours.
   *
   * `activitySessions` takes a nullable date because one query serves both the
   * day's list and the whole history; the null is part of the key so the two
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
   * The prefix of all of the above. What the sync invalidates: one pass moves
   * a day, a chart column, a summary tile and possibly a session list, and it
   * is in no position to know which range or which date is on screen.
   */
  activityAll: (userId: string) => ['activity', userId] as const,
  /** Keyed by session rather than by user: only ever asked for by id. */
  activitySession: (id: string) => ['activity-session', id] as const,
  healthConnection: (userId: string) => ['health-connection', userId] as const,

  photo: (path: string) => ['photo', path] as const,
} as const
