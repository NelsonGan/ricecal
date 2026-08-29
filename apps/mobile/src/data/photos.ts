import { useQuery } from '@tanstack/react-query'
// Only ever for its cache, never to render. It empties the cache on the way out
// of an account, asks it where a picture already is, and seeds it with a photo on
// the way up. The `Image` below is React Native's, and it is here to measure a
// file rather than to draw one.
import { Image as ImageCache } from 'expo-image'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Image } from 'react-native'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'

/**
 * Images, in Cloudflare R2.
 *
 * The app deals in keys and nothing here talks to a bucket. Every operation goes
 * through the `photos` edge function, which holds the only R2 credential and is
 * the only thing that can decide whether a key belongs to the caller: R2 has no
 * notion of a user, so that check cannot live in the database.
 *
 * Uploads still go phone to R2 with no proxy: the function signs a PUT.
 */

/**
 * Which prefix an image lives under, and which rules apply to it.
 */
type AssetKind = 'meal' | 'avatar'

/**
 * Mirrors `READ_TTL_SECONDS` in `functions/_shared/r2.ts`. Only used to decide
 * when to ask for a fresh URL. The server's value is the one that binds, and this
 * being a little short of it is the point.
 */
const READ_TTL_SECONDS = 60 * 60

/**
 * How long signing waits for company. A day of diary mounts a dozen rows in one
 * frame, each wanting a URL, which against an edge function is a dozen
 * invocations and possibly a dozen cold starts.
 */
const BATCH_WINDOW_MS = 24

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Base64 to bytes, by hand. `expo-file-system` is a native module and would
 * invalidate every installed dev client to save thirty lines, and `atob` is not
 * guaranteed on Hermes across the versions this app supports.
 *
 * React Native's networking layer takes a `Uint8Array` body directly, so these
 * bytes can be PUT without a Blob, which RN cannot build from a typed array.
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
 * Longest edge in pixels a stored meal photo is capped to; never upscales. The
 * one stored copy is what the diary renders and what the scan sends to the vision
 * model, and image tokens are billed by resolution, so this is the model bill as
 * much as the storage bill.
 */
const PHOTO_MAX_EDGE = 1024
/**
 * An avatar is drawn at 64pt at its largest, and no model reads it, so anything
 * past this is bytes nobody will see.
 */
const AVATAR_MAX_EDGE = 512
/**
 * JPEG quality for the re-encode. File size only, since tokens are resolution.
 */
const PHOTO_COMPRESS = 0.7

const MAX_EDGE: Record<AssetKind, number> = {
  meal: PHOTO_MAX_EDGE,
  avatar: AVATAR_MAX_EDGE,
}

/**
 * The photo's pixel size, or null when it cannot be read.
 */
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
 * The `context` dance is not noise: supabase-js turns any non-2xx into a
 * `FunctionsHttpError` reading "Edge Function returned a non-2xx status code"
 * and sets `data` to null, leaving the function's own `{error: "..."}` unread in
 * the response body.
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
 * Keys waiting to be signed, and the request they are waiting for. `inFlight` is
 * created by the first caller of a batch and cleared by the timer that sends it,
 * so a key asked for after the send opens a new batch.
 */
let queued: string[] = []
let inFlight: Promise<Record<string, string>> | null = null

/**
 * A signed read URL for one key, sharing a request with its neighbours.
 */
