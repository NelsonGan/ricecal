import { type onlineManager as OnlineManager, type Query, QueryClient } from '@tanstack/react-query'

// Loaded afresh for each test: the rule remembers the newest answer it has
// seen, which in the app is one cache for the life of the process.
let shouldPersistQuery: (query: Query) => boolean
// The rule's own copy, which the isolated load gives it.
let onlineManager: typeof OnlineManager
beforeEach(() => {
  jest.isolateModules(() => {
    shouldPersistQuery = require('../query').shouldPersistQuery
    onlineManager = require('@tanstack/react-query').onlineManager
  })
})

/**
 * What the query cache writes to disk.
 *
 * The snapshot is serialised whole every time a query changes and parsed whole
 * before the first query runs at launch, so what is in it is paid for on the
 * JS thread at both ends. Nothing here throws when it grows: six searches made
 * it 1.2 MB, and the only symptom is an app that gets slower the longer it is
 * used.
 */

const DAY = 24 * 60 * 60_000

/**
 * The cache as it stands after each key was answered `daysAgo` days ago.
 *
 * `networkMode` stands in for how the query is declared: the app's default is
 * `online`, and the few that can answer with no connection say otherwise.
 */
function cached(
  entries: Array<
    [key: readonly unknown[], daysAgo?: number, networkMode?: 'online' | 'always' | 'offlineFirst']
  >,
) {
  const client = new QueryClient()
  const now = Date.now()
  for (const [key, daysAgo = 0, networkMode] of entries) {
    if (networkMode) client.setQueryDefaults(key, { networkMode })
    client.setQueryData(key, { some: 'answer' }, { updatedAt: now - daysAgo * DAY })
  }
  const kept = () =>
    client
      .getQueryCache()
      .getAll()
      .filter((query) => shouldPersistQuery(query))
      .map((query) => query.queryKey.join('/'))
  // Twice: the newest answer is a running maximum, exact from the second pass.
  kept()
  const result = kept()
  client.clear()
  return result
}

it('keeps the diary, and leaves out what was typed into a search box', () => {
  expect(
    cached([
      [['day', 'user', '2026-11-10']],
      [['recent-foods', 'user']],
      [['food-search', 'user', 'n']],
      [['food-search', 'user', 'nasi']],
      [['food-search', 'user', 'nasi lemak']],
    ]),
  ).toEqual(['day/user/2026-11-10', 'recent-foods/user'])
})

it('keeps the recipe shelves and their count, but not a search of them', () => {
  expect(
    cached([
      [['recipes', 'user', 'mine', '']],
      [['recipes', 'user', 'count']],
      [['recipes', 'user', 'community', 'rendang']],
    ]),
  ).toEqual(['recipes/user/mine/', 'recipes/user/count'])
})

it('still leaves out photos, social reads and other people in a group', () => {
  expect(
    cached([
      [['photo', 'meals/a.jpg', 'visible']],
      [['social', 'user', 'social_feed', {}]],
      [['groups', 'user', 'group_board', {}]],
      [['groups', 'user', 'my_groups', {}]],
      [['groups', 'user', 'group_invite_count', {}]],
    ]),
  ).toEqual([
    'groups/user/my_groups/[object Object]',
    'groups/user/group_invite_count/[object Object]',
  ])
})

it('stops saving a day nobody has looked at for a week', () => {
  expect(
    cached([
      [['day', 'user', '2026-11-10'], 0],
      [['day', 'user', '2026-11-05'], 5],
      [['day', 'user', '2026-10-20'], 21],
      [['food', 'some-dish'], 9],
    ]),
  ).toEqual(['day/user/2026-11-10', 'day/user/2026-11-05'])
})

it('measures the week from the newest answer, so a fortnight offline keeps the last diary', () => {
  // Nothing has been fetched for fourteen days. Measured from now, every one of
  // these would be dropped and an offline launch would have nothing to draw.
  expect(
    cached([
      [['profile', 'user'], 14],
      [['day', 'user', '2026-10-27'], 14],
      [['day', 'user', '2026-10-24'], 17],
      [['day', 'user', '2026-10-10'], 31],
    ]),
  ).toEqual(['profile/user', 'day/user/2026-10-27', 'day/user/2026-10-24'])
})

it('keeps the last diary through a week offline, though the store still answers', () => {
  // The store's entitlement comes out of RevenueCat's own cache, so it is
  // answered afresh at every launch with no connection. It says nothing about
  // how old the diary is, and must not push the diary off the disk.
  expect(
    cached([
      [['profile', 'user'], 9],
      [['day', 'user', '2026-11-01'], 9],
      [['store-entitlement', 'user'], 0, 'always'],
    ]),
  ).toEqual(['profile/user', 'day/user/2026-11-01', 'store-entitlement/user'])
})

it('keeps the last diary through a week offline, though a photo was read from disk', () => {
  // A photo is never saved here, and is answered from the phone's own disk.
  expect(
    cached([
      [['profile', 'user'], 9],
      [['day', 'user', '2026-11-01'], 9],
      [['photo', 'meals/a.jpg', 'visible'], 0, 'offlineFirst'],
    ]),
  ).toEqual(['profile/user', 'day/user/2026-11-01'])
})

it('keeps the last diary through a week offline, though a tap patched the day', () => {
  // A drink or a settings toggle patches its query at once and its write
  // waits for a connection, so the patch is stamped now with nothing behind it.
  onlineManager.setOnline(false)
  try {
    expect(
      cached([
        [['profile', 'user'], 9],
        [['day', 'user', '2026-11-01'], 9],
        [['day', 'user', '2026-11-10'], 0],
      ]),
    ).toEqual(['profile/user', 'day/user/2026-11-01', 'day/user/2026-11-10'])
  } finally {
    onlineManager.setOnline(true)
  }
})

it('still counts a feed or a search as the newest answer, though neither is saved', () => {
  // Both need the server, so they say how old the rest are.
  expect(
    cached([
      [['social', 'user', 'social_feed', {}], 0],
      [['day', 'user', '2026-11-01'], 9],
    ]),
  ).toEqual([])
})

it('is not thrown by an answer stamped while the clock was set ahead', () => {
  // A month ahead, then put back. Measured from that answer, everything
  // fetched at the real time would look a month old and stop being saved.
  expect(
    cached([
      [['streak', 'user'], -30],
      [['profile', 'user'], 0],
      [['day', 'user', '2026-11-10'], 2],
      [['day', 'user', '2026-10-20'], 21],
    ]),
  ).toEqual(['streak/user', 'profile/user', 'day/user/2026-11-10'])
})

it('never saves a query that failed', async () => {
  const client = new QueryClient()
  const key = ['day', 'user', '2026-11-10']
  await client
    .fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('no')), retry: false })
    .catch(() => {})
  const [query] = client.getQueryCache().findAll({ queryKey: key })
  expect(query.state.status).toBe('error')
  expect(shouldPersistQuery(query)).toBe(false)
  client.clear()
})
