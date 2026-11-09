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
import { type AiContext, captureGeneration, type Generation } from './posthog.ts'
import { planOf, sandboxAllowed } from './revenuecat.ts'
import { fetchSubscriber, type StoreSubscriber } from './revenuecat-api.ts'

/** Statuses that may reach the model. Everything else is behind the paywall. */
const ENTITLED = new Set(['trial', 'active'])

/**
 * The whole rule: an entitled status, and a period that has not run out.
 *
 * The date is part of it. On the status alone, a delivery that failed past
 * RevenueCat's retries leaves a row saying `active` with an expiry in the past
 * and an account reaching the model for ever. It does not replace the webhook,
 * which is the only thing that knows a subscription ended early; it bounds the
 * damage of never hearing.
 *
 * Null is no expiry rather than an expired one: lifetime renews never, so
 * reading it the other way would refuse the one plan that cannot lapse.
 *
 * Mirrored by `isEntitledRow` in `data/subscription.ts`, either side of the
 * Deno / React Native line, and the two change together.
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
 * Refused because the account is not subscribed. Separate from the quota error
 * below, so the endpoints can answer with different codes.
 *
 * `feature` says which Pro-only thing was asked for, because the app's paywall
 * tracks what refused it, which is the only way to find out which capability
 * sells the app.
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
 * Refused because the account has spent today's scans. `entitled` decides what
 * the app says: a free account has something to buy and is shown the paywall,
 * where a Pro account at fifty is asked to get in touch. Two messages behind one
 * status code, which the client cannot tell apart from the numbers alone.
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
 * Is this account entitled right now? Read as `service_role`: the caller is
 * already resolved from their own JWT, and `subscriptions` has no client write
 * grant.
 *
 * A missing row is "no" rather than an error, and so is a failed read: failing
 * open would hand Pro to everybody during an outage in this one query, where
 * failing shut costs a paying user one refused describe and a retry.
 *
 * A "no" is checked with RevenueCat before it is believed, on the miss only.
 */
export async function isEntitled(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('subscriptions')
    .select(ROW)
    .eq('user_id', userId)
    .maybeSingle<SubscriptionRow>()

  if (error) {
    console.error('[entitlement] read failed, refusing:', error.message)
    // NOT reconciled. A failed read is our database being unwell, and asking a
    // third party about it would only add a second way for the request to hang.
    return false
  }
  if (data && entitledBy(data)) return await stillEntitled(db, userId, data)

  return await reconcileEntitlement(db, userId)
}

/** The columns every entitlement read takes. */
export const ROW = 'status, plan, current_period_end, last_event_at, rc_app_user_id, updated_at'

export type SubscriptionRow = {
  status?: string | null
  plan?: string | null
  current_period_end?: string | null
  last_event_at?: string | null
  rc_app_user_id?: string | null
  /** `not null default now()`, and bumped by a trigger on every write. */
  updated_at?: string
}

/**
 * How long a lifetime row is believed without asking RevenueCat again.
 *
 * Every other row has an end date that bounds a missed ending. A lifetime row
 * has none, so one lost refund or transfer delivery kept that account on Pro
 * for good. A week of grace costs at most one extra request a week per lifetime
 * account, on the request path, which is where the answer is needed.
 */
export const LIFETIME_RECHECK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A lifetime row last written over a week ago: no end date, and written from
 * RevenueCat (`rc_app_user_id` set), which only sends no expiry for a one-off
 * purchase. Keyed on where the row came from rather than on `plan`, which is
 * null for a product id `planOf` cannot read. A Pro row made by hand (the
 * README's one-row fix) has no RevenueCat id and RevenueCat knows nothing about
 * it, so it is never asked about and never taken away.
 */
export function lifetimeDueForCheck(
  row: SubscriptionRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row?.rc_app_user_id || row.current_period_end) return false
  const written = Date.parse(row.updated_at ?? '')
  // No timestamp to go on is due rather than exempt.
  return !Number.isFinite(written) || now.getTime() - written > LIFETIME_RECHECK_MS
}

/**
 * When each account's lifetime check last failed, so an outage is asked about
 * once an hour. Per function instance: a fresh instance asks once more, which
 * bounds the cost without a table to keep it in.
 */
const failedChecks = new Map<string, number>()
const RETRY_FAILED_CHECK_MS = 60 * 60 * 1000

/** Forgets every remembered failure. For tests. */
export function forgetFailedChecks(): void {
  failedChecks.clear()
}

function noteFailedCheck(userId: string) {
  const now = Date.now()
  if (failedChecks.size > 1000) {
    for (const [id, at] of failedChecks)
      if (now - at > RETRY_FAILED_CHECK_MS) failedChecks.delete(id)
  }
  failedChecks.set(userId, now)
}

