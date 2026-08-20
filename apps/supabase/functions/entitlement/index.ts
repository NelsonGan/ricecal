// "The store says I have paid and the app says I have not." One endpoint that
// settles it, by asking RevenueCat.
//
// WHY THE CLIENT NEEDS TO BE ABLE TO ASK. `subscriptions` is a cache of a
// webhook, and `reconcileEntitlement` already refills it on a miss — but only
// from inside a Pro-gated request, which is the wrong moment for two of the
// things the app draws from that row. The scans-left line under the viewfinder
// and the plan on the Me tab are read straight out of Postgres by the client,
// so an account whose webhook was lost sees "3 scans left today" and "Free
// plan" until it happens to press a Pro button. This is how it stops.
//
// IT GRANTS NOTHING ON THE CALLER'S SAY-SO. The body is empty and there is
// nothing in it to trust: the account is resolved from a verified JWT and the
// answer comes from RevenueCat, which is the same authority the webhook speaks
// for. The worst a caller can do by hammering this is ask RevenueCat about
// themselves.
//
// `verify_jwt = false` and the header is inspected here, for the same reason as
// every other function in this directory: a failure then says which half broke.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { entitledBy, reconcileEntitlement } from '../_shared/entitlement.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: auth, error: authError } = await anonClient.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) return json({ ok: false, error: 'not signed in' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // The row first. Almost every call lands here — the client only asks when it
  // has seen a disagreement, and by the time the request arrives the webhook has
  // often resolved it — and answering from the row costs nothing.
  const { data: row } = await db
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (entitledBy(row)) return json({ ok: true, entitled: true, reconciled: false })

  const reconciled = await reconcileEntitlement(db, userId)
  // 200 either way. "You are not entitled" is an ANSWER rather than a failure,
  // and the caller is a background sync that would otherwise log an error every
  // time it checked on a free account.
  return json({ ok: true, entitled: reconciled, reconciled })
})
