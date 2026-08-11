import { Image } from 'expo-image'

import { clearImageCache, resolveStoredImage, storedImageSource } from '@/data/photos'

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: { functions: { invoke: jest.Mock } }
}

const cache = Image as unknown as {
  clearMemoryCache: jest.Mock
  clearDiskCache: jest.Mock
  getCachePathAsync: jest.Mock
  writeToCacheAsync: jest.Mock
}

/**
 * What the image cache is keyed on.
 *
 * `storedImageSource` is three lines, and every one of them is a decision that
 * is invisible at the call site: which of two URIs wins, what the bytes are
 * filed under, and when nothing should be drawn at all. Get the key wrong and
 * the failure is not an error — it is a plate that quietly re-downloads on
 * every launch, or worse, one that keeps showing the picture it used to be.
 */

const KEY = 'meals/user-1/1f0c9a5e-0000-4000-8000-000000000001.jpg'
const SIGNED = `https://bucket.r2.example/${KEY}?X-Amz-Date=20260806T000000Z&X-Amz-Signature=aaa`
const RESIGNED = `https://bucket.r2.example/${KEY}?X-Amz-Date=20260806T010000Z&X-Amz-Signature=bbb`

describe('storedImageSource', () => {
  it('files the bytes under the stored key, not the signed URL', () => {
    expect(storedImageSource(KEY, SIGNED)).toEqual({ uri: SIGNED, cacheKey: KEY })
  })

  /**
   * The whole point. The signature is re-minted every launch and again every
   * 55 minutes; the object under it never changes. Keyed on the URL — which is
   * what expo-image does by default — each of those is a fresh download.
   */
  it('keeps one cache key across a re-sign of the same object', () => {
    const before = storedImageSource(KEY, SIGNED)
    const after = storedImageSource(KEY, RESIGNED)

    expect(before?.uri).not.toBe(after?.uri)
    expect(before?.cacheKey).toBe(after?.cacheKey)
  })

  /**
   * The invalidation, such as it is. Every upload mints its own UUID key, so a
   * photo replaced by hand cannot collide with the one it replaced — there is
   * no entry to bust because the new picture is asking for a different name.
   */
  it('gives a replaced photo a cache key of its own', () => {
    const replacement = 'meals/user-1/1f0c9a5e-0000-4000-8000-000000000002.jpg'

    expect(storedImageSource(KEY, SIGNED)?.cacheKey).not.toBe(
      storedImageSource(replacement, SIGNED)?.cacheKey,
    )
  })

  /**
   * A shot taken on this screen is the newer answer, and it is a file rather
   * than a download — so it wins, and it is given no key. Keying it would file
   * a local temp file under the key of the object it has not become yet, and
   * the real photo would then be served from a path that is about to be swept.
   */
  it('prefers a local file and leaves it unkeyed', () => {
    expect(storedImageSource(KEY, SIGNED, 'file:///tmp/shot.jpg')).toEqual({
      uri: 'file:///tmp/shot.jpg',
    })
  })

  /**
   * The disk copy is the cache entry, not a candidate for it. Keying it would
   * ask expo-image to file what it just handed back, and both platforms throw
   * the key away for a local file anyway.
   */
  it('leaves the disk copy unkeyed, the same as a fresh shot', () => {
    expect(storedImageSource(KEY, 'file:///var/cache/expo-image/abc')).toEqual({
      uri: 'file:///var/cache/expo-image/abc',
    })
  })

  it('has nothing to draw before the URL is signed for', () => {
    expect(storedImageSource(KEY, undefined)).toBeUndefined()
    expect(storedImageSource(undefined, undefined)).toBeUndefined()
  })

  /**
   * An entry with no photo at all still renders — the row falls back to its
   * dish illustration — so this must not become a source with no key rather
   * than no source.
   */
  it('falls back to the URL when there is no key to file it under', () => {
    expect(storedImageSource(undefined, SIGNED)).toEqual({ uri: SIGNED, cacheKey: undefined })
  })
})

/**
 * Which of the two places a picture can come from gets asked first.
 *
 * This is the whole of what makes a cold launch instant, and it is the kind of
 * order a later edit reverses without anything failing to typecheck — signing
 * first still WORKS, it is just a round trip per plate for photographs that
 * were already on the phone.
 */
describe('resolveStoredImage', () => {
  beforeEach(() => {
    cache.getCachePathAsync.mockReset().mockResolvedValue(null)
    supabase.functions.invoke.mockReset().mockResolvedValue({
      data: { ok: true, urls: { [KEY]: SIGNED } },
      error: null,
    })
  })

  it('hands back the copy on this device without asking the server', async () => {
    cache.getCachePathAsync.mockResolvedValue('/var/cache/expo-image/abc')

    await expect(resolveStoredImage(KEY)).resolves.toBe('file:///var/cache/expo-image/abc')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  /**
   * Both platforms answer with a bare filesystem path — `cachePath(forKey:)` on
   * iOS, `File.absolutePath` on Android — and a source with no scheme on it is
   * a source nothing reads back.
   */
  it('puts a scheme on the path it is given', async () => {
    cache.getCachePathAsync.mockResolvedValue(
      '/data/user/0/com.ricecal/cache/image_manager_disk/xyz',
    )

    await expect(resolveStoredImage(KEY)).resolves.toMatch(/^file:\/\//)
  })

  it('signs for a picture this device has never seen', async () => {
    await expect(resolveStoredImage(KEY)).resolves.toBe(SIGNED)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('photos', {
      body: { action: 'read', keys: [KEY] },
    })
  })

  /**
   * A cache that will not answer is not a reason to leave the tile blank: the
   * signature is still there to be asked for, which is what happened before
   * the disk was consulted at all.
   */
  it('falls through to signing when the cache cannot be read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    cache.getCachePathAsync.mockRejectedValue(new Error('no such directory'))

    await expect(resolveStoredImage(KEY)).resolves.toBe(SIGNED)

    warn.mockRestore()
  })
})

/**
 * The other side of keying on something stable: entries that used to age out
 * on their own no longer do, so leaving an account has to say so explicitly.
 */
describe('clearImageCache', () => {
  beforeEach(() => {
    cache.clearMemoryCache.mockClear().mockResolvedValue(true)
    cache.clearDiskCache.mockClear().mockResolvedValue(true)
  })

  it('empties the disk as well as the memory', async () => {
    await clearImageCache()

    // The disk is the one that matters — it is what survives the app being
    // closed, and a decoded bitmap in memory does not outlive the process.
    expect(cache.clearDiskCache).toHaveBeenCalled()
    expect(cache.clearMemoryCache).toHaveBeenCalled()
  })

  /**
   * It runs while an account is being torn down. A cache that will not empty
   * is not a reason to fail somebody's sign-out, so the failure is logged and
   * swallowed — the same bargain `removeImages` makes.
   */
  it('never rejects', async () => {
    cache.clearDiskCache.mockRejectedValue(new Error('no such directory'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(clearImageCache()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
