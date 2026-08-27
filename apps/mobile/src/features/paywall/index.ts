/**
 * The paywall's own pieces: the guard every gated control calls, and the
 * plan picker the three paywall screens share.
 *
 * Separate from `features/shared` because these know what a subscription is
 * and what it costs, which is a narrower thing to know than "meals and foods".
 */

export { EntitlementSync } from './EntitlementSync'
export { markPaywallSeen, NUDGE_INTERVAL_MS, paywallDue } from './nudge'
export { PLAN_FEATURES, type PlanFeature, PlanTable } from './PlanTable'
export { ProPitch, type ProPitchProps } from './ProPitch'
export { PurchaseTerms } from './PurchaseTerms'
export { type PlanSummary, planOfProduct, usePlanSummary } from './plan'
export {
  trackPurchaseAbandoned,
  trackPurchaseStarted,
  useMarkPaywallSeen,
  useTrackPaywallShown,
} from './tracking'
export { useProNudge } from './useProNudge'
export { type RequireProOptions, useRequirePro } from './useRequirePro'
