import { Platform } from 'react-native'

import { env, isConfigured } from './env'

/**
 * The RevenueCat SDK's lifecycle: configure it, tell it who is signed in, and
 * forget them on the way out.
 *
 * Its own file rather than a corner of `startup.ts`, because `session.tsx` needs
 * the identify half and `startup.ts` imports Mixpanel at module scope, which jest
 * cannot transform. This module imports nothing but the env.
 *
 * The import is the fragile part rather than the key: `react-native-purchases`
 * reaches for its native module at module scope, so pulling it in threw on any
 * build with no RevenueCat pod, before anything had rendered. Hence the dynamic
 * import in `loadPurchases`, and every call being wrapped.
 */

/**
 * The slice of the SDK this app uses, written out for the reason
 * `AnalyticsClient` is: naming the real type would import the module, which is
 * what this file exists to defer. Checked against the real thing at the loader
 * below, where a mismatch is a compile error.
 */
type PurchasesSdk = {
  configure(options: { apiKey: string }): void
  logIn(appUserId: string): Promise<unknown>
  logOut(): Promise<unknown>
  setEmail(email: string | null): Promise<void>
  setMixpanelDistinctID(distinctId: string | null): Promise<void>
  getCustomerInfo(): Promise<StoreCustomerInfo>
  addCustomerInfoUpdateListener(listener: (info: StoreCustomerInfo) => void): void
  removeCustomerInfoUpdateListener(listener: (info: StoreCustomerInfo) => void): boolean
}

/**
 * The slice of RevenueCat's `CustomerInfo` this app reads, written out for the
 * reason the rest of `PurchasesSdk` is. The methods above use method shorthand
 * deliberately: TypeScript checks those bivariantly, so a listener typed against
 * this subset still accepts the SDK's own wider one.
 */
type StoreCustomerInfo = {
  entitlements: {
    active: Record<string, StoreEntitlementInfo | undefined>
  }
}

type StoreEntitlementInfo = {
  isActive: boolean
  willRenew: boolean
  periodType: string
  expirationDate: string | null
  productIdentifier: string
  isSandbox: boolean
}

const loadPurchases = async (): Promise<PurchasesSdk> =>
  (await import('react-native-purchases')).default

let load = loadPurchases

/**
 * Hand this module a stand-in SDK, and start from nothing. The only way there is
 * one: jest keeps the dynamic import above a real one and the VM refuses it
 * without `--experimental-vm-modules`, so a suite cannot reach these calls
 * through `jest.mock`. The configure latch and the queue reset with it.
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
 * One shared promise. `initServices` fires this from a `useEffect` without
 * awaiting it, so a synchronous "is it ready" check answered false for a moment
 * after launch, and `usePlanPrices` runs with `retry: false`, so one early call
 * cached "unavailable" and the paywall showed dashes for the session.
 *
 * Awaiting a shared promise removes the window: whoever needs the SDK first
 * starts the work, everybody else waits on the same result.
 */
export function ensurePurchasesConfigured(): Promise<boolean> {
  configured ??= configureOnce()
  return configured
}

