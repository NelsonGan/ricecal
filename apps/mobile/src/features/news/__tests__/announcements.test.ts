import {
  ANNOUNCEMENTS,
  type Announcement,
  allAnnouncementIds,
  announcementDue,
  announcementsNewestFirst,
  withMissed,
} from '../announcements'

const pages: Announcement['pages'] = [{ key: 'workouts' }]
const older: Announcement = { id: 'older', key: 'update110', releaseDate: '2026-01-01', pages }
const middle: Announcement = { id: 'middle', key: 'update110', releaseDate: '2026-05-01', pages }
const newest: Announcement = { id: 'newest', key: 'update110', releaseDate: '2026-09-01', pages }
const onboarded = (seen?: string[]) => ({
  onboarded_at: '2026-01-01T00:00:00Z',
  seen_announcements: seen,
})

it('orders newest first', () => {
  expect(announcementsNewestFirst([older, newest, middle]).map((a) => a.id)).toEqual([
    'newest',
    'middle',
    'older',
  ])
})

it('offers only the newest, even to somebody who missed several', () => {
  expect(announcementDue(onboarded([]), newest)?.id).toBe('newest')
  // A profile cached by a build from before the column still gets the card.
  expect(announcementDue(onboarded(undefined), newest)?.id).toBe('newest')
})

it('offers nothing once the newest is seen, however many older ones are not', () => {
  expect(announcementDue(onboarded(['newest']), newest)).toBeNull()
})

it('offers nothing to a profile that is not loaded or not finished', () => {
  expect(announcementDue(undefined, newest)).toBeNull()
  expect(announcementDue({ onboarded_at: null, seen_announcements: [] }, newest)).toBeNull()
})

it('starts a new account having seen every current announcement', () => {
  expect(announcementDue(onboarded(allAnnouncementIds()))).toBeNull()
})

it('ships ids the server accepts, each once', () => {
  const ids = allAnnouncementIds()
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) expect(id).toMatch(/^[a-z0-9_]{1,64}$/)
})

it('switches auto post on with the 1.1.0 announcement, whose feed page links to its switch', () => {
  const update = ANNOUNCEMENTS.find((a) => a.id === 'feed_auto_share_2026_10')
  expect(update?.enables).toEqual({ autoPostFoods: true })
  expect(update?.pages.map((page) => [page.key, page.cta])).toEqual([
    ['workouts', undefined],
    ['feedAutoShare', 'edit_profile'],
    ['photoNote', 'personalisation'],
  ])
})

it('folds the 1.1.0 card into the Groups card only for an account that missed it', () => {
  const groups = ANNOUNCEMENTS.find((a) => a.id === 'groups_2026_10')
  if (!groups) throw new Error('groups')
  const missed = withMissed(groups, [])
  expect(missed.pages.map((page) => page.key)).toEqual([
    'groupsBoard',
    'groupsChat',
    'workouts',
    'feedAutoShare',
    'photoNote',
  ])
  expect(missed.claims).toEqual([
    { id: 'groups_2026_10', enables: undefined },
    { id: 'feed_auto_share_2026_10', enables: { autoPostFoods: true } },
  ])
  const seen = withMissed(groups, ['feed_auto_share_2026_10'])
  expect(seen.pages.map((page) => page.key)).toEqual(['groupsBoard', 'groupsChat'])
  expect(seen.claims).toEqual([{ id: 'groups_2026_10', enables: undefined }])
  // Unknown profile: nothing folded, nothing switched.
  expect(withMissed(groups, undefined).claims).toHaveLength(1)
})

it('makes the 1.3.0 card the newest, with its four pages and their buttons', () => {
  expect(announcementDue(onboarded(['groups_2026_10', 'feed_auto_share_2026_10']))?.id).toBe(
    'update_1_3_0_2026_11',
  )
  const update = ANNOUNCEMENTS.find((a) => a.id === 'update_1_3_0_2026_11')
  expect(update?.enables).toBeUndefined()
  expect(update?.pages.map((page) => [page.key, page.cta])).toEqual([
    ['recipeImport', 'recipes'],
    ['socialTab', 'social'],
    ['mealPlaces', 'locations'],
    ['kitchenUnits', undefined],
  ])
})

it('carries the 1.1.0 switch to an account that missed it, and not the Groups pages', () => {
  const update = ANNOUNCEMENTS.find((a) => a.id === 'update_1_3_0_2026_11')
  if (!update) throw new Error('update')
  // Never saw either older card: the 1.1.0 pages follow, and its switch with them.
  const missed = withMissed(update, [])
  expect(missed.pages.map((page) => page.key)).toEqual([
    'recipeImport',
    'socialTab',
    'mealPlaces',
    'kitchenUnits',
    'workouts',
    'feedAutoShare',
    'photoNote',
  ])
  expect(missed.claims).toEqual([
    { id: 'update_1_3_0_2026_11', enables: undefined },
    { id: 'feed_auto_share_2026_10', enables: { autoPostFoods: true } },
  ])
  // Saw 1.1.0 but not Groups: only its own pages, and nothing switched.
  const seen = withMissed(update, ['feed_auto_share_2026_10'])
  expect(seen.pages).toHaveLength(4)
  expect(seen.claims).toEqual([{ id: 'update_1_3_0_2026_11', enables: undefined }])
})
