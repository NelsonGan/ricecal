// The webhook that fills `subscriptions`.
//
// RevenueCat is the source of truth for what an account is entitled to, and this
// is the only thing that writes our mirror. Everything else reads that table,
// including `requireEntitlement`, which decides whether a request reaches the
// model at all: without this function the table stays empty and the paywall
// refuses everybody, including the people who have paid.
//
// A mirror rather than asking RevenueCat per request, which would make a scan two
// HTTP calls to two third parties before any work started, and would be
// unavailable exactly when RevenueCat is down.
//
// The client cannot write here, enforced by grants rather than by this file:
// `subscriptions` has no insert or update grant for `authenticated`. This
// function holds the service-role key, which the app never sees.
//
// `verify_jwt = false`, because RevenueCat has no Supabase JWT to send. It
// authenticates with a shared secret read from `REVENUECAT_WEBHOOK_TOKEN`, and
// with no token configured the endpoint refuses every request: an unconfigured
// secret must not be an open door onto the table that decides who has paid.

import { createClient } from '@supabase/supabase-js'
import { syncFromStore } from '../_shared/entitlement.ts'
import { json } from '../_shared/http.ts'
import {
  accountNoLongerExists,
  at,
  ENTITLEMENT,
  isStale,
  needsStoreCheck,
  planOf,
  type RevenueCatEvent,
  sandboxAllowed,
  statusFor,
  transferParties,
} from '../_shared/revenuecat.ts'

/**
 * A real uuid rather than "36 characters of hex and dashes". The loose version
 * accepted strings Postgres rejects with 22P02, so a malformed id answered 500,
 * which is the retry signal: RevenueCat redelivered it on a backoff for days.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Constant-time comparison of the presented token against the secret. A plain
 * `!==` returns as soon as two bytes differ, which over enough samples leaks how
 * much of the secret a guess got right. Both sides are hashed to a fixed 32
 * bytes, so the loop reveals nothing about the token's length either.
 */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(presented)))
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(expected)))
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

/**
 * Settle a CANCELLATION or TRANSFER by asking RevenueCat about each account and
 * writing its answer (`needsStoreCheck` says why the event cannot be read
 * directly). A 500 when RevenueCat cannot be asked or the write fails, so
 * RevenueCat delivers the event again rather than the refund being lost.
 */
