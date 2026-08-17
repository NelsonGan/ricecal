import { Platform } from 'react-native'

import { env, isConfigured } from './env'

/**
 * The RevenueCat SDK's lifecycle: configure it, tell it who is signed in, and
 * forget them on the way out.
 *
 * ITS OWN FILE rather than a corner of `startup.ts`, because `session.tsx`
 * needs the identify half and `startup.ts` imports Mixpanel at module scope —
 * which jest cannot transform, so pulling the session provider into a test
 * dragged in an untransformable dependency and took three unrelated suites
 * down with it. This module imports nothing but the env.
 *
 * THE IMPORT IS THE FRAGILE PART, not the key. `react-native-purchases`
 * reaches for its native module at module scope, so merely pulling it in threw
 * on any build with no RevenueCat pod, from app start, before anything had
 * rendered — a white screen rather than a broken tab. Hence the dynamic import
 * in `loadPurchases`, and hence every call being wrapped: a dev client built
 * before the dependency landed still starts, and says why in the log.
 */

/**
 * The slice of the SDK this app uses, written out for the reason
 * `AnalyticsClient` is (see `lib/analytics/client.ts`): naming the real type
 * would mean importing the module, which is the one thing this file exists to
 * defer. It is checked against the real thing at exactly one place — the loader
 * below — where a mismatch is a compile error.
 */
type PurchasesSdk = {
  configure(options: { apiKey: string }): void
  logIn(appUserId: string): Promise<unknown>
  logOut(): Promise<unknown>
  setEmail(email: string | null): Promise<void>
  setMixpanelDistinctID(distinctId: string | null): Promise<void>
}

const loadPurchases = async (): Promise<PurchasesSdk> =>
  (await import('react-native-purchases')).default

let load = loadPurchases

/**
 * Hand this module a stand-in SDK, and start from nothing.
 *
 * FOR TESTS, and it is the only way there is one. Jest keeps the dynamic import
 * above a real one and the VM refuses it without `--experimental-vm-modules`,
 * so a suite cannot reach these calls through `jest.mock` — the loader is what
 * it replaces instead. The configure latch and the queue are reset with it,
 * since both are module state that would otherwise carry from case to case.
 */
export function setPurchasesForTest(fake: PurchasesSdk | null): void {
  load = fake ? async () => fake : loadPurchases
  configured = null
  lifecycle = Promise.resolve()
}

let configured: Promise<boolean> | null = null

/**
 * Whether the SDK is usable, configuring it if nobody has yet.
 *
 * ONE PROMISE, SHARED. `initServices` fires this from a `useEffect` and does
 * not await it, so for a moment after launch the SDK is not configured — and a
 * synchronous "is it ready" check answered false in that window. That was a
 * real race with a sticky consequence: `usePlanPrices` runs with `retry: false`
 * (a build with no products should not retry three times), so one early call
 * cached "unavailable" and the paywall showed dashes for the rest of the
 * session on a perfectly good build.
 *
 * Awaiting a shared promise removes the window entirely: whoever needs the SDK
 * first starts the work, everybody else waits on the same result, and
 * `configure` still runs exactly once.
 */
export function ensurePurchasesConfigured(): Promise<boolean> {
  configured ??= configureOnce()
  return configured
}

function purchasesApiKey(): string {
  return Platform.OS === 'ios' ? env.EXPO_PUBLIC_RC_IOS_KEY : env.EXPO_PUBLIC_RC_ANDROID_KEY
}

/** Answers whether it configured, so the caller can log a skip. */
export function configurePurchases(): Promise<boolean> {
  return ensurePurchasesConfigured()
}

async function configureOnce(): Promise<boolean> {
  const apiKey = purchasesApiKey()
  if (!isConfigured(apiKey)) return false

  try {
    const Purchases = await load()
    // No `appUserID` here on purpose. This runs in the root layout, above the
    // session provider, so there is nobody to name yet — the SDK starts
    // anonymous and `identifyPurchaser` names the account as soon as there is
    // one. Passing a null id would be the same anonymous state with an extra
    // way to get it wrong.
    Purchases.configure({ apiKey })
    return true
  } catch (error) {
    if (__DEV__) {
      console.log('[revenuecat] could not load (is the pod in this build?):', error)
    }
    return false
  }
}

/**
 * THE IDENTITY CALLS, ONE AT A TIME AND IN THE ORDER THEY WERE MADE.
 *
 * Both of the functions below are fired and forgotten from the session
 * provider — `void identifyPurchaser(...)` — and each is several awaits deep,
 * with a native round trip to RevenueCat's own backend in the middle. Left to
 * overlap, an account switch reorders them, and each way of losing that race is
 * a real one:
 *
 * - A sign-out landing between a log in and the attributes that follow it files
 *   one person's EMAIL against whoever the SDK is holding by then, which after
 *   a `logOut` is a fresh anonymous customer and after a second sign-in is
 *   somebody else.
 * - A `logOut` completing after the `logIn` it was meant to precede leaves the
 *   SDK anonymous while somebody is signed in, which is the exact failure this
 *   file exists to prevent: their purchase reaches the webhook as
 *   `$RCAnonymousID:...` with no account to credit.
 *
 * Ordering by call rather than by completion costs nothing here — these run in
 * the background either way — and it is the only ordering that matches what the
 * auth events actually said.
 */
