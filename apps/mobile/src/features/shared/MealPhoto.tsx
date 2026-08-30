import { Image } from 'expo-image'

import type { StoredImageSource } from '@/data'
import { photoCropFill } from '@/lib/photo'

export type MealPhotoProps = {
  /** Already resolved — `storedImageSource` over a signed URL or a local file. */
  source: StoredImageSource
  /**
   * Half lit, for a plate whose dish is still being worked out. The row draws a
   * spinner over it, and a photograph at full strength underneath one reads as
   * a finished entry.
   */
  dimmed?: boolean
  accessibilityLabel?: string
}

/**
 * A photographed plate, wherever one is drawn: the 56pt tile on a row, the hero
 * on an entry, a recipe's own picture.
 *
 * One component rather than five copies of the same three props, because a crop
 * applied to four of five places looks like a bug on the fifth. It fills whatever
 * box it is put in; see `photoCropFill`, and note the caller owes it a size and
 * an `overflow-hidden` to crop against.
 *
 * Faded in, because a plate can still be a moment late. It used to be late by a
 * request, since signed URLs are kept out of the persisted cache, so every launch
 * re-signed them and a day of snapped meals hard-cut from grey squares to
 * photographs. A launch now asks the disk first, and the fade stays for the
 * launch that does have to fetch.
 */
export function MealPhoto({ source, dimmed = false, accessibilityLabel }: MealPhotoProps) {
  return (
    <Image
      source={source}
      style={[photoCropFill, dimmed ? { opacity: 0.55 } : null]}
      // The box is rarely the photo's shape — square on a row, a wide card on a
      // detail screen — so it crops rather than letterboxing. Bars around a
      // plate read as a broken image.
      contentFit="cover"
      transition={180}
      accessibilityLabel={accessibilityLabel}
    />
  )
}
