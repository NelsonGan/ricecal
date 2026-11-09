/**
 * The RiceCal palette, lifted from the app's own generated tokens
 * (`apps/mobile/global.css`, itself generated from `src/theme/tokens.ts`).
 *
 * Marketing scenes are the one place the app's "colour is for state and data,
 * never decoration" rule is relaxed: a store gallery has to catch an eye. The
 * hues are still only these, so a screenshot and the frame around it read as
 * one thing.
 */

export const C = {
  canvas: '#F6F8F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F4F1',

  line: '#E4E8E5',
  track: '#EDF1EE',
  lineStrong: '#D6DCD8',

  ink: '#1C2321',
  heading: '#1B3A2B',
  body: '#495450',
  muted: '#6E7B74',
  faint: '#9AA5A0',

  pandan: '#2FBF71',
  pandanSlab: '#1B8A4E',
  pandanSoft: '#EAF9F0',
  pandanSoftLine: '#CFEBDA',

  hibiscus: '#FF4D6D',
  hibiscusSlab: '#D62F4E',
  hibiscusSoft: '#FFEEF1',
  hibiscusSoftLine: '#F7D2DA',

  kaya: '#FFC145',
  kayaSlab: '#D99A1F',
  kayaSoft: '#FFF3D6',
  kayaSoftLine: '#F0DDAE',
  kayaInk: '#3D2B14',

  water: '#4CC9F0',
  waterSlab: '#1B87A8',
  waterSoft: '#EAF7FC',
  waterSoftLine: '#BEE6F5',

  teh: '#C98B5E',
  tehSlab: '#A66C43',
  /**
   * The app defines teh as a fill and a slab only, because in the app it is a
   * data colour: the fat bar, and nothing else. The panel needs a fifth card
   * tint, so these two are derived from `teh` the same way the app derives its
   * other soft pairs. They exist here rather than inline so the set of hues in
   * the whole tool is still one list.
   */
  tehSoft: '#F6EDE6',
  tehSoftLine: '#E7D3C3',
} as const;

/** Radius scale. Nothing in RiceCal has a sharp corner. */
export const R = {
  sm: 14,
  md: 20,
  tile: 22,
  sheet: 24,
  card: 28,
  full: 999,
} as const;

/**
 * A squishy button, the app's signature: a solid unblurred slab under a filled
 * shape. Scaled up for the export canvas, where 6px would vanish.
 */
export function slab(color: string, depth = 6): string {
  return `0 ${depth}px 0 ${color}`;
}
