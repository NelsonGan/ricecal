/**
 * How much tighter a photograph is SHOWN than it was taken.
 *
 * There are two readers of a plate and they want opposite things. The MODEL
 * wants the widest frame it can get: the table, the cutlery and the rest of the
 * plate are what a portion is judged against, and a plate cropped at its rim is
 * a plate with nothing beside it to size it by. The PERSON wants back the
 * picture they framed — food filling the square, not floating in a photo of a
 * table.
 *
 * So the shutter records the wide frame, the wide frame is what is stored and
 * what the cascade reads, and everything that DRAWS the photo afterwards crops
 * back in by this much — which is exactly the amount the viewfinder was already
 * tighter than the capture. One constant serves both ends: the same box lays
 * out the camera preview (`InlineCamera`) and every stored photo the app shows
 * (`MealPhoto`), so what comes back in the diary is what was on screen when the
 * shutter went.
 *
 * Change it and both move together, which is the property worth having. Two
 * numbers, one for the preview and one for the display, is a diary whose
 * pictures are quietly framed differently from the viewfinder that took them.
 *
 * It lives here rather than beside either of them because those two are the
 * ends of one decision, in different feature folders, and whichever of them
 * owned the number would have the other importing a camera to draw a thumbnail
 * or a row component to open a camera.
 */
export const PHOTO_CROP = 1.15

/**
 * Percentages, for a box whose size is only known once it is laid out. Rounded
 * because `1.15 * 100` is not 115 in binary floating point, and the width of a
 * view is not the place to find that out.
 */
const pct = (fraction: number): `${number}%` => `${Math.round(fraction * 1e4) / 1e2}%`

/**
 * Fills the parent and then some, centred, so the overflow is cropped evenly.
 *
 * This is LAYOUT rather than a transform, and the parent's `overflow-hidden` is
 * what does the cropping. It HAS to be layout for the camera: a transform is
 * applied after layout to a view whose contents are a native preview surface
 * rather than anything React Native draws. A stored photo would take either, and
 * uses this one so the two cannot drift.
 *
 * Half the overhang is pulled back on each axis, so the middle of what is shown
 * is the middle of what was taken.
 */
export const photoCropFill = {
  position: 'absolute',
  width: pct(PHOTO_CROP),
  height: pct(PHOTO_CROP),
  left: pct((1 - PHOTO_CROP) / 2),
  top: pct((1 - PHOTO_CROP) / 2),
} as const
