import { type SkImage, Skia } from '@shopify/react-native-skia'
import { useEffect, useRef, useState } from 'react'
import { Image } from 'react-native'

import { AVATAR_LAYERS, type AvatarLayerName } from './layers.generated'

/**
 * Every avatar drawing, decoded once per app run and shared by every figure on
 * screen. A board of twenty avatars in the same tee holds one copy of the tee.
 */
const decoded = new Map<AvatarLayerName, SkImage>()
const pending = new Map<AvatarLayerName, Promise<SkImage | null>>()
/** Drawings that would not decode: skipped rather than waited for forever. */
const failed = new Set<AvatarLayerName>()

function load(name: AvatarLayerName): Promise<SkImage | null> {
  const cached = decoded.get(name)
  if (cached) return Promise.resolve(cached)
  const inFlight = pending.get(name)
  if (inFlight) return inFlight
  const uri = Image.resolveAssetSource(AVATAR_LAYERS[name].source)?.uri
  if (!uri) {
    failed.add(name)
    return Promise.resolve(null)
  }
  const promise = Skia.Data.fromURI(uri)
    .then((data) => {
      const image = Skia.Image.MakeImageFromEncoded(data)
      if (image) decoded.set(name, image)
      else failed.add(name)
      return image
    })
    .catch(() => {
      failed.add(name)
      return null
    })
    .finally(() => pending.delete(name))
  pending.set(name, promise)
  return promise
}

/** Start decoding drawings that are about to be needed, such as the next pose. */
export function preloadAvatarLayers(names: Iterable<AvatarLayerName>): void {
  for (const name of names) void load(name)
}

/**
 * The decoded drawings for `names`, or null until the first full set is
 * ready: a figure drawn half-loaded would show a body with no face. After
 * that a drawing still decoding is simply skipped until it arrives, so a new
 * pose never blanks the whole figure. Answers synchronously when everything
 * is cached, so a re-render never flashes.
 */
export function useAvatarImages(
  names: readonly AvatarLayerName[],
): ReadonlyMap<AvatarLayerName, SkImage> | null {
  const key = names.join('|')
  const ready = () => names.every((name) => decoded.has(name) || failed.has(name))
  const [, setVersion] = useState(0)
  const shown = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `names`
  useEffect(() => {
    if (ready()) return
    let live = true
    void Promise.all(names.map(load)).then(() => {
      if (live) setVersion((v) => v + 1)
    })
    return () => {
      live = false
    }
  }, [key])

  if (ready()) shown.current = true
  return shown.current ? decoded : null
}
