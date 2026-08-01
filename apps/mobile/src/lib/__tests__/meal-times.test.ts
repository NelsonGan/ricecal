import { parseTime } from '@/lib/meal-times'

/**
 * Reading a Postgres `time` into the hour and minute a calendar trigger wants.
 *
 * Small, and worth pinning anyway: every meal reminder in the app is scheduled
 * from this, and getting it wrong fires them all at midnight rather than
 * failing where anyone would notice.
 *
 * `isQuiet` was tested here too, until the quiet-hours filter came out — it
 * dropped reminders the user had asked for, against a window nothing in the
 * app could edit.
 */
describe('parseTime', () => {
  it('reads a time with seconds, which is how the column stores it', () => {
    expect(parseTime('08:00:00')).toEqual({ hour: 8, minute: 0 })
    expect(parseTime('22:30:00')).toEqual({ hour: 22, minute: 30 })
  })

  it('reads one without them', () => {
    expect(parseTime('07:45')).toEqual({ hour: 7, minute: 45 })
  })

  // Midnight is 0, not falsy-to-be-defaulted: the fallbacks in this function
  // are for a missing field, and "00" is a field that is there.
  it('reads midnight as zero rather than as nothing', () => {
    expect(parseTime('00:00:00')).toEqual({ hour: 0, minute: 0 })
  })
})
