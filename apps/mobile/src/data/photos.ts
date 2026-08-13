import { useQuery } from '@tanstack/react-query'
// Only ever for its cache, never to render — hence the name. It empties the
// cache on the way out of an account, asks it where a picture already is, and
// seeds it with a photo on the way up. The `Image` below is React Native's, and
// it is here to measure a file rather than to draw one.
import { Image as ImageCache } from 'expo-image'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Image } from 'react-native'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'

/**
 * Images, in Cloudflare R2.
 *
 * The app still deals in KEYS — `food_logs.photo_path` and
 * `profiles.avatar_path` hold exactly what they always did — but nothing here
 * talks to a bucket any more. Every operation goes through the `photos` edge
 * function, which is the only thing holding an R2 credential and the only thing
 * that can decide whether a key belongs to the caller.
 *
 * That indirection is not ceremony. Supabase Storage let this file talk to the
 * bucket directly because Postgres was checking each request against
 * `auth.uid()`; R2 has no such notion, so the check moved to the server and
 * this file lost its direct line to the object.
 *
 * Uploads still go phone → R2 with no proxy in between: the function signs a
 * PUT and the bytes take the short path.
 */

/** Which prefix an image lives under, and which rules apply to it. */
type AssetKind = 'meal' | 'avatar'

/**
 * Mirrors `READ_TTL_SECONDS` in `functions/_shared/r2.ts`. Only used to decide
 * when to ask for a fresh URL — the server's value is the one that binds, and
 * this being a little short of it is the point.
 */
const READ_TTL_SECONDS = 60 * 60

/**
 * How long signing waits for company.
 *
 * A day of diary mounts a dozen rows in the same frame, each wanting a URL for
 * its own plate. Against Supabase Storage that was a dozen cheap calls to an
 * always-warm service; against an edge function it is a dozen invocations and
 * possibly a dozen cold starts. So the keys asked for within a frame or two are
 * collected and signed in ONE request, and each caller is handed its own answer
 * out of the result.
 *
 * Long enough for a list to finish mounting, short enough that a single tile
 * appearing on its own does not feel like it is waiting for something.
 */
const BATCH_WINDOW_MS = 24

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Base64 to bytes, by hand.
 *
 * The documented Expo path for this is `expo-file-system` plus
 * `base64-arraybuffer`; both are avoided deliberately. `expo-file-system` is a
 * native module, so adding it invalidates every installed dev client and
 * forces a rebuild to upload a photo — a large bill for thirty lines of
 * arithmetic. `atob` is not guaranteed on Hermes across the versions this app
 * supports, so it is not used either.
 *
 * React Native's networking layer takes a `Uint8Array` body directly
 * (`convertRequestBody` base64s it back for the native side), so these bytes
 * can be PUT at a signed URL without a Blob — which matters, because RN's Blob
 * cannot be built from a typed array at all.
 */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '')
  const padding = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((clean.length * 3) / 4 - padding)

  let byte = 0
  let bits = 0
  let out = 0

  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character)
    if (value < 0) continue
    byte = (byte << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[out++] = (byte >> bits) & 0xff
    }
  }

  return bytes
}

/**
 * Longest edge (px) a stored meal photo is capped to; never upscales. The one
 * stored copy is what the diary renders AND what the scan function sends to the
 * vision model, and image tokens are billed by resolution — so this cap is the
 * model bill as much as it is the storage bill.
 */
const PHOTO_MAX_EDGE = 1024
/**
 * An avatar is drawn at 64pt at its largest. Anything past this is bytes
 * nobody will ever see, and no model reads it, so it is smaller than a plate
 * for the only reason that matters: the screen.
 */
const AVATAR_MAX_EDGE = 512
/** JPEG quality for the re-encode. File size only — tokens are resolution. */
const PHOTO_COMPRESS = 0.7

const MAX_EDGE: Record<AssetKind, number> = {
  meal: PHOTO_MAX_EDGE,
  avatar: AVATAR_MAX_EDGE,
}

/** The photo's pixel size, or null when it cannot be read. */
function measureImage(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    )
  })
}

type PhotosResponse = {
  ok: boolean
  error?: string
  key?: string
  url?: string
  urls?: Record<string, string>
}

/**
 * One call to the `photos` function, with its errors flattened into throws.
 *
 * The `context` dance is not defensive noise. supabase-js turns any non-2xx
 * into a `FunctionsHttpError` whose message is the useless "Edge Function
 * returned a non-2xx status code" and sets `data` to null — so the function's
 * own `{error: "..."}`, which is the only sentence that says WHICH rule was
 * broken, is sitting unread in the response body. This reads it back out, and
 * falls through to the generic error when there is nothing there.
 */
