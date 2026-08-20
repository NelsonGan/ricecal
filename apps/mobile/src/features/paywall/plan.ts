import type { Plan } from '@/data'
import { useEntitlement, useStoreEntitlement, useSubscription } from '@/data'

/**
 * WHAT PLAN IS THIS ACCOUNT ON, and is it a trial.
 *
 * ONE ANSWER FROM TWO SOURCES, for the same reason `useEntitlement` reads two:
 * our own mirror of the subscription is what the server enforces against and
 * what survives a reinstall, and the store's own copy is what knows about the
 * purchase that completed a moment ago. A screen reading only the mirror said
 * "Free plan" to somebody whose trial had just started, on the same launch the
 * gates had already opened for them.
 *
 * IT ALSO EXISTS TO STOP A LIE THAT WAS WRITTEN INTO THE COPY. The plan line
 * was the string "Yearly plan, active", printed unconditionally to every
 * subscriber: a monthly one, somebody who had bought lifetime, and every
 * account holding a promotional grant. The name is derived here now, and it is
 * null rather than guessed when nothing says what the plan is — which is the
 * ordinary state of a promotional grant, whose product id is `rc_promo_*` and
 * matches none of the three.
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
 * A DELIBERATE SECOND COPY of `planOf` in the `revenuecat` edge function: the
 * two live either side of the Deno / React Native line and cannot import each
 * other, and they must be changed together. Matched on the word rather than on
 * the full identifier for the reason written out there — the two stores spell
 * the same plan differently and always will
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

  // The mirror first, because it carries the plan as a column rather than as a
  // product id to be parsed — and it is the one the server agrees with. The
  // store fills in whatever the mirror has not heard about yet, which on the
  // day of a purchase is all of it.
  const plan = subscription?.plan ?? planOfProduct(store?.productId)
  const trial = subscription?.status === 'trial' || store?.trial === true

  return {
    state: trial ? 'trial' : 'active',
    plan,
    // Both are the same instant expressed twice; the mirror's is the one a
    // support conversation can be had about, so it leads.
    trialEndsAt: trial ? (subscription?.trial_ends_at ?? store?.expiresAt ?? null) : null,
    // Lifetime is the only one that does not, and an unnamed plan is treated as
    // not renewing on purpose: a promotional grant renews nothing, and "Renews
    // at $4.90" printed against one was the monthly price quoted to somebody
    // who had never been charged anything.
    renews: plan === 'monthly' || plan === 'yearly',
  }
}
