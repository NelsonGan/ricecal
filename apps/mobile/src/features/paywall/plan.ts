import type { Plan } from '@/data'
import { useEntitlement, useStoreEntitlement, useSubscription } from '@/data'

/**
 * What plan this account is on, and whether it is a trial.
 *
 * Two sources, for the reason `useEntitlement` reads two: our mirror is what
 * the server enforces against, and the store's copy is what knows about a
 * purchase that completed a moment ago. Reading only the mirror said "Free
 * plan" to somebody whose trial had just started.
 *
 * The plan line used to be the constant string "Yearly plan, active", shown to
 * monthly subscribers and promotional grants alike. It is derived here now, and
 * null rather than guessed when nothing names it, which is the ordinary state
 * of a promotional grant (`rc_promo_*` matches none of the three).
 */
export type PlanSummary = {
  /** What the plan line says. `none` covers never-paid and lapsed alike. */
  state: 'none' | 'trial' | 'active'
  /** Null when the plan cannot be named. Never guessed. */
  plan: Plan | null
  /** When the trial ends, if this is one and anybody said. */
  trialEndsAt: string | null
  /** Whether this plan renews at all, which lifetime does not. */
  renews: boolean
}

/**
 * Which of the three plans a store product id is.
 *
 * A deliberate second copy of `planOf` in the `revenuecat` edge function: the
 * two are either side of the Deno / React Native line and must be changed
 * together. Matched on the word rather than the full identifier because the
 * stores spell the same plan differently
 * (`com.nelsongan.ricecal.pro.yearly` against `ricecal_pro_yearly:yearly`).
 *
 * Null when nothing matches, which includes every promotional grant.
 */
export function planOfProduct(productId: string | null | undefined): Plan | null {
  const id = (productId ?? '').toLowerCase()
  if (id.includes('lifetime')) return 'lifetime'
  if (id.includes('year') || id.includes('annual')) return 'yearly'
  if (id.includes('month')) return 'monthly'
  return null
}

export function usePlanSummary(): PlanSummary {
  const { entitled } = useEntitlement()
  const { data: subscription } = useSubscription()
  const { data: store } = useStoreEntitlement()

  if (!entitled) return { state: 'none', plan: null, trialEndsAt: null, renews: false }

  // The mirror first: it carries the plan as a column rather than a product id
  // to parse, and it is the one the server agrees with. The store fills in what
  // the mirror has not heard about yet, which on the day of a purchase is all
  // of it.
  const plan = subscription?.plan ?? planOfProduct(store?.productId)
  const trial = subscription?.status === 'trial' || store?.trial === true

  return {
    state: trial ? 'trial' : 'active',
    plan,
    // The same instant twice. The mirror's is the one a support conversation
    // can be had about, so it leads.
    trialEndsAt: trial ? (subscription?.trial_ends_at ?? store?.expiresAt ?? null) : null,
    // An unnamed plan is treated as not renewing: a promotional grant renews
    // nothing, and "Renews at $4.90" against one quoted the monthly price to
    // somebody who had never been charged.
    renews: plan === 'monthly' || plan === 'yearly',
  }
}
