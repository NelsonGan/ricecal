// Object storage, on Cloudflare R2, over its S3-compatible API.
//
// This module is the whole seam. Everything above it deals in keys, the same
// strings `food_logs.photo_path` and `profiles.avatar_path` have always held,
// and knows no hostname, signature or credential.
//
// What moved here from Postgres is authorization. Supabase Storage enforced "you
// may only touch your own folder" as eight RLS policies; R2 has no idea who a
// user is, so `ownsKey` is the entire check, and every key arriving from a client
// goes through it before anything is signed.
//
// Credentials are an R2 API token scoped to the one bucket, kept in the project's
// function secrets. The client is handed a signed URL that expires, never a key.

import { AwsClient } from 'aws4fetch'

/** The two kinds of image the app stores, and the prefix each lives under. */
export type AssetKind = 'meal' | 'avatar'

const PREFIX: Record<AssetKind, string> = {
  meal: 'meals',
  avatar: 'avatars',
}

/**
 * What the old buckets enforced, now enforced at signing time, and the two halves
 * are enforced with different strength.
 *
 * `allowed_mime_types` becomes a signed header, so an upload sending a different
 * one fails R2's own check. An upload 403-ing with a URL that looks fine is
 * usually a header that does not match exactly.
 *
 * `file_size_limit` cannot be: a presigned PUT has no length condition, so the
 * size below is checked against what the client declares. It stops the honest
 * oversized upload, which is the one that happens, and not a client that lied.
 */
export const MAX_UPLOAD_BYTES: Record<AssetKind, number> = {
  meal: 10 * 1024 * 1024,
  avatar: 5 * 1024 * 1024,
}

/**
 * HEIC survives on the meal path because it is what an iPhone camera produces.
 * The client downsizes to JPEG before upload, so accepting it here means a path
 * that skipped that step fails at the upload rather than halfway through the
 * cascade.
 */
export const ALLOWED_TYPES: Record<AssetKind, readonly string[]> = {
  meal: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
}

/** How long a signed read lasts. Long enough to scroll a week of diary. */
export const READ_TTL_SECONDS = 60 * 60
/** How long a signed upload lasts. Long enough for a photo on a bad train. */
export const UPLOAD_TTL_SECONDS = 10 * 60

type R2Config = {
  client: AwsClient
  /** `https://<account>.r2.cloudflarestorage.com/<bucket>` — no trailing slash. */
  base: string
}

let cached: R2Config | null = null

/**
 * The client, or null when the secrets are not set. Null rather than a throw, so
 * a caller can answer "storage is not configured" in its own words and a local
 * stack with no Cloudflare credentials still starts and still scans.
 *
 * `R2_ENDPOINT` overrides the host so a local stack can point at any S3, such as
 * the one Supabase runs beside it. Nothing above this module changes. Without it
 * the one seam standing between two users' diaries could only be tested in
 * production. Unset everywhere but a developer's machine.
 */
function config(): R2Config | null {
  if (cached) return cached

  const accountId = Deno.env.get('R2_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET')
  const endpoint = Deno.env.get('R2_ENDPOINT')?.replace(/\/+$/, '')

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null

  cached = {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }),
    base: `${endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`}/${bucket}`,
  }
  return cached
}

/** True once the four R2 secrets are set. */
export function r2Configured(): boolean {
  return config() !== null
}

function mustR2(): R2Config {
  const r2 = config()
  if (!r2) {
    throw new Error(
      'R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET in the function secrets',
    )
  }
  return r2
}

/**
 * A fresh key for a new object: `<prefix>/<user>/<uuid>.<ext>`. Minted on the
 * server rather than by the caller, because the cheapest way to be sure a key is
 * inside the caller's folder is to be the one who wrote it.
 *
 * Not the entry's id: the row does not exist when a photo is uploaded, and an
 * object outliving a failed insert is one orphan rather than a name collision.
 */
export function newKey(kind: AssetKind, userId: string, extension = 'jpg'): string {
  return `${PREFIX[kind]}/${userId}/${crypto.randomUUID()}.${extension}`
}

/**
 * The characters a key is allowed to be made of, which is generous already given
 * that every key this system mints is `<prefix>/<uuid>/<uuid>.<ext>`. A key from
 * a client is pasted into a URL before it is signed, and a `?` or `#` would be
 * parsed as the start of the query or fragment. The prefix check below still
 * holds, so it cannot leak another user's object, but it turns a well-formed
 * request into a baffling one.
 */
const SAFE_KEY = /^[A-Za-z0-9/_.-]+$/

/**
 * Whether this key belongs to this user: the replacement for eight RLS policies,
 * and the only authorization there is. Anchored at the start and matched against
 * the whole prefix segment, so `meals/<someone else>` fails and a key with `..`
 * cannot walk out of the folder.
 */
export function ownsKey(key: string, userId: string, kind?: AssetKind): boolean {
  if (!SAFE_KEY.test(key) || key.includes('..')) return false
  const kinds: AssetKind[] = kind ? [kind] : ['meal', 'avatar']
  return kinds.some((k) => key.startsWith(`${PREFIX[k]}/${userId}/`))
}

