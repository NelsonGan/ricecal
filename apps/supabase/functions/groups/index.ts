import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { signedIn } from '../_shared/auth.ts'
import { readBoundedBytes, json as sharedJson } from '../_shared/http.ts'
import { type MessageTarget, messagePush, type PushTarget, pushMessage } from './copy.ts'

const json = (body: unknown, status = 200) =>
  sharedJson(body, status, { 'Cache-Control': 'no-store' })

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Sends the push for a nudge, an invite or a chat message the caller has just
 * made. The write itself is an RPC the app calls first, so a failure here costs
 * the push and nothing else: the board already shows the nudge, the invitee's
 * list already holds the invite, the thread already holds the message. Postgres
 * decides who hears it and marks it sent, so a retried or replayed call
 * delivers nothing twice.
 */
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405)
  const signed = await signedIn(req)
  if (signed instanceof Response) return json({ ok: false, error: 'not signed in' }, signed.status)

  let kind: 'nudge' | 'invite' | 'message'
  let id: string
  try {
    const bytes = await readBoundedBytes(req.body, 1024)
    const body = JSON.parse(new TextDecoder().decode(bytes))
    if (!['nudge', 'invite', 'message'].includes(body?.kind) || !UUID.test(body?.id ?? '')) {
      throw new Error('invalid')
    }
    kind = body.kind
    id = body.id
  } catch {
    return json({ ok: false, error: 'invalid notify request' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  try {
    const { data, error } =
      kind === 'message'
        ? await service.rpc('group_message_push_targets', { p_caller: signed.userId, p_id: id })
        : await service.rpc('group_push_targets', {
            p_caller: signed.userId,
            p_kind: kind,
            p_id: id,
          })
    if (error) throw error
    const targets = (data ?? []) as (PushTarget | MessageTarget)[]
    if (targets.length === 0) return json({ ok: true, sent: 0 })
    const messages = targets.map((target) =>
      kind === 'message'
        ? messagePush(target as MessageTarget)
        : pushMessage(kind, target as PushTarget),
    )

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    // Only needed once enhanced push security is switched on for the project.
    const token = Deno.env.get('EXPO_ACCESS_TOKEN')
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    })
    if (!response.ok) throw new Error(`expo push ${response.status}`)
    const tickets = ((await response.json())?.data ?? []) as {
      status: string
      details?: { error?: string }
    }[]
    // A phone that uninstalled the app answers DeviceNotRegistered for ever.
    const gone = targets
      .filter((_, index) => tickets[index]?.details?.error === 'DeviceNotRegistered')
      .map((target) => target.token)
    if (gone.length > 0) await service.rpc('forget_push_tokens', { p_tokens: gone })
    return json({ ok: true, sent: tickets.filter((ticket) => ticket.status === 'ok').length })
  } catch (error) {
    console.error('[groups] push unavailable', error instanceof Error ? error.message : error)
    return json({ ok: false, error: 'push unavailable' }, 502)
  }
})
