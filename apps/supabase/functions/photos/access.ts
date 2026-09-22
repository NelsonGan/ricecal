import { ownsKey } from '../_shared/r2.ts'

/**
 * How many keys one read may sign.
 *
 * The client batches a screenful into a single call. The cap makes an upstream
 * bug one rejected request rather than a minute of signing work.
 */
const MAX_KEYS = 100
const RECIPE_SHARE_SLUG = /^[0-9a-f]{32}$/

export type KeyClaim = { keys: string[] } | { error: string; status: number }

export type VisibleRecipePhoto = {
  owner_id: string | null
  photo_path: string | null
}

export const SOCIAL_READ_TTL_SECONDS = 60

export type VisibleSocialPhoto = {
  owner_id: string
  photo_path: string | null
  photo_etag: string | null
  kind: 'meal' | 'avatar'
}

export type SocialKeyClaim =
  | { keys: string[]; etags: Record<string, string> }
  | { error: string; status: number }

/** Even the owner's social read goes through visibility and reviewed bytes. */
export async function claimSocialKeys(
  raw: unknown,
  visiblePhotos: (keys: string[]) => Promise<readonly VisibleSocialPhoto[]>,
): Promise<SocialKeyClaim> {
  const claim = validKeys(raw)
  if ('error' in claim) return claim
  const rows = await visiblePhotos(claim.keys)
  const etags: Record<string, string> = {}
  for (const row of rows) {
    if (
      row.photo_path &&
      row.photo_etag &&
      /^"[a-zA-Z0-9-]+"$/.test(row.photo_etag) &&
      ownsKey(row.photo_path, row.owner_id, row.kind)
    ) {
      etags[row.photo_path] = row.photo_etag
    }
  }
  if (!claim.keys.every((key) => Object.hasOwn(etags, key))) {
    return { error: 'not a visible reviewed social photo', status: 403 }
  }
  return { keys: [...new Set(claim.keys)], etags }
}

export function isRecipeShareSlug(value: unknown): value is string {
  return typeof value === 'string' && RECIPE_SHARE_SLUG.test(value)
}

function validKeys(raw: unknown): KeyClaim {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'keys must be a non-empty array', status: 400 }
  }
  if (raw.length > MAX_KEYS) return { error: `at most ${MAX_KEYS} keys per request`, status: 400 }
  if (!raw.every((key) => typeof key === 'string' && key.length > 0 && key.length <= 512)) {
    return { error: 'every key must be a string of 1 to 512 characters', status: 400 }
  }
  return { keys: raw as string[] }
}

/** Uploads and deletes stay owner-only. */
export function claimOwnedKeys(raw: unknown, userId: string): KeyClaim {
  const claim = validKeys(raw)
  if ('error' in claim) return claim
  if (!claim.keys.every((key) => ownsKey(key, userId))) {
    return { error: 'not your object', status: 403 }
  }
  return claim
}

/**
 * A read may also name the photograph on a recipe the caller may read.
 *
 * The caller normally supplies an RLS-scoped lookup. A private share supplies
 * the narrow bearer-link RPC instead, which still hides reported and blocked
 * cooking. The owner encoded in the key must also be the recipe owner. Without
 * that second half an author could put a guessed key from another account on
 * their recipe and turn sharing into permission to read it.
 */
export async function claimReadableKeys(
  raw: unknown,
  userId: string,
  visibleRecipePhotos: (keys: string[]) => Promise<readonly VisibleRecipePhoto[]>,
): Promise<KeyClaim> {
  const claim = validKeys(raw)
  if ('error' in claim) return claim

  const foreign = claim.keys.filter((key) => !ownsKey(key, userId))
  if (foreign.length === 0) return claim

  const rows = await visibleRecipePhotos(foreign)
  const allowed = new Set(
    rows.flatMap(({ owner_id: ownerId, photo_path: path }) =>
      ownerId && path && ownsKey(path, ownerId, 'meal') ? [path] : [],
    ),
  )

  // One unauthorized key fails the whole batch rather than being silently
  // omitted. A partial response would make a client bug look like a flaky tile.
  if (!foreign.every((key) => allowed.has(key))) {
    return { error: 'not your object or a visible recipe photo', status: 403 }
  }
  return claim
}