/**
 * An entitled row, re-checked with RevenueCat when it is a lifetime row that is
 * due (`lifetimeDueForCheck`). Every path that hands out Pro calls this, so a
 * refund that never arrived is caught wherever the account turns up next.
 *
 * Only a definite "no" from RevenueCat takes Pro away. Could not ask, or could
 * not write: the row stands, and the next try waits an hour, so an outage does
 * not put RevenueCat's timeout on every request.
 */
export async function stillEntitled(
  db: SupabaseClient,
  userId: string,
  row: SubscriptionRow,
): Promise<boolean> {
  if (!lifetimeDueForCheck(row)) return true
  const failedAt = failedChecks.get(userId)
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_FAILED_CHECK_MS) return true

  const verdict = await syncFromStore(db, userId).catch((error) => {
    console.error('[entitlement] lifetime re-check failed:', (error as Error).message)
    return null
  })
  if (verdict === null) noteFailedCheck(userId)
  else failedChecks.delete(userId)
  return verdict !== 'not_entitled'
}

/**
 * Write what RevenueCat says now over the mirror, for one account.
 *
 * Answers `entitled` or `not_entitled` once the row matches RevenueCat, and
 * null when RevenueCat could not be asked, which the caller must not read as
 * "no". Throws when the write fails, so the webhook can ask for a retry.
 *
 * On "not entitled", a row that is entitled now is expired as of now; one at
 * billing retry, or past its end with an `active` status nobody corrected, is
 * expired with its end date left as it was, since retention reads that date; an
 * expired row is left alone. With no row at all, an event still writes an
 * `expired` row carrying its time. `last_event_at` moves forward in every case,
 * so an older event delivered later is still recognised as stale.
 *
 * `upwardOnly` is the miss path (`reconcileEntitlement`): it writes on
 * "entitled" and on nothing else, so a timeout can never read as a refund.
 *
 * Each write lands only over the row as it was read (`updated_at` unchanged),
 * so an event the webhook applies in between is not overwritten with an older
 * answer. On a clash it asks again once, then gives up with an error.
 */
export async function syncFromStore(
  db: SupabaseClient,
  userId: string,
  happenedAt: string | null = null,
  { upwardOnly = false }: { upwardOnly?: boolean } = {},
): Promise<'entitled' | 'not_entitled' | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const store = await fetchSubscriber(userId)
    if (!store) return null

    const sandboxRefused = store.active && store.sandbox && !sandboxAllowed(userId)
    if (sandboxRefused) {
      console.warn(
        `[entitlement] ${userId} is entitled in RevenueCat but only in the SANDBOX;` +
          ' REVENUECAT_SANDBOX_SUBSCRIBERS does not cover it',
      )
    }
    const entitled = store.active && !sandboxRefused
    if (!entitled && upwardOnly) return 'not_entitled'

    const { data: current, error: readError } = await db
      .from('subscriptions')
      .select(ROW)
      .eq('user_id', userId)
      .maybeSingle<SubscriptionRow>()
    if (readError) throw new Error(`could not read the subscription: ${readError.message}`)

    const lastEventAt = laterOf(current?.last_event_at ?? null, happenedAt)
    const ordering: Record<string, string> = lastEventAt ? { last_event_at: lastEventAt } : {}

    if (entitled) {
      const landed = await writeEntitled(db, userId, store, {
        extra: ordering,
        expect: current?.updated_at ?? 'absent',
      })
      if (landed) return 'entitled'
      continue
    }

    if (!current) {
      // Nothing to take away, but the event still has to be remembered: a refund
      // can arrive before the purchase it refunds, and with no `last_event_at`
      // the late purchase would not look stale and would grant Pro.
      if (!happenedAt) return 'not_entitled'
      const { error } = await db.from('subscriptions').insert({
        user_id: userId,
        status: 'expired',
        rc_app_user_id: userId,
        last_event_at: happenedAt,
      })
      // Somebody wrote the row first: read it again and settle against that.
      if (error?.code === '23505') continue
      if (error) {
        throw Object.assign(new Error(`could not record the event: ${error.message}`), {
          code: error.code,
        })
      }
      return 'not_entitled'
    }
    const now = new Date().toISOString()
    const patch: Record<string, string | null> = entitledBy(current)
      ? // Ended now, as far as anyone can say: a refund has no period to run out.
        { status: 'expired', trial_ends_at: null, current_period_end: now }
      : LAPSING.has(current.status ?? '')
        ? { status: 'expired', trial_ends_at: null }
        : {}
    if (lastEventAt && lastEventAt !== current.last_event_at) patch.last_event_at = lastEventAt
    if (Object.keys(patch).length === 0) return 'not_entitled'

    const { data: written, error } = await db
      .from('subscriptions')
      .update({ ...patch, updated_at: now })
      .eq('user_id', userId)
      .eq('updated_at', current.updated_at ?? '')
      .select('user_id')
    if (error) {
      throw Object.assign(new Error(`could not expire the subscription: ${error.message}`), {
        code: error.code,
      })
    }
    if ((written ?? []).length > 0) {
      if (patch.status) {
        console.warn(
          `[entitlement] ${userId} is not entitled in RevenueCat; the mirror now says expired`,
        )
      }
      return 'not_entitled'
    }
  }
  throw new Error('the subscription kept changing while it was being settled')
}

