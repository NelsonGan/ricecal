import type { EventName, Events, PersonProps, SuperProps } from './events'

/**
 * The seam between the app and Mixpanel.
 *
 * NOTHING NATIVE IS IMPORTED HERE, and that is the whole reason this file
 * exists rather than every call site reaching for the SDK. `startup.ts` imports
 * `mixpanel-react-native` at module scope, which jest cannot transform — the
 * same problem that put the RevenueCat lifecycle in a file of its own, and for
 * the same reason (see the header of `lib/revenuecat.ts`). Tracking is fired
 * from the data layer and from a dozen screens, so a native import in this
 * module would drag an untransformable dependency into most of the test suite.
 *
 * So the dependency runs the other way: `startup.ts` builds the instance and
 * hands it here through `registerAnalytics`. This module imports nothing but
 * its own types, every call is safe before registration, and a test that wants
 * to assert on events registers a fake.
 */

/**
 * The slice of Mixpanel's surface this app uses.
 *
 * Written out rather than importing the SDK's own type, because importing the
 * type would import the module. It is checked against the real thing at exactly
 * one place — the `registerAnalytics` call in `startup.ts` — where a mismatch
 * is a compile error.
 */
export type AnalyticsClient = {
  track(event: string, properties?: Record<string, unknown>): void
  identify(distinctId: string): Promise<void> | void
  reset(): void
  registerSuperProperties(properties: Record<string, unknown>): void
  getPeople(): {
    set(properties: Record<string, unknown>): void
    /** See `forgetPerson`. The one call here that removes rather than records. */
    deleteUser(): void
  }
}

let client: AnalyticsClient | null = null

/**
 * Events fired before the SDK finished starting.
 *
 * There IS a window: `initServices` is awaited inside a `useEffect`, so the
 * root layout renders and the router decides where a launch belongs before
 * Mixpanel exists. On a cold start into an unfinished onboarding that is the
 * first two or three events in the funnel, which are the ones the funnel is
 * least able to do without.
 *
 * Capped, because a build with the token still on its placeholder never
 * registers anything and would otherwise grow this list for the life of the
 * process.
 */
const QUEUE_LIMIT = 50
let queue: Array<(target: AnalyticsClient) => void> = []

/**
 * Whether anything is actually sent.
 *
 * Off in development, matching `initSentry` — local taps are not product
 * behaviour, and a debug build pushing them into the same project is how a
 * funnel acquires a cohort of one very confused power user. Dev instead gets
 * the events on the console, which is what makes a new call site verifiable
 * without a dashboard.
 *
 * A function rather than a module constant, so the answer is not frozen at
 * import. `__DEV__` is a literal the bundler substitutes, so this still folds
 * away in a release build; what it buys is a test that can exercise the branch
 * that ships without depending on the order its imports happened to run in.
 */
function sending(): boolean {
  return !__DEV__
}

/**
 * The dev console line, and the one place it is NOT wanted.
 *
 * `__DEV__` is true under Jest, so without this every suite that renders a
 * screen prints a column of `[analytics]` lines around whatever it was actually
 * asserting. Tracking is fired from the data layer and from a dozen components,
 * so that is most of them.
 *
 * A `NODE_ENV` check rather than a global mock in `jest.setup.js`, because the
 * seam's own tests are about what it does with these calls and a mock would
 * replace the thing under test.
 */
function trace(label: string, properties?: unknown): void {
  if (!__DEV__ || process.env.NODE_ENV === 'test') return
  // Stringified rather than passed as an object. Both the Metro console and the
  // remote log readers collapse a plain object to "Object", which turns the one
  // line that was supposed to make a new call site verifiable into a line that
  // only proves it fired.
  console.log(`[analytics] ${label}`, properties === undefined ? '' : JSON.stringify(properties))
}

function enqueue(work: (target: AnalyticsClient) => void) {
  if (client) {
    work(client)
    return
  }
  if (queue.length >= QUEUE_LIMIT) return
  queue.push(work)
}

/**
 * Hand over the live SDK, and drain whatever was fired before it arrived.
 *
 * Called once, from `startup.ts`. Calling it again replaces the client, which
 * is what a test does between cases.
 */