/**
 * A presigned PUT. A pinned content type must be sent back verbatim; see
 * `MAX_UPLOAD_BYTES` for why it is pinned.
 *
 * Only the content type, because it is a header the client sets explicitly and
 * can be relied on to reproduce. `Content-Length` is synthesised by the
 * platform's networking layer, and signing what we do not write ourselves is how
 * an upload path breaks on one OS version and not another.
 */
export async function signPut(
  key: string,
  options: { contentType?: string; expiresIn?: number } = {},
): Promise<string> {
  const { client, base } = mustR2()
  const target = new URL(`${base}/${key}`)
  target.searchParams.set('X-Amz-Expires', String(options.expiresIn ?? UPLOAD_TTL_SECONDS))

  const signed = await client.sign(target.toString(), {
    method: 'PUT',
    headers: options.contentType ? { 'content-type': options.contentType } : {},
    // `allHeaders` is what makes the content type bind. aws4fetch keeps a list
    // of unsignable headers, `content-type` among them, and silently drops them
    // from `X-Amz-SignedHeaders` unless this is set: without it the URL signs
    // `host` alone and a PUT declaring `text/html` is accepted.
    aws: { signQuery: true, allHeaders: true },
  })
  return signed.url
}

/** A presigned GET, for rendering the object in the app. */
export async function signGet(key: string, expiresIn = READ_TTL_SECONDS): Promise<string> {
  const { client, base } = mustR2()
  const target = new URL(`${base}/${key}`)
  target.searchParams.set('X-Amz-Expires', String(expiresIn))

  const signed = await client.sign(target.toString(), {
    method: 'GET',
    aws: { signQuery: true },
  })
  return signed.url
}

/**
 * The object's bytes, read by the function itself. Header-signed rather than
 * presigned: nobody else holds this request, so there is no reason to put a
 * credential in a URL.
 */
export async function readObject(key: string): Promise<Uint8Array> {
  const { client, base } = mustR2()
  const response = await client.fetch(`${base}/${key}`, { method: 'GET' })
  if (!response.ok) throw new Error(`R2 GET ${key} failed: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Deletes an object. A 404 is a success: the caller's goal is that the object
 * is gone, and a delete retried after a half-failed one must not report a
 * problem the user cannot act on.
 */
export async function deleteObject(key: string): Promise<void> {
  const { client, base } = mustR2()
  const response = await client.fetch(`${base}/${key}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status}`)
  }
}

/**
 * How many keys one list page asks for. S3's own ceiling is 1,000.
 */
const LIST_PAGE = 1000

/**
 * How many deletes are in flight at once. R2's bulk delete is deliberately not
 * used: it requires a `Content-MD5` over the request body, which Web Crypto does
 * not offer and which would mean an MD5 dependency in the one module that signs
 * everything. Sixteen concurrent single-object deletes clear a thousand objects
 * in a couple of seconds.
 *
 * The retention sweep, which moves hundreds of thousands, uses the R2 binding
 * from the jobs Worker instead.
 */
const DELETE_CONCURRENCY = 16

/**
 * Every key under a prefix, one page at a time. The keys come back XML-escaped in
 * principle and cannot be in practice: every key matches `SAFE_KEY`, which has no
 * character XML would escape. So the extraction is a regex rather than a parser,
 * and widening `SAFE_KEY` means revisiting it.
 */
export async function listKeys(prefix: string): Promise<string[]> {
  const { client, base } = mustR2()
  const keys: string[] = []
  let token: string | undefined

  // Bounded by `IsTruncated`, which S3 sets false on the last page. The loop
  // cannot spin: a page either yields a continuation token or ends it.
  for (;;) {
    const target = new URL(base)
    target.searchParams.set('list-type', '2')
    target.searchParams.set('prefix', prefix)
    target.searchParams.set('max-keys', String(LIST_PAGE))
    if (token) target.searchParams.set('continuation-token', token)

    const response = await client.fetch(target.toString(), { method: 'GET' })
    if (!response.ok) throw new Error(`R2 LIST ${prefix} failed: ${response.status}`)
    const xml = await response.text()

    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(match[1])

    if (!/<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)) break
    token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
    // A truncated page with no token is a broken answer rather than more work.
    // Stopping is the safe reading: the caller re-lists, and anything missed is
    // still there to be found.
    if (!token) break
  }

  return keys
}

/**
 * Every object this user has, gone. Returns how many were deleted.
 *
 * By prefix rather than from the database. `food_logs.photo_path` and
 * `profiles.avatar_path` name most of them, but a key is minted before the row
 * that will hold it exists, so an upload whose insert failed is an object no row
 * has ever named. Listing the folder is the only way to find those.
 *
 * Safe to run twice: deleting an absent object is a no-op, so a sweep that dies
 * halfway has made real progress and the retry is cheaper than the attempt.
 */
export async function deleteUserObjects(userId: string): Promise<number> {
  const keys = (
    await Promise.all(Object.values(PREFIX).map((prefix) => listKeys(`${prefix}/${userId}/`)))
  ).flat()

  for (let index = 0; index < keys.length; index += DELETE_CONCURRENCY) {
    const chunk = keys.slice(index, index + DELETE_CONCURRENCY)
    await Promise.all(chunk.map((key) => deleteObject(key)))
  }

  return keys.length
}