let lifecycle: Promise<void> = Promise.resolve()

function inOrder(work: () => Promise<void>): Promise<void> {
  // `then(work, work)`, so a link that somehow rejects does not strand every
  // call behind it; the `catch` then keeps the chain itself settled, because a
  // caller that does not await must not be able to raise an unhandled
  // rejection out of a promise nobody is holding.
  const done = lifecycle.then(work, work)
  lifecycle = done.catch(() => {})
  return lifecycle
}

/**
 * What RevenueCat is told ABOUT the person, beside which account they are.
 *
 * Both are nullable and null is ORDINARY rather than a failure: an account made
 * through a provider that gave no address has no email, and Mixpanel knows
 * nobody at all in a build that does not send (development, or a token still on
 * its placeholder). Written out as a type rather than two optional arguments so
 * a new call site has to decide about each of them.
 */
export type PurchaserTraits = {
  /** The address on the Supabase account, for support to search the dashboard by. */
  email: string | null
  /** What Mixpanel knows this person by, or null if nothing was sent. */
  mixpanelDistinctId: string | null
}

/**
 * Tell RevenueCat which account is buying, and what we know about them.
 *
 * THE WEBHOOK DEPENDS ON THE ID. `app_user_id` is what arrives at the
 * `revenuecat` edge function, and it is the only thing tying a purchase to a
 * row in `subscriptions`. Left anonymous, every purchase lands as
 * `$RCAnonymousID:...`, the webhook has no account to credit, and somebody who
 * has paid stays behind the paywall for good.
 *
 * THE ID IS THE SUPABASE UUID AND MUST NOT BECOME THE EMAIL. It is tempting,
 * because it would make the dashboard readable — but an address changes, and
 * the id it is compared against is the primary key of `subscriptions`. The
 * moment somebody changed their email the SDK would log in as a different
 * customer, the webhook's `app_user_id` would match no account, and a paying
 * user would silently stop being entitled. An email is also guessable, and a
 * guessable app user id plus the public SDK key is enough to ask about somebody
 * else's purchases. The address travels as an ATTRIBUTE below instead, which is
 * what makes the dashboard searchable at no such cost.
 */
export function identifyPurchaser(userId: string, traits: PurchaserTraits): Promise<void> {
  return inOrder(async () => {
    if (!(await ensurePurchasesConfigured())) return
    try {
      const Purchases = await load()
      await Purchases.logIn(userId)

      // AFTER the log in, never before. An attribute is filed against whichever
      // app user id the SDK is holding at the time, and before this call that
      // is the anonymous one the process started with — so an email set first
      // lands on a customer nobody will ever look up, and the real account
      // stays blank. This is also why the two live in one function rather than
      // beside it: a second call from the session provider would race the log
      // in it depends on, and `inOrder` can only sequence whole calls.
      //
      // Null deletes the attribute, which is the honest answer for an account
      // that has no address rather than something to skip over.
      await Purchases.setEmail(traits.email)

      // THE TIE BETWEEN THE TWO PLATFORMS, and the reason it is passed in
      // rather than assumed. RevenueCat funnels its own purchase events into
      // Mixpanel, and it files each one under this attribute — falling back to
      // the app user id when it is not set. Both are the Supabase uuid today,
      // so the fallback happens to be right, and "happens to be right" is
      // exactly what stops being true when one side changes. Setting it says
      // out loud which id the integration is keyed on.
      //
      // Null means Mixpanel was told nothing (a build that does not send), and
      // the attribute is then left alone rather than cleared: claiming a
      // distinct id for a person Mixpanel has never heard of would file real
      // purchases against a profile with no behaviour on it.
      if (traits.mixpanelDistinctId) {
        await Purchases.setMixpanelDistinctID(traits.mixpanelDistinctId)
      }
    } catch (error) {
      if (__DEV__) console.log('[revenuecat] identify failed:', error)
    }
  })
}

/**
 * Forget them on the way out, so the next account on this handset does not
 * inherit the last one's entitlement.
 *
 * Through `inOrder` for the reason given there: this is the call that races the
 * identify before it, and it is the one whose reordering leaves a signed-in
 * person anonymous.
 */
export function forgetPurchaser(): Promise<void> {
  return inOrder(async () => {
    if (!(await ensurePurchasesConfigured())) return
    try {
      const Purchases = await load()
      await Purchases.logOut()
    } catch (error) {
      if (__DEV__) console.log('[revenuecat] logOut failed:', error)
    }
  })
}
