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

  day: (userId: string, date: string) => ['day', userId, date] as const,
  /** Totals for a date range, for the charts and the weekly report. */
  nutrition: (userId: string, from: string, to: string) => ['nutrition', userId, from, to] as const,
  streak: (userId: string) => ['streak', userId] as const,

  foodSearch: (userId: string, query: string) => ['food-search', userId, query] as const,
  food: (id: string) => ['food', id] as const,
  /** The last few dishes logged at one meal. */
  recentFoods: (userId: string, meal: string, limit: number) =>
    ['recent-foods', userId, meal, limit] as const,
  /**
   * The prefix of every one of the above, which is what the write side wants:
   * adding or removing an entry changes this list, and neither mutation is in a
   * position to know which `limit` a screen asked for — or, on a delete, which
   * meal the row was in.
   */
  recentFoodsAll: (userId: string) => ['recent-foods', userId] as const,

  weighIns: (userId: string) => ['weigh-ins', userId] as const,
  photo: (path: string) => ['photo', path] as const,
} as const
