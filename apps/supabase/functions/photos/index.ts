// The image endpoint: mint a signed upload, mint signed reads, delete objects.
//
// This function exists because R2 is not the database. Supabase Storage let the
// client talk to the bucket directly and let Postgres decide whether it was
// allowed to; R2 has no idea who a user is, so something authenticated has to
// stand in front of it and sign. That something is this file, and the check it
// performs — `ownsKey` — is the whole of what eight RLS policies used to do.
//
// Three actions rather than three functions. Each function costs a config
// block, an import map and a full restart of the local stack to appear, and
// these three share their auth, their ownership check and their error shape
// down to the line.
//
// The client never holds an R2 credential. It holds a URL that stops working.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  ALLOWED_TYPES,
  type AssetKind,
  deleteObject,
  MAX_UPLOAD_BYTES,
  newKey,
  ownsKey,
  READ_TTL_SECONDS,
  r2Configured,
  signGet,
  signPut,
} from '../_shared/r2.ts'

/**
 * How many keys one read may sign.
 *
 * The client batches a screenful into a single call — a day of diary is a
 * dozen plates and would otherwise be a dozen cold starts. The cap is here so
 * that a bug upstream costs one rejected request rather than a minute of
 * signing.
 */
const MAX_KEYS = 100

type UploadRequest = { action: 'upload'; kind?: AssetKind; contentType?: string; size?: number }
type ReadRequest = { action: 'read'; keys?: string[] }
type DeleteRequest = { action: 'delete'; keys?: string[] }
type PhotosRequest = UploadRequest | ReadRequest | DeleteRequest

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isKind(value: unknown): value is AssetKind {
  return value === 'meal' || value === 'avatar'
}

/**
 * The keys in a read or delete, validated and proven to be the caller's.
 *
 * The status travels with the message because the two failures here are not
 * the same thing: a malformed list is the client's bug, and a key belonging to
 * somebody else is the one worth being able to find in a log.
 */
function claimKeys(
  raw: unknown,
  userId: string,
): { keys: string[] } | { error: string; status: number } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'keys must be a non-empty array', status: 400 }
  }
  if (raw.length > MAX_KEYS) return { error: `at most ${MAX_KEYS} keys per request`, status: 400 }
  if (!raw.every((key) => typeof key === 'string' && key.length > 0)) {
    return { error: 'every key must be a string', status: 400 }
  }
  // One foreign key fails the whole request rather than being skipped. A
  // partial answer here would be a client quietly rendering some of what it
  // asked for, which is how a bug in key handling stays invisible.
  const keys = raw as string[]
  if (!keys.every((key) => ownsKey(key, userId))) return { error: 'not your object', status: 403 }
  return { keys }
}

Deno.serve(async (req: Request) => {
  // Auth: the same self-inspection as every other function here, so a failure
  // says which half broke rather than arriving as an opaque platform 401.
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

  if (!r2Configured()) {
    return json({ ok: false, error: 'storage is not configured on this deployment' }, 503)
  }

  let body: PhotosRequest
  try {
    const parsed = await req.json()
    // `null` and `[1,2]` are both valid JSON, and reading `.action` off the
    // first one throws — which would land in the catch below and answer 500 to
    // what is plainly a bad request.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ ok: false, error: 'body must be a JSON object' }, 400)
    }
    body = parsed as PhotosRequest
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  try {
    switch (body.action) {
      case 'upload': {
        const kind = body.kind ?? 'meal'
        if (!isKind(kind)) return json({ ok: false, error: 'unknown kind' }, 400)

        const contentType = body.contentType ?? 'image/jpeg'
        if (!ALLOWED_TYPES[kind].includes(contentType)) {
          return json({ ok: false, error: `${contentType} is not an accepted image` }, 400)
        }

        // The size the client says it is about to send. Declared rather than
        // enforced — see `MAX_UPLOAD_BYTES` — which makes this the guard
        // against a photo that skipped the resize, not against a hostile
        // client.
        const size = body.size
        if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
          return json({ ok: false, error: 'size must be a positive integer' }, 400)
        }
        if (size > MAX_UPLOAD_BYTES[kind]) {
          return json({ ok: false, error: 'that image is too large' }, 413)
        }

        // The extension follows the type rather than the caller's filename:
        // the key is ours to mint, and a name is one more thing to validate.
        const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]
        const key = newKey(kind, userId, extension)
        const url = await signPut(key, { contentType })
        return json({ ok: true, key, url })
      }

      case 'read': {
        const claim = claimKeys(body.keys, userId)
        if ('error' in claim) return json({ ok: false, error: claim.error }, claim.status)

        const signed = await Promise.all(claim.keys.map((key) => signGet(key)))
        const urls: Record<string, string> = {}
        claim.keys.forEach((key, index) => {
          urls[key] = signed[index]
        })
        return json({ ok: true, urls, expiresIn: READ_TTL_SECONDS })
      }

      case 'delete': {
        const claim = claimKeys(body.keys, userId)
        if ('error' in claim) return json({ ok: false, error: claim.error }, claim.status)

        await Promise.all(claim.keys.map((key) => deleteObject(key)))
        return json({ ok: true })
      }

      default:
        return json({ ok: false, error: 'unknown action' }, 400)
    }
  } catch (error) {
    // Signing failures are configuration failures, near enough: bad
    // credentials, a bucket that moved, a token that expired. The message goes
    // to the logs and a flat 500 goes back, because there is nothing the
    // client can do differently.
    console.error('[photos]', error)
    return json({ ok: false, error: 'storage is unavailable' }, 500)
  }
})