async function settleFromStore(event: RevenueCatEvent, userIds: string[]): Promise<Response> {
  // No key is a setting to fix, and said so loudly. Still a 500, so RevenueCat
  // keeps delivering: a key restored within its retry window still applies the
  // refund, where a 200 would have dropped it for good.
  if (!Deno.env.get('REVENUECAT_API_KEY')) {
    console.error(
      `[revenuecat] REVENUECAT_API_KEY is not set, so a ${event.type} cannot be checked;` +
        ' set it, or refunds and transfers keep Pro',
    )
    return json({ ok: false, error: 'REVENUECAT_API_KEY is not set' }, 500)
  }
  const db = serviceClient()
  const happenedAt = at(event.event_timestamp_ms)
  const settled: Record<string, string> = {}
  for (const userId of userIds) {
    let verdict: Awaited<ReturnType<typeof syncFromStore>>
    try {
      verdict = await syncFromStore(db, userId, happenedAt)
    } catch (error) {
      if (accountNoLongerExists(error as { code?: string; message?: string })) {
        settled[userId] = 'account no longer exists'
        continue
      }
      console.error(`[revenuecat] ${event.type} write failed:`, (error as Error).message)
      return json({ ok: false, error: 'could not record the event' }, 500)
    }
    if (!verdict) {
      console.error(`[revenuecat] ${event.type} for ${userId}: could not ask RevenueCat; retrying`)
      return json({ ok: false, error: 'could not confirm with RevenueCat' }, 500)
    }
    settled[userId] = verdict
  }
  console.log(
    `[revenuecat] ${event.type}${event.cancel_reason ? ` (${event.cancel_reason})` : ''}:`,
    JSON.stringify(settled),
  )
  return json({ ok: true, settled })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN')
  if (!expected) {
    console.error('[revenuecat] REVENUECAT_WEBHOOK_TOKEN is not set; refusing')
    return json({ ok: false, error: 'webhook is not configured' }, 503)
  }
  // RevenueCat sends the value verbatim in the Authorization header, so it is
  // compared verbatim. `Bearer ` is tolerated because the dashboard field
  // accepts either and the difference is invisible until deliveries start
  // failing in production.
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!(await tokenMatches(presented, expected))) {
    return json({ ok: false, error: 'bad token' }, 401)
  }

  let payload: { event?: RevenueCatEvent }
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  const event = payload.event
  if (!event) return json({ ok: false, error: 'no event' }, 400)

  // A TRANSFER names its accounts in `transferred_from` / `transferred_to` and
  // carries no `app_user_id`, so it is settled here, before the checks below
  // that need one. Both ends are asked: the accounts it left lose Pro, the one
  // it went to gains it. The sandbox rule is applied per account by
  // `syncFromStore`, which never grants on a sandbox purchase it does not cover.
  if (event.type === 'TRANSFER') {
    const ids = transferParties(event).filter((id) => UUID.test(id))
    if (ids.length === 0) return json({ ok: true, ignored: 'transfer between no accounts of ours' })
    return await settleFromStore(event, ids)
  }

  // `app_user_id` is the Supabase user id the app told RevenueCat about (see
  // `identifyPurchaser`). An anonymous id means the SDK was configured before
  // anybody signed in and there is no account to credit: 200 so RevenueCat stops
  // retrying, and a log line because the client's identify step regressed.
  //
  // Resolved before the environment check, which has to know who the event is
  // about. See the allow-list below.
  const appUserId = event.app_user_id ?? event.original_app_user_id ?? ''
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    console.warn('[revenuecat] event with no account to credit:', appUserId)
    return json({ ok: true, ignored: 'anonymous app_user_id' })
  }
  if (!UUID.test(appUserId)) {
    console.warn('[revenuecat] app_user_id is not a user id:', appUserId)
    return json({ ok: true, ignored: 'app_user_id is not a uuid' })
  }

  // A sandbox purchase is free and must not grant the real thing. RevenueCat
  // forwards sandbox events to the production webhook by default, and a sandbox
  // buy carries a genuine Supabase user id, so without this an INITIAL_PURCHASE
  // writes `status = 'active'` and unlocks every metered model path for nothing.
  // Guarded on a defined non-production value rather than `!== 'PRODUCTION'`, so
  // a payload omitting the field is still processed.
  //
  // The rule alone made the paid path untestable: every way of buying this app
  // outside the App Store's own checkout is a sandbox transaction, so the
  // pipeline could never be exercised end to end, and the symptom is
  // indistinguishable from the webhook being broken.
  //
  // `sandboxPolicy` decides now, and is currently `*`. Read the warning on it
  // before narrowing or widening that.
  //
  // Either way it says so in the log. The drop used to be silent, and a dropped
  // sandbox event and a delivery that never arrived leave the same trace.
  if (event.environment && event.environment !== 'PRODUCTION') {
    if (!sandboxAllowed(appUserId)) {
      console.warn(
        `[revenuecat] ignoring a ${event.environment} ${event.type} for ${appUserId};` +
          ' REVENUECAT_SANDBOX_SUBSCRIBERS does not cover it',
      )
      return json({ ok: true, ignored: `${event.environment} environment` })
    }
    console.warn(`[revenuecat] granting on a ${event.environment} ${event.type} for ${appUserId}`)
  }

  // An event about a different entitlement is not ours to act on. An empty
  // list is allowed through: EXPIRATION events do not always carry one, and
  // dropping those would leave lapsed accounts entitled for good.
  const entitlements = event.entitlement_ids ?? []
  if (entitlements.length > 0 && !entitlements.includes(ENTITLEMENT)) {
    return json({ ok: true, ignored: `not the ${ENTITLEMENT} entitlement` })
  }

  // A CANCELLATION is either "auto-renew off" or "refunded", and only RevenueCat
  // knows which. Asking it keeps the first on Pro until its period ends and
  // takes the second, lifetime included, off now.
  if (needsStoreCheck(event)) return await settleFromStore(event, [appUserId])

  const status = statusFor(event)
  if (!status) return json({ ok: true, ignored: `nothing to do for ${event.type}` })

  const db = serviceClient()

  const plan = planOf(event.product_id)
  const expires = at(event.expiration_at_ms)
  const happenedAt = at(event.event_timestamp_ms)

  // Out-of-order delivery, ordered by when each event happened.
  //
  // See `isStale` for why this is not the period-end comparison it used to be:
  // that test could not tell a delayed event from one ending a subscription
  // early, so it dropped every refund and left those accounts entitled for good.
  //
  // Checked for every event rather than only the downgrades: a stale RENEWAL on
  // top of a newer EXPIRATION is the same bug in the direction that costs money.
  const { data: current } = await db
    .from('subscriptions')
    .select('last_event_at')
    .eq('user_id', appUserId)
    .maybeSingle()

  if (isStale(event, current?.last_event_at)) {
    console.warn('[revenuecat] ignoring an event overtaken by a newer one:', event.type)
    return json({ ok: true, ignored: 'stale event' })
  }

  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: appUserId,
      status,
      plan,
      // Only when this period IS the trial. Written unconditionally it would
      // keep claiming a trial end date months into a paid subscription, and
      // the reminder screen renders exactly that field.
      trial_ends_at: status === 'trial' ? expires : null,
      // Null for lifetime, which is the honest answer: nothing renews, so
      // there is no period to end. RevenueCat sends no expiry for it either.
      current_period_end: expires,
      store: event.store?.toLowerCase() ?? null,
      product_id: event.product_id ?? null,
      rc_app_user_id: appUserId,
      // What the next delivery is ordered against, taken from the payload rather
      // than the clock, which differ by exactly the backoff this guards against.
      //
      // Omitted rather than nulled when the payload carries no timestamp:
      // PostgREST builds its `on conflict do update` column list from the keys it
      // is given, so leaving it out keeps the ordering the row already had.
      ...(happenedAt ? { last_event_at: happenedAt } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    // RevenueCat can deliver or retry an event after that account has been
    // deleted; there is then nobody left to entitle, and a 500 only asks it to
    // retry forever. Match the constraint as well as the SQLSTATE so a future,
    // unrelated foreign key still gets the retry it needs.
    if (accountNoLongerExists(error)) {
      console.warn('[revenuecat] ignoring an event for an account that no longer exists')
      return json({ ok: true, ignored: 'account no longer exists' })
    }
    // A 500 so RevenueCat RETRIES. This is the one failure here worth retrying:
    // the event was real and we could not record it, and dropping it silently
    // leaves somebody who has paid looking unsubscribed.
    console.error('[revenuecat] write failed:', error.message)
    return json({ ok: false, error: 'could not record the event' }, 500)
  }

  return json({ ok: true, status, plan })
})
