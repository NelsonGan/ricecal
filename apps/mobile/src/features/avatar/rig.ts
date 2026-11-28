import { AVATAR_CANVAS } from './layers.generated'

/**
 * The skeleton the drawings hang on, in canvas units (README: The avatar on
 * Today, *How it moves*).
 *
 * Every layer belongs to one bone and turns about that bone's pivot. Three
 * bones are enough for a chibi: the whole figure about its feet (lean, squash,
 * hop), the head about the neck (nod, tilt, chew), and the right arm about the
 * shoulder (the spoon). A new motion is a new track for one of these, not a new
 * drawing.
 */
export type Bone = 'root' | 'head' | 'armR' | 'fx'

export const CANVAS = AVATAR_CANVAS

export const PIVOT = {
  /** Between the shoes: the figure leans and squashes from the ground up. */
  feet: { x: CANVAS.width / 2, y: CANVAS.height - 14 },
  /** The middle of the neck, under the chin. */
  neck: { x: 248, y: 371 },
  /** The top of the eating arm, where it meets the sleeve. */
  shoulderR: { x: 317, y: 395 },
} as const

/**
 * Room around the canvas that a moving figure may reach into: a leaning straw
 * hat, a sparkle drifting up. The figure is laid out at the canvas's size and
 * drawn into a slightly larger surface, so nothing is clipped at the box.
 */
export const BLEED = 0.08
