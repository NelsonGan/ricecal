// Who may reach the model, and how often.
//
// Two separate questions, kept apart because they fail differently:
//
//   Has this account paid?  -> which features it may reach at all. Describing a
//                              meal, correcting one and reading a recipe out of a
//                              photograph are Pro; photographing a plate is not.
//   Has it spent today?     -> how many scans, and the ceiling depends on the
//                              answer above: three a day free, fifty a day Pro.
//
// Both are checked server-side. The client gates the same two things so the
// buttons read honestly, but a paywall enforced only in the app is a paywall
// enforced by anyone who has not modified the app.

import type { SupabaseClient } from '@supabase/supabase-js'
import { planOf, sandboxAllowed } from './revenuecat.ts'
import { fetchSubscriber } from './revenuecat-api.ts'

/** Statuses that may reach the model. Everything else is behind the paywall. */
const ENTITLED = new Set(['trial', 'active'])

/**
 * The whole rule: an entitled status, and a period that has not run out.
 *
 * The date is part of it. Read on the status alone, a missed ending is permanent
 * rather than temporary: a delivery that failed past RevenueCat's retries, or an
 * event the ordering guard wrongly discarded, leaves a row saying `active` with
 * an expiry in the past and an account reaching the model for ever.
 *
 * It does not replace the webhook, which is the only thing that knows a
 * subscription ended early. It bounds the damage of never hearing.
 *
 * Null is no expiry, not an expired one: lifetime renews never, so RevenueCat
 * sends no date and reading it the other way would refuse the one plan that
 * cannot lapse.
 *
 * Mirrored by `isEntitledRow` in `data/subscription.ts`. The two cannot import
 * each other across the Deno / React Native line and change together.
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
 * Separate from the quota error below so the endpoints can answer with different
 * codes: the app routes one to the paywall and the other to a toast over the same
 * paywall.
 *
 * `feature` says which Pro-only thing was asked for. It rides along because the
 * app's paywall tracks what refused it, which is the only way to find out which
 * capability actually sells the app.
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
 * `entitled` is the half that decides what the app says. A free account that has
 * spent its three has something to buy and is shown the paywall; a Pro account
 * that has spent its fifty has not, and is asked to get in touch. Two very
 * different messages behind one status code, and the client cannot tell them
 * apart from the numbers alone.
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
 * Read as `service_role`: the caller is already resolved from their own JWT, and
 * `subscriptions` has no client write grant.
 *
 * A missing row is "no" rather than an error, since most accounts have never
 * subscribed. A failed read is also "no": failing open would hand the Pro
 * features to everybody during an outage in this one query, and failing shut
 * costs a paying user one refused describe and a retry.
 *
 * And a "no" is checked with RevenueCat before it is believed, on the miss only.
 */
export async function isEntitled(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[entitlement] read failed, refusing:', error.message)
    // NOT reconciled. A failed read is our database being unwell, and asking a
    // third party about it would only add a second way for the request to hang.
    return false
  }
  if (entitledBy(data)) return true

  return await reconcileEntitlement(db, userId)
}

/**
 * The row says no. Ask RevenueCat whether it is right, and fix it if not.
 *
 * The mirror is a cache and this is the miss path. `subscriptions` is written by
 * one thing only, so anything that stops a single delivery leaves an account that
 * has paid being refused for ever with nothing that would notice: a delivery lost
 * past RevenueCat's retries, an event the ordering guard drops, a function down
 * for the ninety seconds it was delivered. Each now costs one extra HTTP call on
 * the next Pro request, and then corrects itself.
 */
export async function reconcileEntitlement(db: SupabaseClient, userId: string): Promise<boolean> {
  const store = await fetchSubscriber(userId)
  // Could not ask. The row's own verdict stands, which is a refusal.
  if (!store) return false
  if (!store.active) return false

  if (store.sandbox && !sandboxAllowed(userId)) {
    console.warn(
      `[entitlement] ${userId} is entitled in RevenueCat but only in the SANDBOX;` +
        ' REVENUECAT_SANDBOX_SUBSCRIBERS does not cover it',
    )
    return false
  }

  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: userId,
      status: store.trial ? 'trial' : 'active',
      plan: planOf(store.productId ?? undefined),
      trial_ends_at: store.trial ? store.expiresAt : null,
      current_period_end: store.expiresAt,
      store: store.store,
      product_id: store.productId,
      rc_app_user_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    // The account IS entitled — RevenueCat just said so — and failing to record
    // that is our problem rather than theirs. Let the request through and let
    // the next one try the write again.
    console.error('[entitlement] reconciled but could not write:', error.message)
    return true
  }

  console.warn(`[entitlement] reconciled ${userId} from RevenueCat; the webhook had not landed`)
  return true
}

