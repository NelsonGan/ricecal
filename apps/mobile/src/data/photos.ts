import { useQuery } from '@tanstack/react-query'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'

/**
 * Meal photos, in the private `meal-photos` bucket.
 *
 * The path is `<user id>/<name>`, which is not a convention — the bucket's
 * insert policy checks `(storage.foldername(name))[1] = auth.uid()`, so a file
 * written anywhere else is rejected by Postgres rather than by us.
 */

const BUCKET = 'meal-photos'

/** How long a signed read URL lasts. Long enough to scroll a week of diary. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

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
 * Downsizes a photo and uploads it, returning the key to store on the entry.
 *
 * The resize is not an optimisation, it is what makes the upload possible: a
 * modern phone camera produces 3–6 MB per frame and the bucket rejects
 * anything over 10 MB, so a burst of unshrunk plates would start failing on
 * the third one. JPEG for the same reason the bucket lists HEIC as *allowed*
 * rather than expected — HEIC arriving means this step was skipped.
 */
export async function uploadMealPhoto(userId: string, localUri: string): Promise<string> {
  const image = await manipulateAsync(localUri, [{ resize: { width: 1080 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  })

  if (!image.base64) throw new Error('Could not read the photo')

  // Not the entry's id: the row does not exist yet when this runs, and a photo
  // that outlives a failed insert is one orphaned object rather than a name
  // collision on the next attempt.
  const path = `${userId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(path, decodeBase64(image.base64), {
    contentType: 'image/jpeg',
    upsert: false,
  })

  if (error) throw error
  return path
}

/**
 * A URL for a stored photo.
 *
 * Signed, because the bucket is private — a photo of a meal is a photo of
 * where somebody was and when. Cached for slightly less than the signature
 * lasts, so a diary that has been open for an hour re-signs rather than
 * rendering broken tiles.
 */
export function useMealPhotoUrl(path: string | undefined) {
  return useQuery({
    queryKey: keys.photo(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path as string, SIGNED_URL_TTL_SECONDS)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** Deletes a photo. Called when the entry that owned it is deleted. */
export async function removeMealPhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}