async function photos(body: Record<string, unknown>): Promise<PhotosResponse> {
  const { data, error } = await supabase.functions.invoke<PhotosResponse>('photos', { body })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const said = await context
        .json()
        .then((parsed: PhotosResponse) => parsed?.error)
        .catch(() => undefined)
      if (said) throw new Error(said)
    }
    throw error
  }

  if (!data?.ok) throw new Error(data?.error ?? 'storage request failed')
  return data
}

/**
 * Keys waiting to be signed, and the request they are waiting for.
 *
 * `inFlight` is created by the first caller of a batch and cleared by the timer
 * that sends it, so a key asked for after the send starts opens a new batch
 * rather than joining one that has already left.
 */
let queued: string[] = []
let inFlight: Promise<Record<string, string>> | null = null

/** A signed read URL for one key, sharing a request with its neighbours. */
function signRead(key: string): Promise<string> {
  queued.push(key)

  if (!inFlight) {
    inFlight = new Promise<Record<string, string>>((resolve, reject) => {
      setTimeout(() => {
        // Deduped: two rows can show the same photo — a decomposed plate's
        // parts each carry the parent's picture — and signing it twice is one
        // wasted signature and two different URLs for one object.
        const batch = Array.from(new Set(queued))
        queued = []
        inFlight = null
        photos({ action: 'read', keys: batch })
          .then((data) => data.urls ?? {})
          .then(resolve, reject)
      }, BATCH_WINDOW_MS)
    })
  }

  return inFlight.then((urls) => {
    const url = urls[key]
    // A key the server declined to sign is a key that is not ours or no longer
    // exists. Throwing puts the tile in its error state rather than rendering
    // `undefined` as a source, which reads as a photo that failed to load.
    if (!url) throw new Error('no URL for that image')
    return url
  })
}

/**
 * Where the bytes for a key already sit on this device, as a `file://` uri, or
 * null when they do not.
 *
 * This is the half of local caching that keying on `photo_path` did not buy.
 * The BYTES survive a relaunch and always did — that is what the stable cache
 * key is for — but nothing can be drawn until there is a `source` to draw, and
 * the uri in that source was a signature this app deliberately never persists.
 * So a cold launch showed a day of grey tiles while it waited on the `photos`
 * function to sign for photographs that were already on the disk, and a cold
 * start on that function made the wait a second or more. The pictures were
 * local; the permission to name them was not.
 *
 * Asking expo-image where it put them turns that wait into a local stat. The
 * path it hands back IS the cache entry rather than a copy of it, so nothing
 * is duplicated by rendering it.
 *
 * Never throws. A device that cannot answer is a device that has to sign,
 * which is exactly what happens next.
 */
async function cachedFile(key: string): Promise<string | null> {
  try {
    const path = await ImageCache.getCachePathAsync(key)
    if (!path) return null
    // iOS answers with `SDImageCache.cachePath(forKey:)` and Android with
    // `File.absolutePath`. Both are bare filesystem paths, and a source needs
    // a scheme on it before anything will read one back.
    return path.startsWith('file://') ? path : `file://${path}`
  } catch (error) {
    console.warn('[photos] could not read the image cache', error)
    return null
  }
}

/**
 * A uri to render for a stored key: the copy already on the device where there
 * is one, a freshly signed URL where there is not.
 *
 * Disk first, and the signature is SKIPPED rather than raced. A launch into a
 * diary of familiar plates invokes the `photos` function not at all, which is
 * both the wait and a dozen edge invocations that no longer happen.
 *
 * Exported for the tests: the order of these two is the whole feature, and it
 * is the kind of thing that gets quietly reversed by a later edit.
 */
export function resolveStoredImage(key: string): Promise<string> {
  return cachedFile(key).then((local) => local ?? signRead(key))
}

/**
 * Downsizes an image and uploads it, returning the key to store on the row.
 *
 * The resize is not an optimisation, it is what makes the upload possible: a
 * modern phone camera produces 3–6 MB per frame and the endpoint refuses
 * anything over 10 MB, so a burst of unshrunk plates would start failing on
 * the third one. JPEG for the same reason the endpoint still lists HEIC as
 * *accepted* rather than expected — HEIC arriving means this step was skipped.
 *
 * The cap is on the LONGER edge, so the aspect ratio is preserved and a
 * portrait shot costs the same tokens as a landscape one. An image already
 * within budget is re-encoded but never upscaled.
 *
 * Three steps, in this order: shrink, ask for a URL, PUT. The key comes back
 * from the server rather than being made up here — the server is the one
 * enforcing that a key sits inside the caller's own folder, and the cheapest
 * way to be sure of that is for it to be the one who wrote it.
 */
