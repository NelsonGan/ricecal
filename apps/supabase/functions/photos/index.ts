// The image endpoint: mint a signed upload, mint signed reads, delete objects.
//
// Three actions rather than three functions. Each function costs a config
// block, an import map and a full restart of the local stack to appear, and
// these three share their auth, their ownership check and their error shape
// down to the line.
//
// The client never holds an R2 credential. It holds a URL that stops working.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'
import { readBoundedBytes } from '../_shared/http.ts'

import {
  ALLOWED_TYPES,
  type AssetKind,
  deleteObject,
  headObjectEtag,
  MAX_UPLOAD_BYTES,
  newKey,
  READ_TTL_SECONDS,
  r2Configured,
  signGet,
  signPut,
} from '../_shared/r2.ts'
import {
  claimOwnedKeys,
  claimReadableKeys,
  claimSocialKeys,
  isRecipeShareSlug,
  SOCIAL_READ_TTL_SECONDS,
  type VisibleRecipePhoto,
} from './access.ts'

type UploadRequest = { action: 'upload'; kind?: AssetKind; contentType?: string; size?: number }
type ReadRequest = { action: 'read'; keys?: string[]; shareSlug?: string; scope?: 'social' }
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
    const parsed = JSON.parse(
      new TextDecoder().decode(await readBoundedBytes(req.body, 128 * 1024)),
    )
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
        if (body.scope !== undefined && body.scope !== 'social') {
          return json({ ok: false, error: 'unknown read scope' }, 400)
        }
        if (body.scope === 'social') {
          if (body.shareSlug !== undefined) {
            return json({ ok: false, error: 'social reads cannot use a recipe share' }, 400)
          }
          const claim = await claimSocialKeys(body.keys, async (keys) => {
            const { data, error } = await anonClient.rpc('social_photo_claims', { p_keys: keys })
            if (error) throw error
            return data ?? []
          })
          if ('error' in claim) return json({ ok: false, error: claim.error }, claim.status)
          const urls: Record<string, string> = {}
          const headers: Record<string, { 'If-Match': string }> = {}
          await Promise.all(
            claim.keys.map(async (key) => {
              const etag = claim.etags[key] ?? (await headObjectEtag(key))
              if (!etag) return
              urls[key] = await signGet(key, SOCIAL_READ_TTL_SECONDS, etag)
              headers[key] = { 'If-Match': etag }
            }),
          )
          return json({ ok: true, urls, headers, expiresIn: SOCIAL_READ_TTL_SECONDS })
        }
        if (body.shareSlug !== undefined && !isRecipeShareSlug(body.shareSlug)) {
          return json({ ok: false, error: 'shareSlug is not valid' }, 400)
        }

        const claim = await claimReadableKeys(body.keys, userId, async (keys) => {
          if (body.shareSlug) {
            const { data, error } = await anonClient.rpc('get_shared_recipe', {
              p_share_slug: body.shareSlug,
            })
            if (error) throw error
            return (data ?? []).filter(
              ({ photo_path: path }: VisibleRecipePhoto) => path && keys.includes(path),
            )
          }

          const { data, error } = await anonClient
            .from('recipes')
            .select('owner_id, photo_path')
            .in('photo_path', keys)
          if (error) throw error
          return data
        })
        if ('error' in claim) return json({ ok: false, error: claim.error }, claim.status)

        const signed = await Promise.all(claim.keys.map((key) => signGet(key)))
        const urls: Record<string, string> = {}
        claim.keys.forEach((key, index) => {
          urls[key] = signed[index]
        })
        return json({ ok: true, urls, expiresIn: READ_TTL_SECONDS })
      }

      case 'delete': {
        // Reading an approved community recipe is not ownership. Only the
        // author can delete the object under their own prefix.
        const claim = claimOwnedKeys(body.keys, userId)
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
