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
 * Keep decoded pictures in memory beside the disk copy. A familiar plate should
 * appear at once; only a network source needs a fade while it arrives.
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
      cachePolicy="memory-disk"
      enforceEarlyResizing
      transition={source.uri.startsWith('file://') ? 0 : 180}
      accessibilityLabel={accessibilityLabel}
    />
  )
}