export function registerAnalytics(next: AnalyticsClient | null): void {
  client = next
  if (!next) return
  const pending = queue
  queue = []
  for (const work of pending) work(next)
}

/** For tests, and for a sign-out that should not carry a queue across accounts. */
export function resetAnalyticsForTest(): void {
  client = null
  queue = []
}

/**
 * Record something the user did.
 *
 * The props argument is required rather than optional, even for the events that
 * carry none — `track('Signed Out', {})`. An optional argument would make a
 * forgotten property object typecheck as a valid event with no properties,
 * which is the one mistake in here that produces a chart rather than an error.
 */
export function track<E extends EventName>(event: E, properties: Events[E]): void {
  trace(event, properties)
  if (!sending()) return
  enqueue((target) => target.track(event, properties))
}

/**
 * Tie everything from here on to an account.
 *
 * Idempotent by design: the session provider calls this once per process for
 * whoever is signed in, including on a cold start with a restored session,
 * which is the launch where nothing else would have named them.
 *
 * RETURNS THE DISTINCT ID, because a second platform needs it. RevenueCat files
 * the purchase events it forwards to Mixpanel under a `$mixpanelDistinctId`
 * attribute, and the two have to agree or a subscription lands on a profile
 * with no behaviour on it while the behaviour sits on a profile that never
 * bought anything. This is the only place that knows both what was registered
 * and whether anything was sent at all, so it is the place that answers —
 * `null` in development and in a build whose token is still a placeholder,
 * where Mixpanel knows nobody by any name.
 *
 * THE EMAIL IS SET HERE AND NOWHERE ELSE, for the reason the distinct id is
 * returned here: this is the moment the app knows which account it is looking
 * at, and the address is a fact about that account rather than about anything a
 * screen is doing. It goes on the profile AFTER the identify, because a people
 * property is filed against whichever distinct id the SDK is holding when it is
 * sent — the same ordering `identifyPurchaser` keeps for the same reason, and
 * the queue preserves it whether or not the SDK has registered yet.
 */
export function identifyUser(userId: string, email: string | null): string | null {
  if (!sending()) {
    trace('identify', userId)
    return null
  }
  enqueue((target) => void target.identify(userId))
  // Only when there IS one. A provider that supplied no address leaves the
  // property unset rather than blank — see `$email` in `events.ts`. An address
  // that later appears or changes arrives here as an ordinary re-identify,
  // because the session provider keys on the pair rather than on the id alone.
  if (email) enqueue((target) => target.getPeople().set({ $email: email }))
  return userId
}

/**
 * Forget them.
 *
 * The queue goes too. Anything still waiting was fired by the account that has
 * just left, and draining it after a reset would file it under the next person
 * to sign in on this handset.
 */
export function resetIdentity(): void {
  queue = []
  if (!sending()) {
    trace('reset')
    return
  }
  enqueue((target) => target.reset())
}

/**
 * Delete the profile Mixpanel holds for whoever is currently identified.
 *
 * Only ever called from the account-deletion path, and it is the reason
 * `deleteUser` is on the seam at all. `$email` is the one thing in this whole
 * plan that names a person (see the note in the README), and it lives on the
 * people profile, so an account deleted everywhere else and left here would
 * leave the address behind in the one place a search by address would find it.
 *
 * IT MUST RUN BEFORE `resetIdentity`. The delete is filed against whichever
 * distinct id the SDK is holding, so a reset first would aim it at the fresh
 * anonymous profile the reset just created and leave the real one untouched.
 *
 * What it does not remove is the events themselves. Those carry no diary and no
 * address — see the rules the plan was written against — and Mixpanel offers no
 * client-side way to withdraw them. `ricecal.app/data-deletion` says so.
 */
export function forgetPerson(): void {
  trace('person delete')
  if (!sending()) return
  enqueue((target) => target.getPeople().deleteUser())
}

/** Facts about the person, for segmenting. See `PersonProps` for what is allowed. */
export function setPersonProps(properties: PersonProps): void {
  trace('person', properties)
  if (!sending()) return
  enqueue((target) => target.getPeople().set(properties))
}

/** Stamped on every event from here on. One property, and `SuperProps` says why. */
export function setSuperProps(properties: Partial<SuperProps>): void {
  if (!sending()) return
  enqueue((target) => target.registerSuperProperties(properties))
}
