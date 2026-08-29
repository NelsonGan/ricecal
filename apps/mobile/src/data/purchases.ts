import { Linking, Platform } from 'react-native'

import { env, isConfigured } from '@/lib/env'
import { ensurePurchasesConfigured, PRO_ENTITLEMENT } from '@/lib/revenuecat'
import type { Plan } from './types'

/**
 * Re-exported rather than defined here. It moved to `lib/revenuecat.ts` when
 * that module started reading the entitlement itself, and this file may import
 * downwards while that one may not import up.
 */
export { PRO_ENTITLEMENT }

/**
 * Buying, restoring and managing the subscription.
 *
 * Entitlement is the store's to decide and RevenueCat's to report, and this app
 * only reads its own mirror in `subscriptions`, which has no client write grant.
 * There is no "set my plan" here: a client that can grant itself the app is not a
 * paywall.
 *
 * Everything is gated on the SDK key being real, as `startup.ts` gates the
 * others. With a placeholder key `Purchases.configure` is never called and
 * anything else throws, so the screens ask first.
 */

/**
 * Is there a real key in this build? Synchronous and key-only: asking whether the
 * SDK had finished configuring raced the fire-and-forget `initServices` and
 * answered false for the first moments of a launch. Readiness is awaited inside
 * each call below instead.
 */
export function purchasesAvailable(): boolean {
  const key = Platform.OS === 'ios' ? env.EXPO_PUBLIC_RC_IOS_KEY : env.EXPO_PUBLIC_RC_ANDROID_KEY
  return isConfigured(key)
}

/**
 * Did the user simply close the store's purchase sheet? RevenueCat reports it as
 * an ordinary rejection carrying `userCancelled`, so without this it lands in the
 * same branch as a declined card.
 */
export function isUserCancelled(error: unknown): boolean {
  return (error as { userCancelled?: boolean })?.userCancelled === true
}

export class PurchasesUnavailable extends Error {
  constructor() {
    super('Purchases are not configured yet')
    this.name = 'PurchasesUnavailable'
  }
}

/**
 * Starts a purchase. Imported lazily so the module is not loaded on a build whose
 * key is a placeholder: `react-native-purchases` throws on first use when it has
 * not been configured, and a lazy import keeps that at the call site.
 */
export async function purchasePlan(plan: Plan): Promise<void> {
  if (!(await ensurePurchasesConfigured())) throw new PurchasesUnavailable()

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
 * The three plans, priced by the store rather than by this repo. As a constant in
 * the copy bundle it was wrong three ways: a Malaysian user saw "$29.99" while
 * being charged RM119.90, Apple and Play disagreed on the lifetime price, and
 * every repricing needed a release. RevenueCat hands back `priceString` localised
 * to the user's own storefront.
 *
 * The saving is computed here too: hardcoded it drifted the moment either price
 * moved, and it is the one figure on the paywall a user can check.
 */
export type PlanPrice = {
  /** Localised and currency-formatted by the store, e.g. "RM119.90". */
  priceString: string
  /** The raw figure, for arithmetic that needs it. */
  price: number
  /**
   * Yearly only: the same price expressed per month, formatted by the SDK with
   * the same formatter as `priceString` so the two agree.
   */
  perMonthString?: string
}

export type PlanPrices = Partial<Record<Plan, PlanPrice>> & {
  /** Whole percent saved by paying yearly, or undefined if either price is missing. */
  yearlySavingPercent?: number
}

/**
 * How much cheaper a year is than twelve months, as a whole percent. Computed
 * from the two prices rather than asserted: a hardcoded "SAVE 50%" was wrong the
 * moment the monthly price moved. Undefined rather than zero when it cannot be
 * worked out, so the badge is absent instead of claiming nothing.
 */
export function yearlySavingPercent(monthly?: number, annual?: number): number | undefined {
  if (!monthly || !annual || monthly <= 0 || annual <= 0) return undefined
  const saving = Math.round((1 - annual / (monthly * 12)) * 100)
  // A yearly plan costing MORE than twelve months has no saving to show.
  return saving > 0 ? saving : undefined
}

/**
 * Reads the current offering and returns what each plan costs. Throws
 * `PurchasesUnavailable` when the SDK is not configured, which is ordinary on a
 * dev-variant build whose bundle id has no App Store Connect app behind it. The
 * screens render a dash rather than a wrong number.
 */
export async function fetchPlanPrices(): Promise<PlanPrices> {
  if (!(await ensurePurchasesConfigured())) throw new PurchasesUnavailable()

  const Purchases = (await import('react-native-purchases')).default
  const current = (await Purchases.getOfferings()).current
  if (!current) throw new Error('No offering is live')

  const byLookupKey = (key: string) => current.availablePackages.find((p) => p.identifier === key)

  /**
   * `pricePerMonthString` comes from the SDK rather than being computed here. As
   * `Intl.NumberFormat` over price/12 it rendered "MYR 2.49" under a store string
   * reading "RM119.90": two currencies for one product on one card. The SDK
   * formats both with the same formatter, and it was also the only Intl call this
   * app had on a Hermes runtime with no polyfill.
   */
  const priced = (
    pkg:
      | { product: { priceString: string; price: number; pricePerMonthString?: string | null } }
      | null
      | undefined,
  ) =>
    pkg
      ? {
          priceString: pkg.product.priceString,
          price: pkg.product.price,
          perMonthString: pkg.product.pricePerMonthString ?? undefined,
        }
      : undefined

  const monthly = priced(current.monthly ?? byLookupKey('$rc_monthly'))
  const annual = priced(current.annual ?? byLookupKey('$rc_annual'))
  const lifetime = priced(current.lifetime ?? byLookupKey('$rc_lifetime'))

  return {
    monthly,
    yearly: annual,
    lifetime,
    yearlySavingPercent: yearlySavingPercent(monthly?.price, annual?.price),
  }
}

/**
 * Restores purchases, and says whether anything came back. The boolean is the
 * point: returning void, every caller announced "Nothing to restore on this
 * account" even after a successful restore.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!(await ensurePurchasesConfigured())) throw new PurchasesUnavailable()
  const Purchases = (await import('react-native-purchases')).default
  const info = await Purchases.restorePurchases()
  return Boolean(info?.entitlements?.active?.[PRO_ENTITLEMENT])
}

/**
 * Cancelling and switching plans both happen in the store, not in the app.
 *
 * Apple and Google require it, and it is also the only place that can do it: the
 * app never holds the payment relationship.
 */
export async function openManageSubscriptions(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'
  await Linking.openURL(url)
}
