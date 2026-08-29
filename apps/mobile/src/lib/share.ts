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
 * A file per capture, named by the instant, with the one before it deleted as
 * soon as its replacement is on disk.
 *
 * One fixed name misses the rule this app lives by: a key names one object, for
 * good. expo-image caches against the URI, so the second card captured produced
 * a correct file at a URI the cache already had an answer for, and the preview
 * showed the first card over a Share button that would have sent the right one.
 *
 * A counter was the same bug with a longer name: it starts at one on every app
 * run, so the first capture of the day collides with yesterday's, which is still
 * in the image cache on disk.
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

export type SharePictureOptions = {
  /**
   * Send the picture and NOTHING beside it, where the platform can.
   *
   * For a card that already carries every word it needs: a shared meal says the
   * dish, the calories and the macros on the picture itself, so a sentence in
   * the share sheet repeating them is the same facts twice — once as a
   * photograph somebody chose to send, once as text the app wrote for them.
   *
   * It reaches iOS alone, and that is the platform's doing rather than a choice
   * made here: see below for why Android has only the sentence. The message
   * argument is still required for that reason, and callers passing this are
   * passing the ANDROID fallback rather than a caption.
   */
  pictureAlone?: boolean
}

/**
 * Hand a captured picture to the OS share sheet, and say whether it went.
 *
 * The picture on iOS, the sentence on Android. React Native's `Share` takes `url`
 * on iOS only; on Android it carries `message` and drops everything else, so
 * asking it to send a file there shares nothing and reports success. Sharing a
 * file on Android needs a content:// provider, a dependency and a rebuild.
 *
 * Which is why `pictureAlone` cannot be honoured on both: dropping the message
 * there leaves the share sheet with nothing in it.
 *
 * The answer is a real yes or no on iOS alone. Android's share intent never tells
 * the app what the user did, so `Share` reports `sharedAction` whatever happens.
 */
export async function sharePicture(
  shot: Shot,
  message: string,
  { pictureAlone = false }: SharePictureOptions = {},
): Promise<boolean> {
  const content =
    Platform.OS === 'ios'
      ? pictureAlone
        ? { url: shot.uri }
        : { url: shot.uri, message }
      : { message }

  const result = await Share.share(content)
  return result.action === Share.sharedAction
}