/** Statuses that still claim something, and become `expired` on a definite "no". */
const LAPSING = new Set(['active', 'trial', 'billing_retry'])

/** The later of two ISO timestamps, either of which may be missing. */
function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(b) > Date.parse(a) ? b : a
}

/**
 * The row RevenueCat's "entitled" answer becomes. Throws if it cannot be written.
 *
 * `expect` is the `updated_at` the row was read with, and the write lands only
 * over that row (`'absent'`: only if there is none yet). False means somebody
 * wrote first, and the caller asks again.
 *
 * Store and product are only written when RevenueCat names them. A one-off
 * purchase has no subscription entry, so its store comes back null, and
 * writing that over the store the webhook recorded would blank it every week.
 */
async function writeEntitled(
  db: SupabaseClient,
  userId: string,
  store: StoreSubscriber,
  options: { extra?: Record<string, string>; expect: string | 'absent' },
): Promise<boolean> {
  const values = {
    status: store.trial ? 'trial' : 'active',
    plan: planOf(store.productId ?? undefined),
    trial_ends_at: store.trial ? store.expiresAt : null,
    current_period_end: store.expiresAt,
    ...(store.store ? { store: store.store } : {}),
    ...(store.productId ? { product_id: store.productId } : {}),
    rc_app_user_id: userId,
    ...options.extra,
    updated_at: new Date().toISOString(),
  }
  // The code travels with an error, so the webhook can tell a deleted account apart.
  const fail = (error: { message: string; code?: string }) => {
    throw Object.assign(new Error(error.message), { code: error.code })
  }

  if (options.expect === 'absent') {
    const { error } = await db.from('subscriptions').insert({ user_id: userId, ...values })
    // Somebody inserted it first: their row stands, and the caller asks again.
    if (error?.code === '23505') return false
    if (error) fail(error)
    return true
  }
  const { data, error } = await db
    .from('subscriptions')
    .update(values)
    .eq('user_id', userId)
    .eq('updated_at', options.expect)
    .select('user_id')
  if (error) fail(error)
  return (data ?? []).length > 0
}

/**
 * The row says no. Ask RevenueCat whether it is right, and fix it if not.
 *
 * The mirror is a cache and this is the miss path. `subscriptions` is written by
 * one thing only, so anything that stops a single delivery leaves an account that
 * has paid refused for ever with nothing to notice. Each such case now costs one
 * extra HTTP call on the next Pro request, and then corrects itself.
 *
 * Upward only (`syncFromStore`'s `upwardOnly`), and through the same guarded
 * write, so a refund the webhook records while RevenueCat is being asked is not
 * overwritten with the older "active".
 */
export async function reconcileEntitlement(db: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const verdict = await syncFromStore(db, userId, null, { upwardOnly: true })
    if (verdict === 'entitled') {
      console.warn(`[entitlement] reconciled ${userId} from RevenueCat; the webhook had not landed`)
    }
    // Null is "could not ask": the row's own verdict stands, which is a refusal.
    return verdict === 'entitled'
  } catch (error) {
    // Only reached once RevenueCat has said the account IS entitled (upward-only
    // never writes otherwise), so failing to record that is our problem rather
    // than theirs. Let the request through; the next one tries the write again.
    console.error('[entitlement] reconciled but could not write:', (error as Error).message)
    return true
  }
}