function purchasesApiKey(): string {
  // THE TEST STORE WINS IN DEVELOPMENT, and only there. `__DEV__` is a literal
  // Metro replaces, so this branch is not merely unreachable in a release
  // bundle — it is not in it. See `EXPO_PUBLIC_RC_TEST_STORE_KEY` for why a
  // simulator needs a store of its own at all.
  if (__DEV__ && isConfigured(env.EXPO_PUBLIC_RC_TEST_STORE_KEY)) {
    return env.EXPO_PUBLIC_RC_TEST_STORE_KEY as string
  }
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
 * The identity calls, one at a time and in the order they were made.
 *
 * Both functions below are fired and forgotten from the session provider, each
 * several awaits deep with a native round trip in the middle, and an account
 * switch reorders them:
 *
 * - A sign-out landing between a log in and the attributes that follow it files
 *   one person's email against whoever the SDK is holding by then.
 * - A `logOut` completing after the `logIn` it was meant to precede leaves the
 *   SDK anonymous while somebody is signed in.
 *
 * Ordering by call rather than completion costs nothing and matches what the auth
 * events said.
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
 * What RevenueCat is told about the person, beside which account they are. Both
 * are nullable and null is ordinary: a provider that gave no address has no
 * email, and Mixpanel knows nobody in a build that does not send. A type rather
 * than two optional arguments, so a new call site decides about each.
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
 * The webhook depends on the id: `app_user_id` is what arrives at the
 * `revenuecat` edge function and the only thing tying a purchase to a row in
 * `subscriptions`. Left anonymous, the webhook has no account to credit and
 * somebody who has paid stays behind the paywall for good.
 *
 * The id is the Supabase uuid and must not become the email. An address changes,
 * and the moment somebody changed theirs the SDK would log in as a different
 * customer and a paying user would stop being entitled. An email is also
 * guessable, and a guessable app user id plus the public SDK key is enough to ask
 * about somebody else's purchases.
 */
export function identifyPurchaser(userId: string, traits: PurchaserTraits): Promise<void> {
  return inOrder(async () => {
    if (!(await ensurePurchasesConfigured())) return
    try {
      const Purchases = await load()
      await Purchases.logIn(userId)

      // After the log in, never before: an attribute is filed against whichever
      // app user id the SDK holds at the time, which before this call is the
      // anonymous one. This is also why the two live in one function rather than
      // beside it.
      //
      // Null deletes the attribute, which is honest for an account with no
      // address.
      await Purchases.setEmail(traits.email)

      // The tie between the two platforms, passed in rather than assumed.
      // RevenueCat files the purchase events it forwards to Mixpanel under this
      // attribute, falling back to the app user id. Both are the Supabase uuid
      // today, which is what stops being true when one side changes.
      //
      // Null means Mixpanel was told nothing, and the attribute is left alone
      // rather than cleared: a distinct id for a person Mixpanel has never heard
      // of would file real purchases against a profile with no behaviour on it.
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
 * inherit the last one's entitlement. Through `inOrder`, because this is the call
 * whose reordering leaves a signed-in person anonymous.
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

/**
 * The entitlement this app sells. Must match the identifier in RevenueCat and
 * `ENTITLEMENT` in the `revenuecat` edge function.
 */
export const PRO_ENTITLEMENT = 'pro'

/**
 * What the store says this account is entitled to, as RevenueCat's SDK holds it.
 *
 * The second source, and the app needs both. `subscriptions` is what the server
 * reads and the only thing that can refuse a request, but it is filled by a
 * webhook, so it lags the purchase and in a sandbox never arrives at all. Read
 * alone, that gap is a user who has just paid being shown the paywall.
 *
 * The SDK knows the moment the store settles, because it holds the receipt it
 * validated: the store's own answer cached on the device rather than a claim the
 * client is making about itself.
 *
 * Null means there is nothing to ask, which is not the same as "not entitled".
 */
export type StoreEntitlement = {
  active: boolean
  /** Whether this period is the free trial, which the plan line prints. */
  trial: boolean
  /** Null for a plan that never expires, exactly as `current_period_end` is. */
  expiresAt: string | null
  productId: string | null
  /**
   * A sandbox purchase. Worth having on hand: the webhook deliberately refuses
   * to grant on one, so a tester whose store says yes and whose mirror says no
   * is looking at that rule rather than at a bug.
   */
  sandbox: boolean
}

/**
 * Reads the `pro` entitlement out of a customer info payload. Exported for tests,
 * which is the only way to exercise it: the SDK is behind a dynamic import jest
 * cannot follow.
 */
export function proEntitlementOf(info: StoreCustomerInfo): StoreEntitlement {
  const pro = info?.entitlements?.active?.[PRO_ENTITLEMENT]
  // `active` is RevenueCat's own answer and it already accounts for the expiry,
  // the grace period and a refund. It is not second-guessed against the date
  // here, unlike the mirror in Postgres — that one is a copy of an event and can
  // be stale, this one is the SDK's own reading of a receipt.
  if (!pro?.isActive) {
    return { active: false, trial: false, expiresAt: null, productId: null, sandbox: false }
  }
  return {
    active: true,
    trial: pro.periodType?.toUpperCase() === 'TRIAL',
    expiresAt: pro.expirationDate ?? null,
    productId: pro.productIdentifier ?? null,
    sandbox: pro.isSandbox === true,
  }
}

/** Asks the SDK. Null when there is no SDK to ask — see `StoreEntitlement`. */
export async function readStoreEntitlement(): Promise<StoreEntitlement | null> {
  if (!(await ensurePurchasesConfigured())) return null
  try {
    const Purchases = await load()
    return proEntitlementOf(await Purchases.getCustomerInfo())
  } catch (error) {
    if (__DEV__) console.log('[revenuecat] could not read customer info:', error)
    return null
  }
}

/**
 * Calls back whenever RevenueCat's idea of this customer changes, and returns the
 * way to stop. This is what makes a purchase land without a refetch, and it is
 * the earliest warning that the webhook is about to write our own mirror, which
 * is why the subscriber invalidates that query too.
 *
 * A no-op unsubscribe when the SDK is unusable, so a caller's cleanup is the same
 * shape either way.
 */
export function onStoreEntitlementChange(
  listener: (entitlement: StoreEntitlement) => void,
): () => void {
  let cancelled = false
  let detach: (() => void) | null = null

  void (async () => {
    if (!(await ensurePurchasesConfigured())) return
    try {
      const Purchases = await load()
      const forward = (info: StoreCustomerInfo) => listener(proEntitlementOf(info))
      // The await above means this can resolve after the caller has already
      // unmounted, so the latch is checked before anything is attached rather
      // than only in the cleanup.
      if (cancelled) return
      Purchases.addCustomerInfoUpdateListener(forward)
      detach = () => Purchases.removeCustomerInfoUpdateListener(forward)
    } catch (error) {
      if (__DEV__) console.log('[revenuecat] could not listen for changes:', error)
    }
  })()

  return () => {
    cancelled = true
    detach?.()
    detach = null
  }
}
