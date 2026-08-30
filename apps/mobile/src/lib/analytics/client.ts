import type { EventName, Events, PersonProps, SuperProps } from './events'

/**
 * The seam between the app and Mixpanel.
 *
 * Nothing native is imported here. `mixpanel-react-native` cannot be
 * transformed by jest (the same problem that put the RevenueCat lifecycle in
 * its own file), and tracking is fired from the data layer and a dozen screens,
 * so a native import here would reach most of the test suite.
 *
 * So the dependency runs the other way: `startup.ts` builds the instance and
 * hands it over through `registerAnalytics`. Every call is safe before
 * registration, and a test registers a fake.
 */

/**
 * The slice of Mixpanel's surface this app uses. Written out rather than
 * imported, because importing the type imports the module. It is checked
 * against the real thing at the `registerAnalytics` call in `startup.ts`.
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
 * Events fired before the SDK finished starting. `initServices` is awaited
 * inside a `useEffect`, so the router decides where a launch belongs before
 * Mixpanel exists, which on a cold start into onboarding is the first few
 * events in the funnel.
 *
 * Capped, because a build whose token is still a placeholder never registers
 * anything and would grow this list for the life of the process.
 */
const QUEUE_LIMIT = 50
let queue: Array<(target: AnalyticsClient) => void> = []

/**
 * Whether anything is actually sent. Off in development, matching `initSentry`:
 * local taps are not product behaviour. Dev gets the events on the console
 * instead, which is what makes a new call site verifiable without a dashboard.
 *
 * A function rather than a constant, so the answer is not frozen at import.
 * `__DEV__` is a bundler literal so this still folds away in release; what it
 * buys is a test that can exercise the shipping branch.
 */
function sending(): boolean {
  return !__DEV__
}

/**
 * The dev console line. `__DEV__` is true under Jest, so without the second
 * check every suite that renders a screen prints a column of `[analytics]`
 * lines. A `NODE_ENV` check rather than a global mock, because this seam's own
 * tests are about what it does with these calls.
 */
function trace(label: string, properties?: unknown): void {
  if (!__DEV__ || process.env.NODE_ENV === 'test') return
  // Stringified: the Metro console and the remote log readers both collapse a
  // plain object to "Object".
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
 * Tie everything from here on to an account. Idempotent: the session provider
 * calls it once per process, including on a cold start with a restored session.
 *
 * Returns the distinct id because RevenueCat files the purchase events it
 * forwards to Mixpanel under `$mixpanelDistinctId`, and the two have to agree or
 * a subscription lands on a profile with no behaviour on it. `null` in
 * development and on a placeholder token, where Mixpanel knows nobody.
 *
 * The email is set here and nowhere else, since this is the moment the app
 * knows which account it is looking at. It goes on the profile after the
 * identify, because a people property is filed against whichever distinct id
 * the SDK is holding; the queue preserves that order.
 */
export function identifyUser(userId: string, email: string | null): string | null {
  if (!sending()) {
    trace('identify', userId)
    return null
  }
  enqueue((target) => void target.identify(userId))
  // A provider that supplied no address leaves the property unset rather than
  // blank. An address that later appears arrives as an ordinary re-identify,
  // because the session provider keys on the pair rather than the id alone.
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
 * Delete the profile Mixpanel holds for whoever is currently identified. Called
 * only from the account-deletion path. `$email` is the one thing in the plan
 * that names a person and it lives on the people profile, so an account deleted
 * everywhere else would leave the address in the one place a search by address
 * finds it.
 *
 * It must run before `resetIdentity`: the delete is filed against whichever
 * distinct id the SDK holds, and a reset first would aim it at the fresh
 * anonymous profile.
 *
 * The events themselves stay. They carry no diary and no address, and Mixpanel
 * offers no client-side way to withdraw them. `ricecal.app/data-deletion` says
 * so.
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
