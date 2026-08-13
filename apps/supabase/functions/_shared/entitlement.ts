// Who may reach the model, and how often.
//
// Two separate questions, deliberately kept apart because they fail
// differently and the user can do something about exactly one of them:
//
//   HAS THIS ACCOUNT PAID?   -> no: show the paywall. Buying fixes it.
//   HAS IT SPENT ITS MONTH?  -> no: nothing the user can buy their way out of,
//                               so the app says to get in touch.
//
// Both are checked SERVER-SIDE and that is the whole point. The client gates
// the same two things so the buttons read honestly, but a paywall enforced
// only in the app is a paywall enforced by anyone who has not modified the
// app. The rule is the same one the recipe review gate follows: a rule the
// client is trusted to follow is a rule an attacker declines to.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Statuses that may reach the model. Everything else is behind the paywall. */
const ENTITLED = new Set(['trial', 'active'])

/**
 * Refused because the account is not subscribed.
 *
 * Separate from the quota error below so the endpoints can answer with
 * different codes: the app routes one to the paywall and the other to a toast,
 * and a single "denied" would have the client guessing which.
 */
export class NotEntitled extends Error {
  constructor() {
    super('This account is not subscribed')
    this.name = 'NotEntitled'
  }
}

/** Refused because the account has spent its monthly allowance of requests. */
export class AiLimitReached extends Error {
  readonly used: number
  readonly monthlyLimit: number

  constructor(used: number, monthlyLimit: number) {
    super(`Monthly AI limit reached (${used}/${monthlyLimit})`)
    this.name = 'AiLimitReached'
    this.used = used
    this.monthlyLimit = monthlyLimit
  }
}

/**
 * Is this account entitled right now?
 *
 * Read as `service_role`: the caller has already been resolved from their own
 * JWT, and `subscriptions` has no client write grant, so there is nothing here
 * a user could have put in place themselves.
 *
 * A MISSING ROW IS "NO", not an error. Most accounts have never subscribed and
 * that is the ordinary state; `maybeSingle` says so without a 406.
 *
 * A failed READ is also "no", and that is the uncomfortable half. Failing open
 * would mean an outage in this one query hands the model to everybody, which
 * is the expensive direction to be wrong in; failing shut costs a paying user
 * one refused scan and a retry.
 */
export async function isEntitled(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[entitlement] read failed, refusing:', error.message)
    return false
  }
  return ENTITLED.has(data?.status ?? 'none')
}

/** Throws `NotEntitled` unless the account may reach the model. */
export async function requireEntitlement(db: SupabaseClient, userId: string): Promise<void> {
  if (!(await isEntitled(db, userId))) throw new NotEntitled()
}

/**
 * The per-request meter.
 *
 * `claim()` is called immediately before each HTTP request to OpenRouter and
 * throws when the account is out of budget. It is a REQUIRED argument
 * everywhere a model is called, all the way down to `chatJSON`, so that a new
 * model call cannot be added without deciding whose budget it comes out of —
 * an optional parameter would have made an uncounted call the thing that
 * happens when somebody forgets, and an under-count is invisible until the
 * bill arrives. `deno check` runs over every function in CI, so a missed one
 * fails the build rather than the invoice.
 */
export type Meter = {
  /** Takes one request's worth of budget, or throws `AiLimitReached`. */
  claim(): Promise<void>
  /** How many requests this invocation has made. For logs and the debug trace. */
  spent(): number
}

/**
 * A meter backed by `claim_ai_inference`, which does the check and the
 * increment in one statement so two scans at once cannot both walk through the
 * last unit of budget.
 */
export function createMeter(db: SupabaseClient, userId: string): Meter {
  let spent = 0

  return {
    spent: () => spent,
    async claim() {
      const { data, error } = await db
        .rpc('claim_ai_inference', { p_user: userId, p_count: 1 })
        .maybeSingle<{ allowed: boolean; used: number; monthly_limit: number }>()

      // The meter failing is not the user being over their limit, and charging
      // them for a request that has not happened is worse than letting one
      // through uncounted. This is the opposite call from `isEntitled` above
      // because the risk is opposite: entitlement decides whether a
      // non-paying account gets the model at all, while this decides how much
      // a PAYING one gets, and a database blip should not read as "you are cut
      // off" to somebody who has paid.
      if (error) {
        console.error('[meter] claim failed, allowing uncounted:', error.message)
        return
      }
      if (data && !data.allowed) {
        throw new AiLimitReached(data.used, data.monthly_limit)
      }
      spent += 1
    },
  }
}

/**
 * A meter that counts and never refuses.
 *
 * For mock mode, where no request reaches OpenRouter and there is nothing to
 * bill. Counting anyway would make a local stack's numbers look like a real
 * account's while costing nothing.
 */
export function nullMeter(): Meter {
  let spent = 0
  return {
    spent: () => spent,
    claim: () => {
      spent += 1
      return Promise.resolve()
    },
  }
}
