import {
  ANNOUNCEMENTS,
  type Announcement,
  allAnnouncementIds,
  announcementsNewestFirst,
  announcementToShow,
} from '../announcements'

const older: Announcement = { id: 'older', key: 'feedAutoShare', releaseDate: '2026-01-01' }
const middle: Announcement = { id: 'middle', key: 'feedAutoShare', releaseDate: '2026-05-01' }
const newest: Announcement = { id: 'newest', key: 'feedAutoShare', releaseDate: '2026-09-01' }
const list = [older, newest, middle]

it('orders newest first', () => {
  expect(announcementsNewestFirst(list).map((a) => a.id)).toEqual(['newest', 'middle', 'older'])
})

it('offers only the newest, even to somebody who missed several', () => {
  expect(announcementToShow([], list)?.id).toBe('newest')
  expect(announcementToShow(undefined, list)?.id).toBe('newest')
})

it('offers nothing once the newest is seen, however many older ones are not', () => {
  expect(announcementToShow(['newest'], list)).toBeNull()
})

it('starts a new account having seen every current announcement', () => {
  expect(announcementToShow(allAnnouncementIds(), ANNOUNCEMENTS)).toBeNull()
})

it('never ships two announcements with one id', () => {
  const ids = allAnnouncementIds()
  expect(new Set(ids).size).toBe(ids.length)
})

it('switches auto post on with the feed announcement, and links to its switch', () => {
  const feed = ANNOUNCEMENTS.find((a) => a.id === 'feed_auto_share_2026_10')
  expect(feed?.enables).toEqual({ autoPostFoods: true })
  expect(feed?.cta).toBe('open_settings')
})
