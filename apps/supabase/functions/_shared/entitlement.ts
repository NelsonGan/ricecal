// Who may reach the model, and how often.
//
// Two separate questions, deliberately kept apart because they fail
// differently and the user can do something about exactly one of them:
//
//   HAS THIS ACCOUNT PAID?   -> decides which FEATURES it may reach at all.
//                               Describing a meal, correcting one with words
//                               and reading a recipe out of a photograph are
//                               Pro; photographing a plate is not.
//   HAS IT SPENT TODAY?      -> decides how many SCANS it may spend, and the
//                               ceiling depends on the answer above: three a
//                               day free, fifty a day Pro.
//
// The second question used to be "has it spent its month", counted in requests
// to OpenRouter, and the unit was the problem: one photographed plate is three
// or four of them, so the number could never be said out loud and the refusal
// had nothing to offer — there was no larger tier to buy. Counted in scans, a
// free account's refusal has an answer, which is the whole point of a free
// tier.
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
 * The whole rule: an entitled status, and a period that has not run out.
 *
 * THE DATE IS PART OF IT, and for a long time it was not. Both gates read the
 * status alone, so `current_period_end` was a column the webhook wrote and
 * nothing ever read — which made every missed ending PERMANENT rather than
 * temporary. A delivery that failed past RevenueCat's retries, or an event the
 * ordering guard wrongly discarded (which is exactly what happened to two
 * revoked promotional grants): either leaves a row saying `active` with an
 * expiry in the past, and the account goes on reaching the model for ever.
 *
 * It does not replace the webhook, and it cannot: RevenueCat is still the only
 * thing that knows a subscription ended EARLY. What it does is bound the damage
 * of never hearing, to the period that was actually paid for.
 *
 * NULL IS NO EXPIRY, not an expired one. Lifetime is bought once and renews
 * never, so RevenueCat sends no expiry for it and the column is null by design
 * — read the other way round, this would refuse the one plan nobody can renew.
 *
 * Mirrored by `isEntitledRow` in the client's `data/subscription.ts`. The two
 * cannot import each other across the Deno / React Native line, so they are two
 * copies of one rule and have to be changed together.
 */
export function entitledBy(
  row: { status?: string | null; current_period_end?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!ENTITLED.has(row?.status ?? 'none')) return false
  const end = row?.current_period_end
  return !end || new Date(end) > now
}

/**
 * Refused because the account is not subscribed.
 *
 * Separate from the quota error below so the endpoints can answer with
 * different codes: the app routes one to the paywall and the other to a toast
 * over the same paywall, and a single "denied" would have the client guessing
 * which.
 *
 * `feature` says WHICH Pro-only thing was asked for. It rides along because
 * the app's paywall tracks what refused it — that is the only way to find out
 * which capability actually sells the app — and a 402 with no name in it makes
 * every server-side refusal look the same in the funnel.
 */
export class NotEntitled extends Error {
  readonly feature: string

  constructor(feature: string) {
    super('This account is not subscribed')
    this.name = 'NotEntitled'
    this.feature = feature
  }
}

/**
 * Refused because the account has spent today's scans.
 *
 * `entitled` is the half that decides what the app says. A free account that
 * has spent its three has something to buy and is shown the paywall; a Pro
 * account that has spent its fifty has not, and is asked to get in touch. Two
 * very different messages behind one status code, and the client cannot tell
 * them apart from the numbers alone — 50 is only recognisably the Pro ceiling
 * to somebody who knows both.
 */
export class ScanLimitReached extends Error {
  readonly used: number
  readonly dailyLimit: number
  readonly entitled: boolean