async function uploadImage(kind: AssetKind, localUri: string): Promise<string> {
  const maxEdge = MAX_EDGE[kind]
  const dims = await measureImage(localUri)
  const actions =
    dims === null
      ? // Unmeasurable: cap by width, which is the pre-cap behaviour and only
        // over-shoots the budget on a portrait shot.
        [{ resize: { width: maxEdge } }]
      : Math.max(dims.width, dims.height) <= maxEdge
        ? []
        : [
            dims.width >= dims.height
              ? { resize: { width: maxEdge } }
              : { resize: { height: maxEdge } },
          ]

  const image = await manipulateAsync(localUri, actions, {
    compress: PHOTO_COMPRESS,
    format: SaveFormat.JPEG,
    base64: true,
  })

  if (!image.base64) throw new Error('Could not read the photo')
  const bytes = decodeBase64(image.base64)

  const { key, url } = await photos({
    action: 'upload',
    kind,
    contentType: 'image/jpeg',
    size: bytes.length,
  })
  if (!key || !url) throw new Error('storage did not return an upload URL')

  // The content type is part of what was SIGNED, so it has to be sent and it
  // has to match. A 403 here with a valid-looking URL is almost always this
  // header having been changed on one side and not the other.
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    // The cast asserts what the PLATFORM accepts rather than what the DOM
    // typings describe. React Native's `convertRequestBody` has a branch for
    // `ArrayBuffer.isView(body)` and base64s it across to native; the lib.dom
    // `BodyInit` it is being checked against never heard of React Native.
    body: bytes as unknown as BodyInit,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)

  /**
   * File the picture under the key it now has, so the phone never downloads
   * back a photograph it took.
   *
   * Without this the bytes make a full round trip for no reason: the row is
   * written with a key nothing has cached, and the first time the diary draws
   * it, it signs for the object and fetches it. What is seeded is exact rather
   * than approximate — `image.uri` is the downsized JPEG that was PUT a line
   * ago, not the camera's original, so it is byte for byte what the bucket
   * holds.
   *
   * Never fails the upload. The object is in R2 by this point, and a cache
   * that would not take a copy is a slow first render, not a lost photo.
   */
  try {
    await ImageCache.writeToCacheAsync(image.uri, key)
  } catch (error) {
    console.warn('[photos] could not cache the upload', error)
  }

  return key
}

/** Uploads a plate. The key returned is what goes on `food_logs.photo_path`. */
export function uploadMealPhoto(localUri: string): Promise<string> {
  return uploadImage('meal', localUri)
}

/** Uploads a profile picture, for `profiles.avatar_path`. */
export function uploadAvatar(localUri: string): Promise<string> {
  return uploadImage('avatar', localUri)
}

/**
 * Whether this key is one the caller could possibly be handed a URL for.
 *
 * The server's `ownsKey` is the real check and this cannot replace it — it is
 * the same rule, asked one round trip earlier, and it exists because of what a
 * refusal COSTS here. `signRead` batches every key requested inside a 24 ms
 * window into one call and rejects the whole promise if any of them is refused,
 * so a single foreign key takes down the signing of every photograph beside it.
 *
 * A recipe list is where that first showed up: the community shelf renders
 * other people's cooking, and asking for their photographs blanked the user's
 * own. Filtered here, a foreign key is simply never asked for and the row falls
 * back to its illustration.
 */
function ownKey(path: string | undefined, userId: string): boolean {
  if (!path) return false
  return path.startsWith(`meals/${userId}/`) || path.startsWith(`avatars/${userId}/`)
}

