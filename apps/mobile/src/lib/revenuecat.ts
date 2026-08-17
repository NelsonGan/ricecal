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
 * everywhere below, and hence every call being wrapped: a dev client built
 * before the dependency landed still starts, and says why in the log.
 */

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
    const Purchases = (await import('react-native-purchases')).default
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
export async function identifyPurchaser(userId: string, traits: PurchaserTraits): Promise<void> {
  if (!(await ensurePurchasesConfigured())) return
  try {
    const Purchases = (await import('react-native-purchases')).default
    await Purchases.logIn(userId)

    // AFTER the log in, never before. An attribute is filed against whichever
    // app user id the SDK is holding at the time, and before this call that is
    // the anonymous one the process started with — so an email set first lands
    // on a customer nobody will ever look up, and the real account stays blank.
    // This is also why the two live in one function rather than beside it: a
    // second call from the session provider would race the log in it depends on.
    //
    // Null deletes the attribute, which is the honest answer for an account
    // that has no address rather than something to skip over.
    await Purchases.setEmail(traits.email)

    // THE TIE BETWEEN THE TWO PLATFORMS, and the reason it is passed in rather
    // than assumed. RevenueCat funnels its own purchase events into Mixpanel,
    // and it files each one under this attribute — falling back to the app user
    // id when it is not set. Both are the Supabase uuid today, so the fallback
    // happens to be right, and "happens to be right" is exactly what stops
    // being true when one side changes. Setting it says out loud which id the
    // integration is keyed on.
    //
    // Null means Mixpanel was told nothing (a build that does not send), and
    // the attribute is then left alone rather than cleared: claiming a distinct
    // id for a person Mixpanel has never heard of would file real purchases
    // against a profile with no behaviour on it.
    if (traits.mixpanelDistinctId) {
      await Purchases.setMixpanelDistinctID(traits.mixpanelDistinctId)
    }
  } catch (error) {
    if (__DEV__) console.log('[revenuecat] identify failed:', error)
  }
}

/**
 * Forget them on the way out, so the next account on this handset does not
 * inherit the last one's entitlement.
 */
export async function forgetPurchaser(): Promise<void> {
  if (!(await ensurePurchasesConfigured())) return
  try {
    const Purchases = (await import('react-native-purchases')).default
    await Purchases.logOut()
  } catch (error) {
    if (__DEV__) console.log('[revenuecat] logOut failed:', error)
  }
}
