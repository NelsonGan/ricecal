import { AVATAR_LAYERS, type AvatarLayerName, HAT_HAIR_CLIP } from './layers.generated'
import type { Pose } from './mood'
import { HIDES_HAIR, type Outfit } from './wardrobe'

/**
 * Which part of the figure a layer moves with. The eating hand's layers share
 * one transform even though clothes sit between them.
 */
export type LayerGroup = 'figure' | 'armR' | 'effect'

export type StackEntry = {
  name: AvatarLayerName
  group: LayerGroup
  /** Canvas row above which this layer is hidden: hair under a hat. */
  clipTop?: number
}

function has(name: string): name is AvatarLayerName {
  return name in AVATAR_LAYERS
}

/**
 * The layers bottom to top. The order is the whole trick of the figure:
 *
 *   hair behind the body, body, ears, arms where a sleeve covers them, shoes,
 *   bottom, top, what the hand holds, arms in front of the clothes, face,
 *   hair in front, glasses, headwear, effects
 *
 * An arm is cut in two (README: The avatar on Today, *How the layers fit*):
 * the part a sleeve covers sits under the top and the hand in front of the
 * body sits over it, so any top works with any pose.
 */
export function buildStack(outfit: Outfit, pose: Pose): StackEntry[] {
  const out: StackEntry[] = []
  const push = (name: string, group: LayerGroup = 'figure', clipTop?: number) => {
    if (has(name)) out.push({ name, group, clipTop })
  }
  const hat = outfit.headwear
  const hidesHair = hat !== null && HIDES_HAIR.has(hat)
  const clip = hat && !hidesHair ? (HAT_HAIR_CLIP[hat] ?? undefined) : undefined
  const armGroup = (side: 'L' | 'R') => (side === 'R' && pose.armR === 'eat' ? 'armR' : 'figure')

  if (!hidesHair) push(`hair-${outfit.hair}-back`, 'figure', clip)
  push('body')
  if (!hidesHair) push('ears')
  push(`arm-L-${pose.armL}-under`, armGroup('L'))
  push(`arm-R-${pose.armR}-under`, armGroup('R'))
  push(`shoes-${outfit.shoes}`)
  push(`bottom-${outfit.bottom}`)
  push(`top-${outfit.top}`)
  if (pose.armR === 'hold' && outfit.held) push(`held-${outfit.held}`)
  if (pose.armR === 'eat' && pose.spoon) push(`held-spoon-${pose.spoon}`, 'armR')
  push(`arm-L-${pose.armL}-over`, armGroup('L'))
  push(`arm-R-${pose.armR}-over`, armGroup('R'))
  push(`face-${outfit.base}-${pose.face}`)
  if (!hidesHair) push(`hair-${outfit.hair}-front`, 'figure', clip)
  if (outfit.accessory) push(`acc-${outfit.accessory}`)
  if (hat) push(`hat-${hat}`)
  if (pose.effect) push(`fx-${pose.effect}`, 'effect')
  return out
}
