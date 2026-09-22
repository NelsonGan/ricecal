import { Linking, Platform } from 'react-native'

import { type Events, track } from '@/lib/analytics'
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
  /** Whether this customer will receive a free trial when buying this plan. */
  freeTrialEligible: boolean
  /** The free phase the store will apply to this plan and account. */
  trialDuration?: TrialDuration
}

export type TrialDuration = {
  unit: 'day' | 'week' | 'month' | 'year'
  count: number
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

type TrialProduct = {
  introPrice?: {
    price: number
    cycles?: number
    periodUnit?: string
    periodNumberOfUnits?: number
  } | null
  defaultOption?: {
    freePhase?: {
      billingPeriod?: { unit: string; value: number } | null
      billingCycleCount?: number | null
    } | null
  } | null
}

function durationOf(unit: string | undefined, units: number | undefined, cycles = 1) {
  const normalized = unit?.toLowerCase()
  const count = (units ?? 0) * cycles
  if (
    (normalized === 'day' ||
      normalized === 'week' ||
      normalized === 'month' ||
      normalized === 'year') &&
    Number.isSafeInteger(count) &&
    count > 0
  ) {
    return { unit: normalized, count } satisfies TrialDuration
  }
  return undefined
}

/** The native store's free period, not the paid subscription's renewal period. */
export function freeTrialDuration(
  platform: string,
  product: TrialProduct,
  iosEligible = false,
): TrialDuration | undefined {
  if (!hasFreeTrial(platform, product, iosEligible)) return undefined
  if (platform === 'ios') {
    const intro = product.introPrice
    return durationOf(intro?.periodUnit, intro?.periodNumberOfUnits, intro?.cycles ?? 1)
  }
  const phase = product.defaultOption?.freePhase
  return durationOf(
    phase?.billingPeriod?.unit,
    phase?.billingPeriod?.value,
    phase?.billingCycleCount ?? 1,
  )
}

/**
 * Whether the package RevenueCat will buy includes a free trial for this customer.
 *
 * Apple exposes the offer and the customer's eligibility separately. Google
 * filters ineligible offers out of `defaultOption`, so a free phase there is
 * already specific to the current Play account. Unknown Apple eligibility is
 * false because the checkout sheet is the final authority and the paywall must
 * not promise a trial it cannot confirm.
 */
export function hasFreeTrial(
  platform: string,
  product: TrialProduct,
  iosEligible = false,
): boolean {
  if (platform === 'ios') return product.introPrice?.price === 0 && iosEligible
  if (platform === 'android') return product.defaultOption?.freePhase != null
  return false
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

  const monthlyPackage = current.monthly ?? byLookupKey('$rc_monthly')
  const annualPackage = current.annual ?? byLookupKey('$rc_annual')
  const lifetimePackage = current.lifetime ?? byLookupKey('$rc_lifetime')

  // Android includes only offers this Play account can use in the product's
  // subscription options. Apple needs a separate eligibility check. A failure
  // here should not hide prices, but it must suppress trial copy.
  const iosEligibility: Record<string, { status: number }> =
    Platform.OS === 'ios'
      ? await Purchases.checkTrialOrIntroductoryPriceEligibility(
          [monthlyPackage, annualPackage]
            .filter((pkg) => pkg != null)
            .map((pkg) => pkg.product.identifier),
        ).catch(() => ({}) as Record<string, { status: number }>)
      : {}

  /**
   * `pricePerMonthString` comes from the SDK rather than being computed here. As
   * `Intl.NumberFormat` over price/12 it rendered "MYR 2.49" under a store string
   * reading "RM119.90": two currencies for one product on one card. The SDK
   * formats both with the same formatter, and it was also the only Intl call this
   * app had on a Hermes runtime with no polyfill.
   */
  const priced = (
    pkg:
      | {
          product: {
            identifier: string
            priceString: string
            price: number
            pricePerMonthString?: string | null
            introPrice?: TrialProduct['introPrice']
            defaultOption?: TrialProduct['defaultOption']
          }
        }
      | null
      | undefined,
  ) => {
    if (!pkg) return undefined
    const trialDuration = freeTrialDuration(
      Platform.OS,
      pkg.product,
      iosEligibility[pkg.product.identifier]?.status ===
        Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
    )
    return {
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      perMonthString: pkg.product.pricePerMonthString ?? undefined,
      trialDuration,
      // An unreadable store period is not a seven-day promise by default.
      freeTrialEligible: trialDuration != null,
    }
  }

  const monthly = priced(monthlyPackage)
  const annual = priced(annualPackage)
  const lifetime = priced(lifetimePackage)

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
 * Why the store's own subscription page is being opened, and from where.
 *
 * Read off the event rather than written out again: cancelling and switching
 * are one call apart here and a breakdown apart in Mixpanel, and two lists that
 * can disagree is how one of them ends up carrying a value nothing reports.
 */
type Manage = Events['Manage Subscription Opened']

/**
 * Cancelling and switching plans both happen in the store, not in the app.
 *
 * Apple and Google require it, and it is also the only place that can do it: the
 * app never holds the payment relationship.
 *
 * The intent is required rather than optional because this hand-off is the last
 * thing the app sees. What opens is a list of the plans in the group with the
 * cancel action under it, and a tap on the wrong row there ends a free trial
 * and charges for the new plan immediately. Untracked, that arrives as a
 * purchase with nothing in the funnel behind it.
 */
export async function openManageSubscriptions(
  intent: Manage['intent'],
  from: Manage['from'],
): Promise<void> {
  track('Manage Subscription Opened', { intent, from })
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions'
  await Linking.openURL(url)
}
