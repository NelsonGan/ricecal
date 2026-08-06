import { storedImageSource } from '@/data/photos'

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