  constructor(used: number, dailyLimit: number, entitled: boolean) {
    super(`Daily scan limit reached (${used}/${dailyLimit})`)
    this.name = 'ScanLimitReached'
    this.used = used
    this.dailyLimit = dailyLimit
    this.entitled = entitled
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
 * would mean an outage in this one query hands the Pro features to everybody,
 * which is the expensive direction to be wrong in; failing shut costs a paying
 * user one refused describe and a retry.
 */
export async function isEntitled(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[entitlement] read failed, refusing:', error.message)
    return false
  }
  return entitledBy(data)
}

/**
 * Throws `NotEntitled` unless the account may reach this Pro-only feature.
 *
 * NOT EVERY MODEL PATH IS BEHIND THIS ANY MORE, which is the change freemium
 * made here. Photographing a plate is the app's whole pitch and a free account
 * gets three a day of it; what stays Pro is the paths that are worth paying for
 * and cheap to live without — describing a meal in words, correcting one with
 * words, and reading a recipe out of a photograph. The names are the same
 * strings the client's `ProFeature` union uses, so a refusal that starts on the
 * server lands in the same funnel as one the client caught first.
 */
export async function requireEntitlement(
  db: SupabaseClient,
  userId: string,
  feature: string,
): Promise<void> {
  if (!(await isEntitled(db, userId))) throw new NotEntitled(feature)
}

/**
 * Take one scan's worth of today's budget, or throw.
 *
 * ONE CLAIM PER USER-INITIATED PASS AT THE MODEL, taken at the top of the
 * endpoint before the photo is read and before the first model call. Claimed
 * afterwards, an account already at its ceiling would still get to send the
 * request that put it there.
 *
 * WHAT COUNTS AS ONE. A photographed plate, a typed meal, a correction, a
 * recipe read out of a picture: one each, whatever they cost underneath. A
 * plate that takes a vision call, a verifier call and an estimate is still one
 * scan, because one scan is what the user did. `Meter` below counts the model
 * requests separately, for the logs and the bill.
 *
 * THE CLAIM IS NOT REFUNDED when the cascade goes badly. A scan that bottomed
 * out at the archetype floor, or a photograph with no food in it, has still
 * spent a plate's worth of model time and the user has still had an answer.
 * Refunding would also mean deciding what "went badly" means, which is a
 * judgement the meter has no business making.
 *
 * A FAILED CLAIM LETS THE REQUEST THROUGH, uncounted. This is the opposite call
 * from `isEntitled` above because the risk is opposite: entitlement decides
 * whether a non-paying account reaches a Pro feature at all, while this decides
 * how much anybody gets, and a database blip should not read as "you are cut
 * off" to somebody who has paid.
 */
export async function claimScan(db: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await db
    .rpc('claim_scan', { p_user: userId })
    .maybeSingle<{ allowed: boolean; used: number; daily_limit: number; entitled: boolean }>()

  if (error) {
    console.error('[quota] claim failed, allowing uncounted:', error.message)
    return
  }
  if (data && !data.allowed) {
    throw new ScanLimitReached(data.used, data.daily_limit, data.entitled)
  }
}

/**
 * Take one recipe review's worth of budget, or refuse.
 *
 * NOT THE USER'S SCAN QUOTA, and that is the whole reason this is a second
 * claim rather than a call to the one above. The review is the app's own
 * moderation — it runs because somebody pressed Publish, not because they asked
 * for a model — and spending their daily allowance on it would be the app
 * billing them for a check it performs on its own behalf. What it needs instead
 * is a ceiling that no real use comes near and a loop cannot walk through, which
 * is what a per-hour rate limit is.
 *
 * Returns a BOOLEAN rather than throwing. There is one caller and it answers
 * the refusal the same way it answers every other failure in that branch — the
 * recipe stays `pending`, which keeps it out of the community tab — so a class
 * to carry the numbers across would be a class nobody reads.
 *
 * A FAILED CLAIM LETS IT THROUGH, like the scan meter and for the same reason:
 * a database blip must not become a recipe nobody can publish.
 */
export async function claimRecipeReview(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db
    .rpc('claim_recipe_review', { p_user: userId })
    .maybeSingle<{ allowed: boolean; used: number; hourly_limit: number }>()

  if (error) {
    console.error('[review quota] claim failed, allowing uncounted:', error.message)
    return true
  }
  if (data && !data.allowed) {
    console.warn(`[review quota] refused: ${data.used}/${data.hourly_limit} this hour`)
    return false
  }
  return true
}

/**
 * How many requests to OpenRouter one invocation made.
 *
 * COUNTS, AND NO LONGER REFUSES. It used to be the quota itself: `claim()` ran
 * before every HTTP request to the model and threw when the account was out of
 * budget for the month. That is what made the ceiling unspeakable — a limit in
 * units of "requests" cannot be printed on a paywall — so the ceiling moved to
 * `claimScan` above, counted in scans, and what is left here is the honest
 * record of what a scan actually cost us.
 *
 * STILL A REQUIRED ARGUMENT everywhere a model is called, all the way down to
 * `chatJSON`, and that is deliberate: it is what keeps a new model call from
 * being added without the trace and the logs knowing about it, and it is the
 * hook a per-request budget would go back on to if one is ever wanted again.
 * `deno check` runs over every function in CI, so a missed one fails the build.
 */
export type Meter = {
  /** Counts one HTTP request to OpenRouter. */
  record(): void
  /** How many requests this invocation has made. For logs and the debug trace. */
  spent(): number
}

export function createMeter(): Meter {
  let spent = 0
  return {
    spent: () => spent,
    record: () => {
      spent += 1
    },
  }
}