/**
 * A uri for a stored image: a local file, or a signed URL.
 *
 * The bucket is private and has no public route at all — a photo of a meal is
 * a photo of where somebody was and when, and an avatar is a face — so
 * anything fetched over the network is fetched with a signature that expires
 * within the hour. Held for slightly less than the signature lasts, so a diary
 * left open across the hour re-signs rather than drawing broken tiles.
 *
 * Not persisted to disk: `lib/query.ts` drops everything under the `photo` key
 * on dehydrate, since a week-old cache full of hour-old URLs is a pile of
 * strings that are wrong by the time anything reads them, and the local path
 * beside them belongs to an app container that a reinstall renumbers.
 *
 * So this query is re-run on every cold launch and `resolveStoredImage` is
 * what makes that cheap: the answer usually comes off the disk, and the
 * network is touched only for a picture this device has never seen.
 *
 * The one query in the app that overrides the global `gcTime`, and the only
 * one that should: `Infinity` is set in `lib/query.ts` so that the persister
 * gets a chance to write a query to disk before it is collected, and this is
 * the query that is deliberately never written to disk. Kept forever, it also
 * kept every key the user has ever deleted — a photo replaced by hand leaves
 * its old uri behind with nothing pointing at it and no expiry to notice.
 * Collected after the signature's own lifetime instead. A tile still on screen
 * is unaffected: nothing is collected while it is being observed.
 *
 * A local answer refreshing on the same clock as a signed one is deliberate
 * rather than an oversight. It costs a stat, and the refetch is what promotes
 * an entry that WAS signed for an hour ago to the copy the download has since
 * left on the disk.
 */
function useStoredImageUri(path: string | undefined) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.photo(path ?? ''),
    enabled: ownKey(path, userId),
    staleTime: (READ_TTL_SECONDS - 300) * 1000,
    gcTime: READ_TTL_SECONDS * 1000,
    /**
     * The one query in the app worth RUNNING with no connection.
     *
     * `lib/query.ts` pauses a query rather than send a request that cannot
     * arrive, which is right for every query that has to ask the server — and
     * wrong for the only one that asks the DISK first. A paused query does not
     * run its `queryFn` at all, so the local path `resolveStoredImage` would
     * have returned is never fetched, and a diary of plates this phone has
     * already downloaded draws as a column of empty tiles the moment it goes
     * offline.
     *
     * What it costs is a doomed round trip per photograph this device has NOT
     * seen, which is the one case where there was nothing to show anyway.
     * Nothing waits on it: the row draws, and the tile fills in or does not.
     */
    networkMode: 'offlineFirst',
    queryFn: () => resolveStoredImage(path as string),
  })
}

/** A uri for a logged plate's photograph. */
export function useMealPhotoUrl(path: string | undefined) {
  return useStoredImageUri(path)
}

/** A uri for the signed-in user's profile picture. */
export function useAvatarUrl(path: string | undefined) {
  return useStoredImageUri(path)
}

/**
 * The two fields of `expo-image`'s `ImageSource` that this app fills in.
 *
 * Written out rather than imported because it is the SHAPE that call sites
 * need, and narrowing it to two named fields is what makes the pairing legible
 * at the `<Image>` — an `ImageSource` has a dozen optional fields and says
 * nothing about which of them matter here.
 */
export type StoredImageSource = { uri: string; cacheKey?: string }

/**
 * What to hand `<Image source>` for a picture that lives in the bucket.
 *
 * This exists because of a mismatch between two lifetimes. The BYTES never
 * change — an object is written once under a UUID key and is never rewritten —
 * but the URL naming them is a signature that expires within the hour, so it
 * is re-minted on every launch and again every 55 minutes. expo-image caches
 * on the URL by default, signing parameters and all, which made a stable
 * photograph look like a different image every time it was signed for: a cold
 * launch re-downloaded every plate on the day, and a diary left open across
 * the hour re-downloaded them again. Bytes moving because a credential rotated.
 *
 * So the cache is keyed on `photo_path` instead. The key is what the row
 * stores, it is minted per upload and never reused, and it names exactly one
 * object — which makes it both a stable cache key AND the invalidation. A
 * photo replaced by hand is a NEW key (the server mints one per upload), so the
 * new picture cannot be served from the old one's entry; there is no cache to
 * bust because the thing being asked for has a different name.
 *
 * That last part is load-bearing rather than incidental. An upload path that
 * reused a key on replace — writing the new object over the old — would leave
 * this cache confidently serving the previous photograph forever, on a key
 * whose bytes it has no way of knowing changed.
 *
 * A LOCAL uri wins over a stored one and is deliberately given no cache key: a
 * file on disk is not a download, and its path already names it uniquely.
 *
 * That covers two different files now. One is a shot taken on the screen doing
 * the asking. The other is the cache's own copy, handed back by
 * `resolveStoredImage` when the picture was already here — and that one must
 * not be keyed either, for a plainer reason than the first: it IS the entry
 * under that key, so filing it again would be asking the cache to store what
 * it just produced. Both platforms ignore a `cacheKey` on a local file anyway
 * (Android's `SourceMap` returns before it reads the field), and a source
 * saying something the platform discards is a source that misleads whoever
 * reads it next.
 */
