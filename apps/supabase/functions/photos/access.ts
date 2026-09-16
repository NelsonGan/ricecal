import { ownsKey } from '../_shared/r2.ts'

/**
 * How many keys one read may sign.
 *
 * The client batches a screenful into a single call. The cap makes an upstream
 * bug one rejected request rather than a minute of signing work.
 */
const MAX_KEYS = 100

export type KeyClaim = { keys: string[] } | { error: string; status: number }

export type VisibleRecipePhoto = {
  owner_id: string | null
  photo_path: string | null
}

function validKeys(raw: unknown): KeyClaim {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'keys must be a non-empty array', status: 400 }
  }
  if (raw.length > MAX_KEYS) return { error: `at most ${MAX_KEYS} keys per request`, status: 400 }
  if (!raw.every((key) => typeof key === 'string' && key.length > 0)) {
    return { error: 'every key must be a string', status: 400 }
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
 * A read may also name the photograph on a recipe visible through RLS.
 *
 * The lookup runs as the caller, so the recipe read policies still hide
 * private, pending, rejected, reported, and blocked cooking. The owner encoded
 * in the key must also be the recipe owner. Without that second half an author
 * could put a guessed key from another account on their public recipe and turn
 * publication into permission to read it.
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
      ownerId && path?.startsWith(`meals/${ownerId}/`) ? [path] : [],
    ),
  )

  // One unauthorized key fails the whole batch rather than being silently
  // omitted. A partial response would make a client bug look like a flaky tile.
  if (!foreign.every((key) => allowed.has(key))) {
    return { error: 'not your object or a visible recipe photo', status: 403 }
  }
  return claim
}