function signRead(key: string): Promise<string> {
  queued.push(key)

  if (!inFlight) {
    inFlight = new Promise<Record<string, string>>((resolve, reject) => {
      setTimeout(() => {
        // Deduped: two rows can show the same photo, since a decomposed plate's parts
        // each carry the parent's picture, and signing it twice is one wasted signature
        // and two different URLs for one object.
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
 * null. The bytes survive a relaunch but the uri in the source was a signature
 * this app never persists, so a cold launch showed a day of grey tiles while it
 * waited to sign for photographs already on the disk.
 *
 * The path expo-image hands back is the cache entry rather than a copy of it.
 * Never throws: a device that cannot answer is one that has to sign.
 */
async function cachedFile(key: string): Promise<string | null> {
  try {
    const path = await ImageCache.getCachePathAsync(key)
    if (!path) return null
    // iOS answers with `SDImageCache.cachePath(forKey:)` and Android with
    // `File.absolutePath`. Both are bare filesystem paths, and a source needs a
    // scheme on it before anything will read one back.
    return path.startsWith('file://') ? path : `file://${path}`
  } catch (error) {
    console.warn('[photos] could not read the image cache', error)
    return null
  }
}

/**
 * A uri to render for a stored key: the copy on the device where there is one, a
 * freshly signed URL where there is not. Disk first, and the signature is
 * skipped rather than raced, so a launch into a diary of familiar plates invokes
 * the `photos` function not at all.
 *
 * Exported for the tests: the order of these two is the whole feature.
 */
export function resolveStoredImage(key: string): Promise<string> {
  return cachedFile(key).then((local) => local ?? signRead(key))
}

/**
 * Downsizes an image and uploads it, returning the key to store on the row.
 *
 * The resize is what makes the upload possible: a phone camera produces 3 to
 * 6 MB a frame and the endpoint refuses anything over 10 MB. The cap is on the
 * longer edge, so an image already within budget is re-encoded but not upscaled.
 *
 * Shrink, ask for a URL, PUT. The key comes back from the server, which is what
 * enforces that it sits inside the caller's own folder.
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

  // The content type is part of what was signed, so it has to be sent and it has
  // to match. A 403 here with a valid-looking URL is almost always this header
  // having been changed on one side and not the other.
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    // The cast asserts what the platform accepts rather than what the DOM typings
    // describe. React Native's `convertRequestBody` has a branch for
    // `ArrayBuffer.isView(body)` and base64s it across to native; the lib.dom
    // `BodyInit` it is being checked against never heard of React Native.
    body: bytes as unknown as BodyInit,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)

  /**
   * File the picture under the key it now has, so the phone never downloads back
   * a photograph it took. `image.uri` is the downsized JPEG that was PUT a line
   * ago, so it is byte for byte what the bucket holds.
   *
   * Never fails the upload: the object is in R2 by this point, and a cache that
   * would not take a copy is a slow first render rather than a lost photo.
   */
  try {
    await ImageCache.writeToCacheAsync(image.uri, key)
  } catch (error) {
    console.warn('[photos] could not cache the upload', error)
  }

  return key
}

/**
 * Uploads a plate. The key returned is what goes on `food_logs.photo_path`.
 */
export function uploadMealPhoto(localUri: string): Promise<string> {
  return uploadImage('meal', localUri)
}

/**
 * Uploads a profile picture, for `profiles.avatar_path`.
 */
export function uploadAvatar(localUri: string): Promise<string> {
  return uploadImage('avatar', localUri)
}

/**
 * Whether this key is one the caller could possibly be handed a URL for. The
 * server's `ownsKey` is the real check; this is the same rule one round trip
 * earlier, because `signRead` batches every key in a 24 ms window into one call
 * and rejects the whole promise if any is refused. On the community recipe shelf
 * that meant asking for other people's photographs blanked the user's own.
 */
function ownKey(path: string | undefined, userId: string): boolean {
  if (!path) return false
  return path.startsWith(`meals/${userId}/`) || path.startsWith(`avatars/${userId}/`)
}

/**
 * A uri for a stored image: a local file, or a signed URL.
 *
 * The bucket is private, so anything fetched over the network carries a
 * signature that expires within the hour. Held for slightly less than that, so a
 * diary left open across the hour re-signs rather than drawing broken tiles.
 *
 * Not persisted to disk: an hour-old URL is wrong by the time anything reads it,
 * and the local path beside it belongs to a container a reinstall renumbers.
 *
 * The one query that overrides the global `gcTime`. `Infinity` exists so the
 * persister can write a query to disk before it is collected, and this is the
 * query never written to disk; kept for ever it also kept every deleted key.
 */
function useStoredImageUri(path: string | undefined) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.photo(path ?? ''),
    enabled: ownKey(path, userId),
    staleTime: (READ_TTL_SECONDS - 300) * 1000,
    gcTime: READ_TTL_SECONDS * 1000,
    /**
     * The one query worth running with no connection. `lib/query.ts` pauses a
     * query rather than send a request that cannot arrive, which is wrong for the
     * only one that asks the disk first: a paused query never runs its `queryFn`,
     * so a diary of already-downloaded plates draws as empty tiles offline.
     *
     * It costs a doomed round trip per photograph this device has not seen.
     */
    networkMode: 'offlineFirst',
    queryFn: () => resolveStoredImage(path as string),
  })
}

/**
 * A uri for a logged plate's photograph.
 */
export function useMealPhotoUrl(path: string | undefined) {
  return useStoredImageUri(path)
}

/**
 * A uri for the signed-in user's profile picture.
 */
export function useAvatarUrl(path: string | undefined) {
  return useStoredImageUri(path)
}

/**
 * The two fields of `expo-image`'s `ImageSource` that this app fills in. Written
 * out rather than imported, because an `ImageSource` has a dozen optional fields
 * and says nothing about which matter here.
 */
export type StoredImageSource = { uri: string; cacheKey?: string }

/**
 * What to hand `<Image source>` for a picture that lives in the bucket.
 *
 * The bytes never change but the URL naming them expires within the hour, and
 * expo-image caches on the URL, so a stable photograph looked like a new image
 * every time it was signed for.
 *
 * Keyed on `photo_path` instead: minted per upload, never reused, naming one
 * object, which makes it both a stable key and the invalidation. An upload path
 * that reused a key on replace would serve the previous photograph for ever.
 *
 * A local uri is given no cache key: the cache's own copy is the entry under
 * that key, so filing it again asks the cache to store what it just produced.
 */
export function storedImageSource(
  path: string | undefined,
  uri: string | undefined,
  localUri?: string,
): StoredImageSource | undefined {
  if (localUri) return { uri: localUri }
  if (!uri) return undefined
  if (uri.startsWith('file://')) return { uri }
  // `cacheKey` undefined falls back to the uri, which is the pre-cache behaviour.
  // Correct, just not cached across a re-sign.
  return { uri, cacheKey: path }
}

/**
 * Deletes stored images, when the row that owned one is deleted or a new picture
 * takes its place.
 *
 * Never rejects, and that is load-bearing: every call site runs it after the row
 * is written, so throwing would fail the mutation around work that has already
 * succeeded and spring a deleted entry back onto the day. A failure leaves an
 * orphaned object and nothing worse.
 */
async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  /**
   * Nothing is evicted here, deliberately.
   *
   * The signed URL is left to `gcTime`: removing it on the spot was worse, since
   * a screen replacing a photo is still mounted on the old key while its mutation
   * runs, so the invalidation re-renders it and it signs the deleted key, which
   * `signGet` happily allows.
   *
   * The disk bytes are left alone because expo-image can clear its cache entirely
   * or not at all, and its own LRU reclaims a key nothing asks for.
   */
  try {
    await photos({ action: 'delete', keys: paths })
  } catch (error) {
    console.warn('[photos] could not delete', paths, error)
  }
}

/**
 * Deletes a meal photo.
 */
export function removeMealPhoto(path: string): Promise<void> {
  return removeImages([path])
}

/**
 * Deletes a profile picture.
 */
export function removeAvatar(path: string): Promise<void> {
  return removeImages([path])
}

/**
 * Forgets every cached picture, on the way out of an account.
 *
 * Keyed on the signed URL, entries aged out on their own every hour. Keyed on
 * `photo_path` they do not, and a device that has been handed on should not hold
 * a year of somebody's meals.
 *
 * SIGNED_OUT only: signing in cannot expose anything, and a future supabase-js
 * reporting a restored session as a sign-in would throw the disk cache away on
 * every launch.
 *
 * Never rejects: this runs while an account is being torn down.
 */
export async function clearImageCache(): Promise<void> {
  try {
    await Promise.all([ImageCache.clearMemoryCache(), ImageCache.clearDiskCache()])
  } catch (error) {
    console.warn('[photos] could not clear the image cache', error)
  }
}