export function storedImageSource(
  path: string | undefined,
  uri: string | undefined,
  localUri?: string,
): StoredImageSource | undefined {
  if (localUri) return { uri: localUri }
  if (!uri) return undefined
  if (uri.startsWith('file://')) return { uri }
  // `cacheKey` undefined falls back to the uri, which is the pre-cache
  // behaviour — correct, just not cached across a re-sign.
  return { uri, cacheKey: path }
}

/**
 * Deletes stored images. Called when the row that owned one is deleted, or
 * when a new picture takes its place.
 *
 * NEVER REJECTS, and that is load-bearing rather than lazy. Every call site
 * runs this AFTER the row it belongs to is written — `useUpdateEntry` and
 * `useRemoveEntry` both `await` it at the end of their `mutationFn`, on
 * purpose, so that an object deleted for a row that then failed to save cannot
 * leave an entry pointing at nothing. Rejecting here would invert that: the
 * database work has already succeeded, and throwing would fail the mutation
 * around it — a deleted entry springing back onto the day because the picture
 * it used to have could not be tidied up.
 *
 * So a failure leaves an orphaned object and nothing worse, which is what the
 * bucket call this replaced did too: `storage.remove` returned its error in a
 * field nobody read. The warning is the difference — it was silent before.
 */
async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  /**
   * Nothing is evicted here, deliberately, and both halves of that are worth
   * saying because both look like omissions.
   *
   * The SIGNED URL is left to `gcTime` on `useStoredImageUrl` rather than
   * removed on the spot. Removing it was tried and was worse than doing
   * nothing: a screen that replaces a photo is still mounted on the old key
   * while its own mutation runs, so the invalidation in `onSuccess` re-renders
   * it, the observer finds its query gone, and it signs the key that was
   * deleted a moment ago. `signGet` does not check that an object exists, so
   * that request SUCCEEDS — paying a round trip to put a URL for a deleted
   * object back in the cache the removal had just cleared.
   *
   * The DISK bytes are left alone because there is no API to do otherwise:
   * expo-image can clear its cache entirely or not at all, and evicting one
   * dead plate by throwing away every other plate on the day is the worse
   * trade. Its own LRU reclaims a key nothing asks for again.
   *
   * Neither can be served stale in the meantime. A replacement photo arrives
   * under a key of its own, so nothing is looking these up any more.
   */
  try {
    await photos({ action: 'delete', keys: paths })
  } catch (error) {
    console.warn('[photos] could not delete', paths, error)
  }
}

/** Deletes a meal photo. */
export function removeMealPhoto(path: string): Promise<void> {
  return removeImages([path])
}

/** Deletes a profile picture. */
export function removeAvatar(path: string): Promise<void> {
  return removeImages([path])
}

/**
 * Forgets every cached picture, on the way out of an account.
 *
 * This is the one moment where clearing the whole cache is the right shape
 * rather than a blunt instrument — the point IS that nothing is kept.
 *
 * It became necessary when the cache started keying on `photo_path`. Keyed on
 * the signed URL, a plate was re-downloaded under a new name every hour and
 * the old entries aged out on their own, so a signed-out account's photographs
 * left the device by accident, fairly promptly. Keyed on something stable they
 * do not: they are exactly the long-lived entries this change set out to
 * create. A meal photo is a picture of where somebody was and when, and a
 * device that has been handed on or sold should not still be holding a year of
 * them.
 *
 * SIGNED_OUT only, deliberately, though `session.tsx` clears its query cache on
 * both edges. Signing in cannot expose anything — a key names its owner and the
 * `photos` function refuses to sign one that is not the caller's — and if a
 * future supabase-js were to report a restored session as a sign-in, clearing
 * here would quietly throw away the disk cache on every launch and undo the
 * whole point of keying it this way. The edge that matters is the one that
 * leaves.
 *
 * Never rejects: this runs while an account is being torn down, and a cache
 * that would not empty is not a reason to fail a sign-out.
 */
export async function clearImageCache(): Promise<void> {
  try {
    await Promise.all([ImageCache.clearMemoryCache(), ImageCache.clearDiskCache()])
  } catch (error) {
    console.warn('[photos] could not clear the image cache', error)
  }
}
