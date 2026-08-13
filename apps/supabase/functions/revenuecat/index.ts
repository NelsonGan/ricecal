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

import { at, ENTITLEMENT, planOf, type RevenueCatEvent, statusFor } from '../_shared/revenuecat.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  if (presented !== expected) return json({ ok: false, error: 'bad token' }, 401)

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
  const appUserId = event.app_user_id ?? event.original_app_user_id ?? ''
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    console.warn('[revenuecat] event with no account to credit:', appUserId)
    return json({ ok: true, ignored: 'anonymous app_user_id' })
  }
  if (!/^[0-9a-f-]{36}$/i.test(appUserId)) {
    console.warn('[revenuecat] app_user_id is not a user id:', appUserId)
    return json({ ok: true, ignored: 'app_user_id is not a uuid' })
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
