import { AVATAR_LAYERS, type AvatarLayerName, HAT_HAIR_CLIP } from './layers.generated'
import type { Pose } from './mood'
import type { Bone } from './rig'
import { HIDES_HAIR, type Outfit } from './wardrobe'

export type StackEntry = {
  name: AvatarLayerName
  /** Draw order; lower is further back. Layers of one rank stack in arrival order. */
  z: number
  bone: Bone
  /** Canvas row above which this layer is hidden: hair under a hat. */
  clipTop?: number
}

function has(name: string): name is AvatarLayerName {
  return name in AVATAR_LAYERS
}

/**
 * The layers bottom to top, and the bone each moves with. The order is the
 * whole trick of the figure:
 *
 *   hair behind, body, head, ears, arms where a sleeve covers them, shoes,
 *   bottom, top, what the hand holds, arms in front of the clothes, face,
 *   hair in front, glasses, headwear, the spoon and the eating arm, effects
 *
 * An arm at rest is cut in two (README: The avatar on Today, *How the layers
 * fit*): the part a sleeve covers sits under the top and the hand in front of
 * the body over it, so any top works with any pose. The eating arm is one
 * piece, raised in front of everything.
 */
export function buildStack(outfit: Outfit, pose: Pose): StackEntry[] {
  const out: StackEntry[] = []
  let z = 0
  const push = (name: string, bone: Bone = 'root', clipTop?: number) => {
    z += 1
    if (has(name)) out.push({ name, z, bone, clipTop })
  }
  const hat = outfit.headwear
  const hidesHair = hat !== null && HIDES_HAIR.has(hat)
  const clip = hat && !hidesHair ? (HAT_HAIR_CLIP[hat] ?? undefined) : undefined
  const eating = pose.armR === 'eat'
  push(hidesHair ? '' : `hair-${outfit.hair}-back`, 'head', clip)
  push('body')
  push('head', 'head')
  push(hidesHair ? '' : 'ears', 'head')
  push(`arm-L-${pose.armL}-under`)
  push(eating ? '' : `arm-R-${pose.armR}-under`)
  push(`shoes-${outfit.shoes}`)
  push(`bottom-${outfit.bottom}`)
  push(`top-${outfit.top}`)
  push(pose.armR === 'hold' && outfit.held ? `held-${outfit.held}` : '')
  push(`arm-L-${pose.armL}-over`)
  push(eating ? '' : `arm-R-${pose.armR}-over`)
  push(`face-${outfit.base}-${pose.face}`, 'head')
  push(hidesHair ? '' : `hair-${outfit.hair}-front`, 'head', clip)
  push(outfit.accessory ? `acc-${outfit.accessory}` : '', 'head')
  // A tudung's drape lies on the shoulders and stays with the body; only the
  // hood turns with the head.
  push(hat ? `hat-${hat}-drape` : '')
  push(hat ? `hat-${hat}` : '', 'head')
  // The spoon and the hand raised to the mouth are in front of everything,
  // hair falling over a shoulder and glasses included.
  push(eating && pose.spoon ? `held-spoon-${pose.spoon}` : '', 'armR')
  push(eating ? 'arm-R-eat-over' : '', 'armR')
  push(pose.effect ? `fx-${pose.effect}` : '', 'fx')
  return out
}
