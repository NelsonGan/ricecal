import { createClient } from '@supabase/supabase-js'
import { signedIn } from '../_shared/auth.ts'
import { readBoundedBytes, json as sharedJson } from '../_shared/http.ts'
import { type MessageTarget, messagePush, type PushTarget, pushMessage } from './copy.ts'

const json = (body: unknown, status = 200) =>
  sharedJson(body, status, { 'Cache-Control': 'no-store' })

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * How long a chat message waits before its push is sent. A member looking at
 * the open thread hears the message over Realtime well inside this and marks
 * the chat read, and `group_message_push_targets` then leaves them out, so
 * nobody is buzzed about a message they just watched arrive. Long enough for a
 * slow mobile round trip, short enough that a phone in a pocket still hears
 * the message about as soon as any messenger would ring.
 */
const MESSAGE_PUSH_DELAY_MS = 3_000

type Kind = 'nudge' | 'invite' | 'message'
const serviceClient = () =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
type Service = ReturnType<typeof serviceClient>

/**
 * Work that finishes after the answer is sent. The edge runtime keeps the
 * worker alive for it; anywhere without one it is best effort.
 */
function afterResponse(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else void work
}

/**
 * Sends the push for a nudge, an invite or a chat message the caller has just
 * made. The write itself is an RPC the app calls first, so a failure here costs
 * the push and nothing else: the board already shows the nudge, the invitee's
 * list already holds the invite, the thread already holds the message. Postgres
 * decides who hears it and marks it sent, so a retried or replayed call
 * delivers nothing twice.
 *
 * An invite is answered at once too and pushed in the background, so neither
 * the answer nor its timing says whether an invited address has an account.
 *
 * A chat message is answered at once and pushed after `MESSAGE_PUSH_DELAY_MS`
 * in the background, so the sender's app never waits on the delay and a phone
 * locked straight after sending cannot cut it short.
 *
 * `updates` is answered and ignored. The 1.1.5 build asks for it after
 * logging, from when the poster's app started food and workout pushes; the
 * jobs Worker sends those now (98_group_update_pushes.sql), and a 400 here
 * would only fill that build's logs.
 */
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405)
  const signed = await signedIn(req)
  if (signed instanceof Response) return json({ ok: false, error: 'not signed in' }, signed.status)

  let kind: Kind
  let id: string
  try {
    const bytes = await readBoundedBytes(req.body, 1024)
    const body = JSON.parse(new TextDecoder().decode(bytes))
    if (body?.kind === 'updates') return json({ ok: true, queued: false }, 202)
    if (!['nudge', 'invite', 'message'].includes(body?.kind) || !UUID.test(body?.id ?? '')) {
      throw new Error('invalid')
    }
    kind = body.kind
    id = body.id
  } catch {
    return json({ ok: false, error: 'invalid notify request' }, 400)
  }

  const service = serviceClient()
  if (kind === 'message') {
    afterResponse(
      new Promise((resolve) => setTimeout(resolve, MESSAGE_PUSH_DELAY_MS))
        .then(() => deliver(service, kind, signed.userId, id))
        .catch(unavailable),
    )
    return json({ ok: true, queued: true }, 202)
  }
  // How many phones an invite reached says whether its address has an
  // account, and so would how long the answer took. Answered before sending.
  if (kind === 'invite') {
    afterResponse(deliver(service, kind, signed.userId, id).catch(unavailable))
    return json({ ok: true, queued: true }, 202)
  }
  try {
    return json({ ok: true, sent: await deliver(service, kind, signed.userId, id) })
  } catch (error) {
    unavailable(error)
    return json({ ok: false, error: 'push unavailable' }, 502)
  }
})

function unavailable(error: unknown) {
  console.error('[groups] push unavailable', error instanceof Error ? error.message : error)
}

/** Expo takes at most this many messages in one request. */
const EXPO_BATCH = 100

/** Asks Postgres who hears it, posts to Expo, and answers how many Expo took. */
async function deliver(service: Service, kind: Kind, caller: string, id: string): Promise<number> {
  const { data, error } =
    kind === 'message'
      ? await service.rpc('group_message_push_targets', { p_caller: caller, p_id: id })
      : await service.rpc('group_push_targets', { p_caller: caller, p_kind: kind, p_id: id })
  if (error) throw error
  const targets = (data ?? []) as (PushTarget | MessageTarget)[]
  let sent = 0
  // A message to twenty members with a few phones each can pass Expo's limit.
  for (let start = 0; start < targets.length; start += EXPO_BATCH) {
    sent += await post(service, kind, targets.slice(start, start + EXPO_BATCH))
  }
  return sent
}

async function post(
  service: Service,
  kind: Kind,
  targets: (PushTarget | MessageTarget)[],
): Promise<number> {
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
  return tickets.filter((ticket) => ticket.status === 'ok').length
}
