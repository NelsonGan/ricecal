/**
 * How much tighter a photograph is shown than it was taken.
 *
 * The model needs the widest frame it can get, since the table and the cutlery
 * are what a portion is judged against. The person wants back the picture they
 * framed. So the shutter records and stores the wide frame, and everything that
 * draws the photo afterwards crops back in by this much, which is exactly how
 * much tighter the viewfinder already was.
 *
 * One constant, so the camera preview (`InlineCamera`) and every stored photo
 * (`MealPhoto`) cannot drift apart. It lives here rather than beside either,
 * because whichever owned it would have the other importing a camera to draw a
 * thumbnail.
 */
export const PHOTO_CROP = 1.15

/**
 * Percentages, for a box whose size is only known once it is laid out. Rounded
 * because `1.15 * 100` is not 115 in binary floating point.
 */
const pct = (fraction: number): `${number}%` => `${Math.round(fraction * 1e4) / 1e2}%`

/**
 * Fills the parent and then some, centred, so the parent's `overflow-hidden`
 * crops it evenly.
 *
 * Layout rather than a transform, because the camera needs it to be: a
 * transform is applied after layout to a view whose contents are a native
 * preview surface. A stored photo would take either, and uses this so the two
 * cannot drift.
 */
export const photoCropFill = {
  position: 'absolute',
  width: pct(PHOTO_CROP),
  height: pct(PHOTO_CROP),
  left: pct((1 - PHOTO_CROP) / 2),
  top: pct((1 - PHOTO_CROP) / 2),
} as const
