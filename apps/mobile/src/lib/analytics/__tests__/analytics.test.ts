import {
  type AnalyticsClient,
  identifyUser,
  registerAnalytics,
  resetAnalyticsForTest,
  resetIdentity,
  setPersonProps,
  track,
} from '../client'
import { dateOffset, planDirection } from '../props'

/**
 * The seam, and the two derived properties.
 *
 * Everything here is about the two things that can go wrong QUIETLY. A tracking
 * call that throws is caught by whoever is looking at the screen; a tracking
 * call that silently sends nothing, or sends the last account's events under
 * the next account's name, is found months later by somebody reading a chart
 * that has been wrong the whole time.
 *
 * `__DEV__` is true under Jest, and `client.ts` deliberately does not send in
 * development — so these tests flip it off, which is also the only way to
 * exercise the path that ships.
 */

type Recorded = { event: string; props?: Record<string, unknown> }

function fakeClient() {
  const events: Recorded[] = []
  const identified: string[] = []
  const people: Record<string, unknown>[] = []
  let resets = 0

  const client: AnalyticsClient = {
    track: (event, props) => void events.push({ event, props }),
    identify: (id) => void identified.push(id),
    reset: () => {
      resets += 1
    },
    registerSuperProperties: () => {},
    getPeople: () => ({ set: (props) => void people.push(props) }),
  }

  return { client, events, identified, people, resets: () => resets }
}

describe('the analytics seam', () => {
  const wasDev = __DEV__

  beforeEach(() => {
    resetAnalyticsForTest()
    // @ts-expect-error — the global is a boolean the bundler defines, and this
    // is the only way to exercise the branch that actually ships.
    global.__DEV__ = false
  })

  afterEach(() => {
    // @ts-expect-error — see above.
    global.__DEV__ = wasDev
    resetAnalyticsForTest()
  })

  it('does not throw before the SDK has been registered', () => {
    expect(() => track('Signed Out', {})).not.toThrow()
  })

  it('delivers what was fired before startup finished', () => {
    // The real window: `initServices` is awaited inside an effect, so the
    // router has already decided where a launch belongs by the time Mixpanel
    // exists. Dropping these would lose the top of the onboarding funnel.
    track('Onboarding Started', {})
    const fake = fakeClient()
    registerAnalytics(fake.client)

    expect(fake.events).toEqual([{ event: 'Onboarding Started', props: {} }])
  })

  it('stops queueing rather than growing for ever when nothing registers', () => {
    // A build whose token is still on the placeholder never registers anything.
    for (let i = 0; i < 200; i++) track('Signed Out', {})

    const fake = fakeClient()
    registerAnalytics(fake.client)
    expect(fake.events).toHaveLength(50)
  })

  it('drops the queue on sign-out, so one account cannot inherit another events', () => {
    track('Weight Logged', {})
    resetIdentity()

    const fake = fakeClient()
    registerAnalytics(fake.client)

    expect(fake.events).toEqual([])
    expect(fake.resets()).toBe(1)
  })

  it('passes identity and person properties straight through once registered', () => {
    const fake = fakeClient()
    registerAnalytics(fake.client)

    identifyUser('user-1')
    setPersonProps({ onboarded: true, plan_direction: 'lose' })

    expect(fake.identified).toEqual(['user-1'])
    expect(fake.people).toEqual([{ onboarded: true, plan_direction: 'lose' }])
  })
})

describe('dateOffset', () => {
  it('is zero for the day being lived', () => {
    expect(dateOffset('2026-08-15', '2026-08-15')).toBe(0)
  })

  it('counts back, which is what filling in a missed day looks like', () => {
    expect(dateOffset('2026-08-12', '2026-08-15')).toBe(3)
  })

  it('crosses a month boundary without arithmetic of its own', () => {
    expect(dateOffset('2026-07-31', '2026-08-01')).toBe(1)
  })

  /**
   * A day AHEAD is negative rather than clamped. The week strip pages forward,
   * so it is reachable, and a report that folded it into "today" would hide the
   * one case worth noticing.
   */
  it('is negative for a day that has not happened yet', () => {
    expect(dateOffset('2026-08-16', '2026-08-15')).toBe(-1)
  })

  it('answers zero rather than NaN for a date it cannot read', () => {
    expect(dateOffset('not-a-date', '2026-08-15')).toBe(0)
  })
})

describe('planDirection', () => {
  it('reads a lower target as losing', () => {
    expect(planDirection(80, 72)).toBe('lose')
  })

  it('reads a higher target as gaining', () => {
    expect(planDirection(55, 62)).toBe('gain')
  })

  /**
   * The half-kilo band is the point of this function rather than a rounding
   * convenience: a target set within half a kilo of the current weight is
   * somebody asking to stay where they are, and a decimal should not put them
   * in the "losing weight" cohort.
   */
  it('treats a target within half a kilo as maintenance', () => {
    expect(planDirection(70, 70)).toBe('maintain')
    expect(planDirection(70, 69.6)).toBe('maintain')
    expect(planDirection(70, 70.4)).toBe('maintain')
  })

  it('reads no target at all as maintenance', () => {
    expect(planDirection(70, null)).toBe('maintain')
  })
})