/**
 * Throws `NotEntitled` unless the account may reach this Pro-only feature.
 *
 * Not every model path is behind this. Photographing a plate is the app's pitch
 * and a free account gets three a day; what stays Pro is describing a meal in
 * words, correcting one with words, and reading a recipe out of a photograph.
 * The names are the strings the client's `ProFeature` union uses, so both kinds
 * of refusal land in the same funnel.
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
 * endpoint before the photo is read: claimed afterwards, an account already at
 * its ceiling would still get to send the request that put it there.
 *
 * One each for a photographed plate, a typed meal, a correction and a recipe
 * read, whatever they cost underneath, because one scan is what the user did.
 * `Meter` below counts the model requests separately.
 *
 * The claim is not refunded when the cascade goes badly: a scan the cascade could
 * not price has still spent a plate's worth of model time, and refunding would
 * mean deciding what "went badly" means.
 *
 * A failed claim lets the request through, uncounted, unlike `isEntitled`: that
 * decides whether a non-paying account reaches Pro at all, where this decides how
 * much anybody gets, and a database blip must not read as "you are cut off".
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

  // Refused at the free ceiling, on an account the row thinks is free: the one
  // refusal here that might be about a lost webhook, and the only path to the
  // model that skips `isEntitled`, since photographing a plate is free. Without
  // it, a Pro account whose webhook never landed is silently capped at three
  // photographs a day.
  //
  // Once, and only in this direction: `reconcileEntitlement` writes nothing
  // unless RevenueCat says the account is paid.
  if (data && !data.allowed && !data.entitled && (await reconcileEntitlement(db, userId))) {
    ;({ data, error } = await claim())
    if (error) {
      console.error('[quota] re-claim failed, allowing uncounted:', error.message)
      return
    }
  }

  // A Pro claim on a lifetime row due its weekly check is checked here too:
  // photographing a plate is the one model path that never goes through
  // `isEntitled`, so `claim_scan` would otherwise keep a refunded lifetime on
  // the Pro ceiling for good. In the background, since this scan's claim is
  // already made and a refund found here applies from the next one.
  if (data?.entitled) inBackground(recheckLifetime(db, userId))

  if (data && !data.allowed) {
    throw new ScanLimitReached(data.used, data.daily_limit, data.entitled)
  }
}

/** When `recheckLifetime` may next read each account's row, per instance. */
const nextLook = new Map<string, number>()
const LOOK_AGAIN_MS = 60 * 60 * 1000
/** A row with an end date can never be due, so it is not read again for a day. */
const NOT_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * The lifetime check for a scan: read the row and run `stillEntitled` if it is
 * due. At most once an hour per account per instance, and once a day for a
 * subscription, whose end date means it is never due: a Pro account's scans do
 * not each pay for a second read of `subscriptions`.
 */
async function recheckLifetime(db: SupabaseClient, userId: string): Promise<void> {
  const now = Date.now()
  if ((nextLook.get(userId) ?? 0) > now) return
  if (nextLook.size > 1000) {
    for (const [id, at] of nextLook) if (at <= now) nextLook.delete(id)
  }
  nextLook.set(userId, now + LOOK_AGAIN_MS)
  const { data: row } = await db
    .from('subscriptions')
    .select(ROW)
    .eq('user_id', userId)
    .maybeSingle<SubscriptionRow>()
  if (row?.current_period_end) nextLook.set(userId, now + NOT_LIFETIME_MS)
  if (row && lifetimeDueForCheck(row)) await stillEntitled(db, userId, row)
}

/** Runs work past the response where the edge runtime allows it, and never throws. */
function inBackground(work: Promise<unknown>): void {
  const settled = work.catch((error) =>
    console.error('[entitlement] background check failed:', (error as Error).message),
  )
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  runtime?.waitUntil?.(settled)
}

/**
 * Take one recipe review's worth of budget, or refuse.
 *
 * Not the user's scan quota, which is why this is a second claim: the review is
 * the app's own moderation, so spending their allowance on it would be billing
 * them for a check performed on its own behalf. What it needs is a ceiling no
 * real use comes near and a loop cannot walk through.
 *
 * Returns a boolean rather than throwing: the one caller answers this refusal the
 * way it answers every other failure in that branch.
 *
 * A failed claim lets it through, like the scan meter: a database blip must not
 * become a recipe nobody can publish.
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
 * How many requests to OpenRouter one invocation made. Counts, and no longer
 * refuses: it used to be the quota itself, which made the ceiling unspeakable,
 * since a limit in units of "requests" cannot be printed on a paywall. The
 * ceiling moved to `claimScan`, counted in scans, and this is the record of what
 * a scan cost us.
 *
 * Still a required argument everywhere a model is called, down to `chatJSON`, so
 * a new model call cannot be added without the trace knowing about it. `deno
 * check` runs over every function in CI, so a missed one fails the build.
 */
export type Meter = {
  /** Counts one HTTP request to OpenRouter. */
  record(): void
  /** How many requests this invocation has made. For logs and the debug trace. */
  spent(): number
  /**
   * Reports one finished request to PostHog AI observability (`posthog.ts`).
   * A meter created without an `AiContext` reports nothing, which is what a
   * test or a local script wants.
   */
  observe(generation: Generation): void
}

export function createMeter(ai?: AiContext): Meter {
  let spent = 0
  // One trace per invocation, so every request this scan makes reads as one
  // story in PostHog.
  const traceId = crypto.randomUUID()
  return {
    spent: () => spent,
    record: () => {
      spent += 1
    },
    observe: (generation) => {
      if (ai) captureGeneration(ai, traceId, generation)
    },
  }
}
