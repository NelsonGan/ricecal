import { Linking, Platform } from 'react-native'

import { env, isConfigured } from '@/lib/env'
import { purchasesInitialised } from '@/lib/revenuecat'
import type { Plan } from './types'

/**
 * Buying, restoring and managing the subscription.
 *
 * Entitlement is the store's to decide and RevenueCat's to report; this app
 * only ever reads its own mirror of the answer in `subscriptions`, which has
 * no client write grant at all. So there is no "set my plan" here, and there
 * never should be — a client that can grant itself the app is not a paywall.
 *
 * Everything is gated on the SDK key being real, the same way `startup.ts`
 * gates the others. With a placeholder key `Purchases.configure` is never
 * called, and calling anything else throws — so the screens ask first and say
 * plainly that purchases are not set up rather than failing at the tap.
 */

export function purchasesAvailable(): boolean {
  const key = Platform.OS === 'ios' ? env.EXPO_PUBLIC_RC_IOS_KEY : env.EXPO_PUBLIC_RC_ANDROID_KEY
  // Both halves matter. The key being real is not enough on a build whose
  // native module is missing: `configure` never ran, so every call below would
  // throw at the tap rather than at start, which is the failure this whole
  // module is shaped to avoid.
  return isConfigured(key) && purchasesInitialised()
}

export class PurchasesUnavailable extends Error {
  constructor() {
    super('Purchases are not configured yet')
    this.name = 'PurchasesUnavailable'
  }
}

/**
 * Starts a purchase.
 *
 * Imported lazily so the module is not even loaded on a build whose key is a
 * placeholder — `react-native-purchases` throws on first use when it has not
 * been configured, and a lazy import keeps that failure at the call site
 * rather than at app start.
 */
export async function purchasePlan(plan: Plan): Promise<void> {
  if (!purchasesAvailable()) throw new PurchasesUnavailable()

  const Purchases = (await import('react-native-purchases')).default
  const offerings = await Purchases.getOfferings()
  const current = offerings.current
  if (!current) throw new Error('No offering is live')

  // Named packages first, `availablePackages` as the fallback. RevenueCat only
  // fills `annual` / `monthly` / `lifetime` when the package carries the
  // matching `$rc_` identifier, and a renamed package would otherwise make the
  // button do nothing with no way to tell why.
  const byLookupKey = (key: string) => current.availablePackages.find((p) => p.identifier === key)

  const target =
    plan === 'lifetime'
      ? (current.lifetime ?? byLookupKey('$rc_lifetime'))
      : plan === 'yearly'
        ? (current.annual ?? byLookupKey('$rc_annual'))
        : (current.monthly ?? byLookupKey('$rc_monthly'))
  if (!target) throw new Error('That plan is not available')

  await Purchases.purchasePackage(target)
  // Nothing is written here. The webhook updates `subscriptions`, and the app
  // reads it — one source of truth for what the user is entitled to.
}

export async function restorePurchases(): Promise<void> {
  if (!purchasesAvailable()) throw new PurchasesUnavailable()
  const Purchases = (await import('react-native-purchases')).default
  await Purchases.restorePurchases()
}

/**
 * Cancelling and switching plans both happen in the store, not in the app.
 *
 * Apple and Google require it, and it is also the only place that can do it:
 * the app never holds the payment relationship.
 */
export async function openManageSubscriptions(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'
  await Linking.openURL(url)
}
