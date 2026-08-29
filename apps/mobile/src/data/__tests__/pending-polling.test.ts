import { needsPolling, type PendingSnap } from '../pending-snaps'

/**
 * Which pending rows make the app go back and ask the day again.
 *
 * The bug this exists for is the one people report as "the notification said my
 * plate was counted, I tapped it, and the row was still spinning — it was fine
 * after I restarted the app". Nothing throws, so it only exists here.
 */

const snap = (over: Partial<PendingSnap> = {}): PendingSnap => ({
  id: 's1',
  logDate: '2026-08-29',
  status: 'analysing',
  loggedAt: '2026-08-29T08:00:00.000Z',
  ...over,
})

it('does not poll for a scan this process is still holding', () => {
  // A request in flight in an app that has stayed awake will call back on its
  // own, and polling the day every six seconds under it is a refetch storm for
  // an answer that is already coming.
  expect(needsPolling([snap()])).toBe(false)
})

it('polls for a scan whose app was suspended while it ran', () => {
  // iOS takes the request down with the process; the edge function writes the
  // entry regardless. Nothing is going to call back, so the day is asked.
  expect(needsPolling([snap({ suspended: true })])).toBe(true)
})

it('polls for a scan restored from storage', () => {
  expect(needsPolling([snap({ status: 'waiting', restored: true })])).toBe(true)
})

it('does not poll for a row that is waiting on the user', () => {
  // Failed, and "there is no food in this photo". Neither is overdue; both are
  // unanswered, and no amount of asking the day changes either.
  expect(needsPolling([snap({ status: 'failed', suspended: true })])).toBe(false)
  expect(needsPolling([snap({ status: 'nofood', suspended: true })])).toBe(false)
})

it('polls when any one row needs it', () => {
  expect(needsPolling([snap({ id: 'a' }), snap({ id: 'b', status: 'waiting' })])).toBe(true)
})

it('does not poll with nothing pending', () => {
  expect(needsPolling([])).toBe(false)
})
