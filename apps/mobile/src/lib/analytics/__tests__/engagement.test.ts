import { type AnalyticsClient, registerAnalytics, resetAnalyticsForTest } from '../client'
import {
  claimDailyOpen,
  daysBetween,
  localDay,
  parseEngagement,
  recordAppOpen,
} from '../engagement'

/**
 * Installs and active days. The two ways this goes wrong quietly are counting a
 * day twice (DAU inflates with every trip to the home screen) and counting an
 * update as an install (every existing user "installs" again on the build that
 * added the event).
 */

function memoryStorage(initial?: string) {
  let value = initial
  return {
    read: () => value,
    write: (next: string) => {
      value = next
    },
  }
}

function fakeClient() {
  const events: { event: string; props?: Record<string, unknown> }[] = []
  const client: AnalyticsClient = {
    track: (event, props) => void events.push({ event, props }),
    identify: () => {},
    reset: () => {},
    registerSuperProperties: () => {},
    getPeople: () => ({ set: () => {}, deleteUser: () => {} }),
  }
  return { client, events }
}

describe('engagement events', () => {
  const wasDev = __DEV__

  beforeEach(() => {
    resetAnalyticsForTest()
    // @ts-expect-error — the bundler's global; this exercises the shipping branch.
    global.__DEV__ = false
  })

  afterEach(() => {
    // @ts-expect-error — see above.
    global.__DEV__ = wasDev
    resetAnalyticsForTest()
  })

  it('counts calendar days in the phone time zone', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('claims a day once, and reports the gap since the last one', () => {
    const first = claimDailyOpen(parseEngagement(undefined), '2026-10-10')
    expect(first?.properties).toEqual({ active_days: 1, days_since_last_open: null })
    if (!first) throw new Error('expected a claim')
    expect(claimDailyOpen(first.next, '2026-10-10')).toBeNull()
    expect(claimDailyOpen(first.next, '2026-10-13')?.properties).toEqual({
      active_days: 2,
      days_since_last_open: 3,
    })
  })

  it('reads damaged state as empty rather than throwing', () => {
    expect(parseEngagement('{not json')).toEqual({ lastDay: null, activeDays: 0 })
    expect(parseEngagement('{"lastDay":"yesterday","activeDays":-4}')).toEqual({
      lastDay: null,
      activeDays: 0,
    })
  })

  it('sends First App Open once on a fresh install, then one Daily App Open a day', () => {
    const fake = fakeClient()
    registerAnalytics(fake.client)
    const storage = memoryStorage()
    const now = new Date(2026, 9, 12, 9)

    recordAppOpen(storage, { freshInstall: true, now })
    recordAppOpen(storage, { freshInstall: true, now: new Date(2026, 9, 12, 21) })
    recordAppOpen(storage, { freshInstall: false, now: new Date(2026, 9, 13, 8) })

    expect(fake.events).toEqual([
      { event: 'First App Open', props: {} },
      { event: 'Daily App Open', props: { active_days: 1, days_since_last_open: null } },
      { event: 'Daily App Open', props: { active_days: 2, days_since_last_open: 1 } },
    ])
  })

  it('never calls an updating install a new one', () => {
    const fake = fakeClient()
    registerAnalytics(fake.client)

    recordAppOpen(memoryStorage(), { freshInstall: false, now: new Date(2026, 9, 12) })

    expect(fake.events.map((e) => e.event)).toEqual(['Daily App Open'])
  })
})
