import { unclaimedSnaps } from '../day'
import type { EntrySource, EntryStatus } from '../types'

/**
 * Which pending rows survive a refetch.
 *
 * Every failure this rule has had looks like a caching bug from the outside: a
 * meal on the day twice, or an error message sitting above the meal it says
 * could not be read. None of them throw, so they only exist here.
 */

const entry = (id: string, source: EntrySource, at: string) => ({ id, source, loggedAt: at })
const snap = (over: Partial<{ loggedAt: string; text: string; status: EntryStatus }> = {}) => ({
  loggedAt: '2026-08-06T12:00:00.000Z',
  status: 'analysing' as EntryStatus,
  ...over,
})

it('drops a snap whose entry has landed', () => {
  const snaps = [snap()]
  expect(unclaimedSnaps(snaps, [entry('e1', 'camera', '2026-08-06T12:00:20.000Z')])).toEqual([])
})

it('keeps a snap whose entry has not landed yet', () => {
  const snaps = [snap()]
  expect(unclaimedSnaps(snaps, [])).toEqual(snaps)
})

it('drops a FAILED snap whose entry landed anyway', () => {
  // The 60s request timeout. The scan carried on, the row said it could not be
  // read, and the meal arrived five seconds later — the user had both.
  const snaps = [snap({ status: 'failed' })]
  expect(unclaimedSnaps(snaps, [entry('e1', 'camera', '2026-08-06T12:01:05.000Z')])).toEqual([])
})

it('drops a WAITING snap whose entry landed while the app was away', () => {
  const snaps = [snap({ status: 'waiting' })]
  expect(unclaimedSnaps(snaps, [entry('e1', 'camera', '2026-08-06T12:02:00.000Z')])).toEqual([])
})

it("never lets a 'no food' row claim somebody else's meal", () => {
  // Nothing was written for it, so any entry it matched would belong to another
  // scan — and claiming one would delete the user's answer and hide that meal.
  const snaps = [snap({ status: 'nofood' })]
  expect(unclaimedSnaps(snaps, [entry('e1', 'camera', '2026-08-06T12:00:30.000Z')])).toEqual(snaps)
})

it('matches a typed meal against a typed entry, not a photographed one', () => {
  const typed = [snap({ text: 'nasi lemak' })]
  expect(unclaimedSnaps(typed, [entry('e1', 'camera', '2026-08-06T12:00:30.000Z')])).toEqual(typed)
  expect(unclaimedSnaps(typed, [entry('e2', 'text', '2026-08-06T12:00:30.000Z')])).toEqual([])
})

it('ignores an entry logged before the shutter', () => {
  const snaps = [snap()]
  const earlier = [entry('e1', 'camera', '2026-08-06T11:59:00.000Z')]
  expect(unclaimedSnaps(snaps, earlier)).toEqual(snaps)
})

it('gives one entry to one snap', () => {
  // Two plates photographed in a row and one answer back so far: the second
  // row keeps its spinner rather than both rows claiming the same meal.
  const snaps = [
    snap({ loggedAt: '2026-08-06T12:00:00.000Z' }),
    snap({ loggedAt: '2026-08-06T12:00:05.000Z' }),
  ]
  const landed = unclaimedSnaps(snaps, [entry('e1', 'camera', '2026-08-06T12:00:30.000Z')])
  expect(landed).toHaveLength(1)
  expect(landed[0].loggedAt).toBe('2026-08-06T12:00:05.000Z')
})

it('ignores an entry logged by hand while a scan is out', () => {
  // A search or a quick-add writes `search`, and claiming it would take the
  // spinner off a scan that has not answered.
  const snaps = [snap()]
  expect(unclaimedSnaps(snaps, [entry('e1', 'search', '2026-08-06T12:00:30.000Z')])).toEqual(snaps)
})
