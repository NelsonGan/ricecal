// The webhook that fills `subscriptions`.
//
// RevenueCat is the source of truth for what an account is entitled to, and
// this is the only thing that writes our mirror of it. Everything else in the
// app READS that table: the paywall, the router, and — the half that matters —
// `requireEntitlement` in the edge functions, which decides whether a request
// reaches the model at all. Without this function the table stays empty, every
// account reads as `none`, and the paywall refuses everybody including the
// people who have paid.
//
// WHY A MIRROR AT ALL, rather than asking RevenueCat per request: a scan would
// then be two HTTP calls to two third parties before any work started, and the
// answer would be unavailable exactly when RevenueCat is down. A row in our own
// Postgres makes "may this user scan" a join, and makes a future reminder job
// able to ask the same question with no client and no network.
//
// THE CLIENT CANNOT WRITE HERE, and that is enforced by grants rather than by
// this file: `subscriptions` has no insert or update grant for
// `authenticated` at all. This function holds the service-role key, which the
// app never sees.
//
// `verify_jwt = false` because RevenueCat has no Supabase JWT to send. It
// authenticates with a shared secret in the Authorization header, set in the
// RevenueCat dashboard and read here from `REVENUECAT_WEBHOOK_TOKEN`. With no
// token configured the endpoint refuses EVERY request rather than accepting
// every request, because the failure of an unconfigured secret must not be an
// open door onto the one table that decides who has paid.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import {
  at,
  ENTITLEMENT,
  isStale,
  planOf,
  type RevenueCatEvent,
  sandboxAllowed,
  statusFor,
} from '../_shared/revenuecat.ts'

/**
 * A real uuid, not "36 characters of hex and dashes".
 *
 * The loose version accepted strings Postgres rejects with 22P02, and a
 * malformed id therefore answered 500 — which is the retry signal, so
 * RevenueCat would redeliver the same unparseable event on a backoff for days.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Constant-time comparison of the presented token against the secret.
 *
 * A plain `!==` returns as soon as two bytes differ, which leaks — over enough
 * samples — how much of the secret a guess got right, one byte at a time. This
 * is the one secret whose disclosure hands over the whole entitlement table, so
 * it is worth closing. Both sides are hashed to a fixed 32 bytes first, so the
 * loop is always the same length and reveals nothing about the token's length
 * either.
 */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(presented)))
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(expected)))
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
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

  // `app_user_id` is the id the app told RevenueCat about, which is the
  // Supabase user id — see `identifyPurchaser` in the client. An anonymous id
  // ($RCAnonymousID:...) means the SDK was configured before anybody signed
  // in, and there is no account to credit: 200 so RevenueCat stops retrying,
  // and a log line because it means the client's identify step regressed.
  //
  // RESOLVED BEFORE THE ENVIRONMENT CHECK, because that check now has to know
  // WHO the event is about — see the allow-list below.
  const appUserId = event.app_user_id ?? event.original_app_user_id ?? ''
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    console.warn('[revenuecat] event with no account to credit:', appUserId)
    return json({ ok: true, ignored: 'anonymous app_user_id' })
  }
  if (!UUID.test(appUserId)) {
    console.warn('[revenuecat] app_user_id is not a user id:', appUserId)
    return json({ ok: true, ignored: 'app_user_id is not a uuid' })
  }

  // A SANDBOX PURCHASE IS FREE, and it must not grant the real thing. RevenueCat
  // forwards sandbox events to the production webhook by default, and a sandbox
  // buy carries a genuine Supabase user id (the tester signed into the real app)
  // — so without this an INITIAL_PURCHASE made against Apple's or Play's sandbox
  // writes `status = 'active'` and unlocks every metered model path for nothing.
  // Only `PRODUCTION` is a real transaction. Guarded on a defined non-production
  // value rather than on `!== 'PRODUCTION'`, so a payload that omits the field
  // entirely is still processed rather than silently dropping real events.
  //
  // EXCEPT THAT THE RULE ALONE MADE THE PAID PATH UNTESTABLE. Every way of
  // buying this app outside the App Store's own checkout is a sandbox
  // transaction — a sandbox Apple ID, a TestFlight build, RevenueCat's test
  // store — so with a flat refusal the purchase pipeline could never be
  // exercised end to end: the store confirms, RevenueCat records it, and our own
  // table never hears. The symptom is the one this function exists to prevent,
  // "I subscribed and it still says free plan", and from the outside it is
  // indistinguishable from the webhook being broken.
  //
  // `sandboxPolicy` is what decides now, and it is currently `*` — everybody.
  // Read the warning on it before narrowing or widening that.
  //
  // AND IT SAYS SO IN THE LOG EITHER WAY. The drop used to be silent, which is
  // most of why this took an afternoon to place: a dropped sandbox event and a
  // delivery that never arrived leave exactly the same trace, which is none.
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

  const status = statusFor(event)
  if (!status) return json({ ok: true, ignored: `nothing to do for ${event.type}` })

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const plan = planOf(event.product_id)
  const expires = at(event.expiration_at_ms)
  const happenedAt = at(event.event_timestamp_ms)

  // OUT-OF-ORDER DELIVERY, ordered by when each event HAPPENED.
  //
  // Read `isStale` for why this is not the period-end comparison it used to be:
  // in short, that test could not tell a delayed event from one that ends a
  // subscription early, so it dropped every refund and every revoked promotional
  // grant and left those accounts entitled for good.
  //
  // Checked for EVERY event rather than only for the downgrades. A stale
  // RENEWAL landing on top of a newer EXPIRATION is the same bug pointing the
  // other way, and it is the direction that costs money rather than goodwill.
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
      // What the NEXT delivery is ordered against. Taken from the payload
      // rather than from the clock, because the two differ by exactly the
      // backoff this guards against.
      //
      // OMITTED rather than nulled when the payload carries no timestamp:
      // PostgREST builds its `on conflict do update` column list from the keys
      // it is given, so leaving it out keeps whatever ordering the row already
      // had. Written as null it would erase that, and the next genuinely stale
      // delivery would have nothing left to be measured against.
      ...(happenedAt ? { last_event_at: happenedAt } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    // A 500 so RevenueCat RETRIES. This is the one failure here worth retrying:
    // the event was real and we could not record it, and dropping it silently
    // leaves somebody who has paid looking unsubscribed.
    console.error('[revenuecat] write failed:', error.message)
    return json({ ok: false, error: 'could not record the event' }, 500)
  }

  return json({ ok: true, status, plan })
})
