import { makeImageFromView } from '@shopify/react-native-skia'
import { File, Paths } from 'expo-file-system'
import type { RefObject } from 'react'
import { Platform, Share, type View } from 'react-native'

/** What a captured view is, once it is a file the OS can be handed. */
export type Shot = {
  uri: string
  /** Pixels, so a preview can hold the picture's own proportions. */
  width: number
  height: number
}

/**
 * A FILE PER CAPTURE, named by the instant, with the one before it deleted as
 * soon as its replacement is on disk.
 *
 * This wrote to one fixed name at first, on the reasoning that a name per shot
 * leaves PNGs in the cache nobody deletes. What that reasoning missed is the
 * rule this app already lives by: A KEY NAMES ONE OBJECT, FOR GOOD. expo-image
 * caches against the URI, so the second card captured produced a correct file at
 * a URI the cache already had an answer for — and the preview showed the FIRST
 * card, with its own numbers, over a Share button that would have sent the
 * right one.
 *
 * A counter was the second attempt and the same bug wearing a longer name: it
 * starts at one on every app run, so the first capture of the day collides with
 * yesterday's, which is still in the image cache on disk. The clock is the only
 * part of a capture that cannot repeat.
 */
const shotName = () => `share-${Date.now()}.png`

/**
 * The capture still on disk from the last time, deleted when it is replaced.
 *
 * Module level rather than per caller, so the app keeps ONE of these at a time
 * whichever screen made it. Nothing is ever deleted out from under an open
 * share sheet: a capture cannot start while one is up.
 */
let written: string | null = null

/**
 * Draw a view into a PNG in the cache directory.
 *
 * Skia does it. `makeImageFromView` was already in the app for the review
 * cards, so a screenshot costs no new native module — which matters, because
 * the alternative is a dependency that needs a rebuild before anybody can try
 * it.
 *
 * Null when the view has not been laid out, or when the platform declines to
 * render it. Callers say so rather than sending nothing.
 */
export async function captureView(view: RefObject<View | null>): Promise<Shot | null> {
  const image = await makeImageFromView(view as RefObject<never>)
  if (!image) return null

  const file = new File(Paths.cache, shotName())
  file.create({ overwrite: true })
  file.write(image.encodeToBase64(), { encoding: 'base64' })

  // Only once the replacement exists. A delete before the write leaves nothing
  // at all behind if the write throws.
  const stale = written
  written = file.uri

  if (stale) {
    const old = new File(stale)
    if (old.exists) old.delete()
  }

  return { uri: file.uri, width: image.width(), height: image.height() }
}

/**
 * Hand a captured picture to the OS share sheet, and say whether it went.
 *
 * THE PICTURE ON iOS, THE SENTENCE ON ANDROID. React Native's `Share` takes
 * `url` on iOS only; on Android it carries `message` and drops everything else,
 * so asking it to send a file there shares nothing at all and reports success.
 * Sending the sentence is the honest degradation, and it is the same sentence
 * iOS sends beside the image. Sharing the file on Android needs a content://
 * provider, which needs a dependency, which needs a rebuild.
 *
 * The answer is a REAL yes or no on iOS alone. Android's share intent never
 * tells the app what the user did with it, so `Share` reports `sharedAction`
 * there whatever happens. Worth knowing before the two platforms are compared
 * on a "shared" count; it is not something the app can correct for.
 */
export async function sharePicture(shot: Shot, message: string): Promise<boolean> {
  const result = await Share.share(Platform.OS === 'ios' ? { url: shot.uri, message } : { message })
  return result.action === Share.sharedAction
}