/**
 * Throws `NotEntitled` unless the account may reach this Pro-only feature.
 *
 * Not every model path is behind this any more, which is the change freemium made
 * here. Photographing a plate is the app's whole pitch and a free account gets
 * three a day of it. What stays Pro is the paths that are worth paying for and
 * cheap to live without: describing a meal in words, correcting one with words,
 * and reading a recipe out of a photograph. The names are the same strings the
 * client's `ProFeature` union uses, so a refusal that starts on the server lands
 * in the same funnel as one the client caught first.
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
 * One claim per user-initiated pass at the model, taken at the top of the
 * endpoint before the photo is read and before the first model call. Claimed
 * afterwards, an account already at its ceiling would still get to send the
 * request that put it there.
 *
 * What counts as one: a photographed plate, a typed meal, a correction, a recipe
 * read out of a picture. One each, whatever they cost underneath. A plate that
 * takes a vision call, a verifier call and an estimate is still one scan, because
 * one scan is what the user did. `Meter` below counts the model requests
 * separately, for the logs and the bill.
 *
 * The claim is not refunded when the cascade goes badly. A scan that bottomed out
 * at the archetype floor has still spent a plate's worth of model time and the
 * user has still had an answer. Refunding would also mean deciding what "went
 * badly" means, which is a judgement the meter has no business making.
 *
 * A failed claim lets the request through, uncounted. This is the opposite call
 * from `isEntitled` above because the risk is opposite: entitlement decides
 * whether a non-paying account reaches a Pro feature at all, while this decides
 * how much anybody gets, and a database blip should not read as "you are cut off"
 * to somebody who has paid.
 */
export async function claimScan(db: SupabaseClient, userId: string): Promise<void> {
  const claim = async () =>
    await db
      .rpc('claim_scan', { p_user: userId })
      .maybeSingle<{ allowed: boolean; used: number; daily_limit: number; entitled: boolean }>()

  let { data, error } = await claim()

  if (error) {
    console.error('[quota] claim failed, allowing uncounted:', error.message)
    return
  }

  // Refused at the free ceiling, on an account the row thinks is free. That is the
  // one refusal here that might be about a lost webhook rather than about the user,
  // and it is the only path to the model that does not go through `isEntitled`,
  // since photographing a plate is free. Without this, a Pro account whose webhook
  // never landed is silently capped at three photographs a day, which is a far more
  // confusing refusal than being told to subscribe.
  //
  // Once only, and only in this direction: `reconcileEntitlement` writes nothing
  // unless RevenueCat says the account is paid.
  if (data && !data.allowed && !data.entitled && (await reconcileEntitlement(db, userId))) {
    ;({ data, error } = await claim())
    if (error) {
      console.error('[quota] re-claim failed, allowing uncounted:', error.message)
      return
    }
  }

  if (data && !data.allowed) {
    throw new ScanLimitReached(data.used, data.daily_limit, data.entitled)
  }
}

/**
 * Take one recipe review's worth of budget, or refuse.
 *
 * Not the user's scan quota, and that is the whole reason this is a second claim
 * rather than a call to the one above. The review is the app's own moderation, so
 * spending their daily allowance on it would be the app billing them for a check
 * it performs on its own behalf. What it needs instead is a ceiling that no real
 * use comes near and a loop cannot walk through, which is what a per-hour rate
 * limit is.
 *
 * Returns a boolean rather than throwing. There is one caller and it answers the
 * refusal the same way it answers every other failure in that branch.
 *
 * A failed claim lets it through, like the scan meter and for the same reason: a
 * database blip must not become a recipe nobody can publish.
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
 * Counts, and no longer refuses. It used to be the quota itself: `claim()` ran
 * before every HTTP request to the model and threw when the account was out of
 * budget for the month. That is what made the ceiling unspeakable, since a limit
 * in units of "requests" cannot be printed on a paywall. The ceiling moved to
 * `claimScan` above, counted in scans, and what is left here is the honest record
 * of what a scan actually cost us.
 *
 * Still a required argument everywhere a model is called, all the way down to
 * `chatJSON`, and that is deliberate: it keeps a new model call from being added
 * without the trace and the logs knowing about it, and it is the hook a
 * per-request budget would go back on to. `deno check` runs over every function
 * in CI, so a missed one fails the build.
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
