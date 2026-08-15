import { useEffect, useRef } from 'react'

import { isUserCancelled, PurchasesUnavailable } from '@/data/purchases'
import { type AnalyticsPlan, type PaywallScreen, track } from '@/lib/analytics'

/**
 * The paywall half of the tracking plan, shared by the screens that have one.
 *
 * THE PURCHASE ITSELF IS NOT TRACKED HERE, on purpose. RevenueCat funnels its
 * own events into Mixpanel and it is the only party that knows whether the
 * store settled a transaction — an app-side "purchased" would be a second,
 * worse answer to the same question, and would count a receipt that later
 * failed validation.
 *
 * What RevenueCat cannot see is the two ends: the sheet being ASKED for, and
 * the sheet closing with nothing bought. The store never reports a purchase
 * that did not happen, so without these the funnel simply stops at "paywall
 * shown" and resumes at "subscription started", with the entire abandonment
 * step missing.
 */

/**
 * One `Paywall Shown` per presentation.
 *
 * `/paywall` does NOT use this: it is reached from a refused button, and
 * `useRequirePro` fires the event there because it is the only place that knows
 * which button. These three screens are the ones with a reason of their own.
 *
 * The ref rather than an empty dependency list, for the same reason as the log
 * sheet: each of these is a fresh mount per presentation already, and the ref
 * is what stops a Fast Refresh in development from inventing a second view.
 */
export function useTrackPaywallShown(screen: Exclude<PaywallScreen, 'hard'>): void {
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current) return
    shown.current = true
    track('Paywall Shown', { screen, trigger: screen })
  }, [screen])
}

/** The store sheet is about to open. */
export function trackPurchaseStarted(screen: PaywallScreen, plan: AnalyticsPlan): void {
  track('Purchase Started', { screen, plan })
}

/**
 * The store sheet closed with nothing bought, and why.
 *
 * `cancelled` is the number this exists for — somebody who reached the store's
 * own confirmation and backed out is a different person from one who never
 * pressed the button, and only the client can tell them apart.
 */
export function trackPurchaseAbandoned(
  screen: PaywallScreen,
  plan: AnalyticsPlan,
  error: unknown,
): void {
  track('Purchase Abandoned', {
    screen,
    plan,
    reason: isUserCancelled(error)
      ? 'cancelled'
      : error instanceof PurchasesUnavailable
        ? 'unavailable'
        : 'error',
  })
}
