import {
  ANNOUNCEMENTS,
  type Announcement,
  allAnnouncementIds,
  announcementDue,
  announcementsNewestFirst,
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
    ['workouts', 'workouts'],
    ['feedAutoShare', 'edit_profile'],
    ['photoNote', 'personalisation'],
  ])
})
