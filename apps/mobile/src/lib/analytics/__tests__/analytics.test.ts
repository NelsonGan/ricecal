import {
  type AnalyticsClient,
  forgetPerson,
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
 * Everything here is about the two things that go wrong quietly. A tracking call
 * that throws is caught by whoever is looking at the screen; one that silently
 * sends nothing, or sends the last account's events under the next account's
 * name, is found months later by somebody reading a chart that has been wrong the
 * whole time.
 *
 * `__DEV__` is true under Jest and `client.ts` does not send in development, so
 * these tests flip it off, which is the only way to exercise the path that ships.
 */

type Recorded = { event: string; props?: Record<string, unknown> }

function fakeClient() {
  const events: Recorded[] = []
  const identified: string[] = []
  const people: Record<string, unknown>[] = []
  /**
   * Which call arrived when, across the two lists above.
   *
   * Mixpanel files a people property against whoever the SDK is identified as
   * at the time, so "the email was sent" and "the email was sent to the right
   * profile" are different assertions and only this one can tell them apart.
   */
  const calls: string[] = []
  let resets = 0

  const client: AnalyticsClient = {
    track: (event, props) => void events.push({ event, props }),
    identify: (id) => {
      calls.push('identify')
      identified.push(id)
    },
    reset: () => {
      resets += 1
    },
    registerSuperProperties: () => {},
    getPeople: () => ({
      set: (props) => {
        calls.push('people')
        people.push(props)
      },
      deleteUser: () => {
        calls.push('people delete')
      },
    }),
  }

  return { client, events, identified, people, calls, resets: () => resets }
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

    identifyUser('user-1', null)
    setPersonProps({ onboarded: true, plan_direction: 'lose' })

    expect(fake.identified).toEqual(['user-1'])
    expect(fake.people).toEqual([{ onboarded: true, plan_direction: 'lose' }])
  })

  /**
   * The address is what makes somebody who writes in findable on the profile
   * their events are on, and RevenueCat is given the same one — so the two
   * dashboards answer the same search.
   *
   * The ORDER is the part worth asserting. A people property is filed against
   * whichever distinct id the SDK is holding when it arrives, so an email sent
   * before the identify lands on the anonymous device profile and the real
   * account stays blank.
   */
  it('puts the account email on the profile, after the identify', () => {
    const fake = fakeClient()
    registerAnalytics(fake.client)

    identifyUser('user-1', 'one@example.com')

    expect(fake.calls).toEqual(['identify', 'people'])
    expect(fake.people).toEqual([{ $email: 'one@example.com' }])
  })

  it('holds that order across the queue, for a launch that beats the SDK', () => {
    // The real window: `initServices` is awaited inside an effect, so a cold
    // start into a restored session identifies before Mixpanel exists.
    identifyUser('user-1', 'one@example.com')

    const fake = fakeClient()
    registerAnalytics(fake.client)

    expect(fake.calls).toEqual(['identify', 'people'])
    expect(fake.people).toEqual([{ $email: 'one@example.com' }])
  })

  it('leaves the property unset when the account has no address', () => {
    // A provider that supplied none. Blank is a worse answer than absent: it
    // would show up in the profile list and in every breakdown as a real value.
    const fake = fakeClient()
    registerAnalytics(fake.client)

    identifyUser('user-1', null)

    expect(fake.people).toEqual([])
  })

  /**
   * The distinct id goes on to RevenueCat, which files the purchase events it
   * forwards here under it. Answering with the id even before the SDK has
   * registered is deliberate: the value is decided by this call, not by the
   * client that eventually drains the queue, and a purchase made in that window
   * still has to land on the same profile as the events around it.
   */
  it('answers with the distinct id a second platform has to agree with', () => {
    expect(identifyUser('user-1', null)).toBe('user-1')

    registerAnalytics(fakeClient().client)
    expect(identifyUser('user-1', null)).toBe('user-1')
  })

  it('answers with nothing in a build that sends nothing', () => {
    // @ts-expect-error — as above: the branch that does not ship is the one
    // every local run takes, and RevenueCat must not claim a Mixpanel identity
    // for somebody Mixpanel has never been told about.
    global.__DEV__ = true

    expect(identifyUser('user-1', null)).toBeNull()
  })

  /**
   * The account-deletion path, and the one ordering in this file that removes
   * rather than records. A people delete is filed against whichever distinct id
   * the SDK is holding, so a reset first would aim it at the anonymous profile
   * the reset had just created and leave the real one — `$email` and all —
   * exactly where it was. `data/auth.ts` is the only caller and keeps this
   * order; this is the assertion that says why it matters.
   */
  it('deletes the profile against the identity it was signed in as', () => {
    const fake = fakeClient()
    registerAnalytics(fake.client)

    identifyUser('user-1', 'one@example.com')
    forgetPerson()
    resetIdentity()

    expect(fake.calls).toEqual(['identify', 'people', 'people delete'])
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
