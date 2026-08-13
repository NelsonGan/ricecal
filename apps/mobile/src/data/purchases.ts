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

/**
 * The three plans, priced by the STORE rather than by this repo.
 *
 * WHY NOT A CONSTANT IN THE COPY BUNDLE. It was one, and it was wrong in three
 * different ways at once: a Malaysian user was shown "$29.99" while being
 * charged RM119.90, Apple and Play disagreed by nine cents on the lifetime
 * price because Apple has no 119.90 price point for a one-time purchase, and
 * every repricing needed an app release to stop the paywall lying. RevenueCat
 * already hands back `priceString` localised to the user's own storefront, so
 * the number on the button is the number the store will charge.
 *
 * The saving is computed here too. Hardcoded it drifted the moment either
 * price moved, and it is the one figure on the paywall a user can check.
 */
export type PlanPrice = {
  /** Localised and currency-formatted by the store, e.g. "RM119.90". */
  priceString: string
  /** The raw figure, for arithmetic that needs it. */
  price: number
  currencyCode: string
  /** Yearly only: the same price divided over twelve months. */
  perMonthString?: string
}

export type PlanPrices = Partial<Record<Plan, PlanPrice>> & {
  /** Whole percent saved by paying yearly, or undefined if either price is missing. */
  yearlySavingPercent?: number
}

const perMonth = (price: number, currencyCode: string): string | undefined => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
      price / 12,
    )
  } catch {
    // An unknown currency code should cost the caption, not the screen.
    return undefined
  }
}

/**
 * Reads the current offering and returns what each plan costs.
 *
 * Throws `PurchasesUnavailable` when the SDK is not configured, which is the
 * ordinary state on a dev-variant build: its bundle id is suffixed `.dev` and
 * has no App Store Connect app behind it, so StoreKit can return no products
 * at all. The screens render a dash rather than a wrong number.
 */
export async function fetchPlanPrices(): Promise<PlanPrices> {
  if (!purchasesAvailable()) throw new PurchasesUnavailable()

  const Purchases = (await import('react-native-purchases')).default
  const current = (await Purchases.getOfferings()).current
  if (!current) throw new Error('No offering is live')

  const byLookupKey = (key: string) => current.availablePackages.find((p) => p.identifier === key)
  const priced = (
    pkg:
      | { product: { priceString: string; price: number; currencyCode: string } }
      | null
      | undefined,
  ) =>
    pkg
      ? {
          priceString: pkg.product.priceString,
          price: pkg.product.price,
          currencyCode: pkg.product.currencyCode,
        }
      : undefined

  const monthly = priced(current.monthly ?? byLookupKey('$rc_monthly'))
  const annual = priced(current.annual ?? byLookupKey('$rc_annual'))
  const lifetime = priced(current.lifetime ?? byLookupKey('$rc_lifetime'))

  const yearly = annual
    ? { ...annual, perMonthString: perMonth(annual.price, annual.currencyCode) }
    : undefined

  return {
    monthly,
    yearly,
    lifetime,
    yearlySavingPercent:
      monthly && annual && monthly.price > 0
        ? Math.round((1 - annual.price / (monthly.price * 12)) * 100)
        : undefined,
  }
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
