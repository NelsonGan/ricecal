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
 * Tell RevenueCat which account is buying.
 *
 * THE WEBHOOK DEPENDS ON THIS. `app_user_id` is what arrives at the
 * `revenuecat` edge function, and it is the only thing tying a purchase to a
 * row in `subscriptions`. Left anonymous, every purchase lands as
 * `$RCAnonymousID:...`, the webhook has no account to credit, and somebody who
 * has paid stays behind the paywall for good.
 */
export async function identifyPurchaser(userId: string): Promise<void> {
  if (!(await ensurePurchasesConfigured())) return
  try {
    const Purchases = (await import('react-native-purchases')).default
    await Purchases.logIn(userId)
  } catch (error) {
    if (__DEV__) console.log('[revenuecat] logIn failed:', error)
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
