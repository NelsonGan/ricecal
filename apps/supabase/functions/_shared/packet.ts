/**
 * What a packet's catalogue row may be called, and how its figures become one.
 *
 * Its own module because two functions need it: `scan-meal`, which reads a
 * panel off a photo, and `barcode`, which names a panel that arrived without a
 * name. Living in `cascade.ts` would bundle the whole scan pipeline into the
 * barcode lookup to reach a name check.
 */

import type { CatalogueProduct, ProductSource } from './catalogue.ts'

/**
 * A panel whose PRODUCT name did not come through.
 *
 * A close-up of the panel has no product name in it, so what the model sends
 * back is the table's own heading ("Nutrition Facts") or the model shrugging
 * ("Unidentified Food Product", from a real scan). The prompt asks for null;
 * this is the belt to its braces.
 *
 * Shared by the two readers of a label, and that sharing is the point.
 * `resolveByLabel` swaps the name for "Packaged food" so the diary entry has
 * something to call itself, and `catalogueName` refuses it as a catalogue name.
 * They were separate tests for a while, against different strings: the second
 * one checked for "Packaged food" and never saw it, because it reads the RAW
 * label rather than the renamed one. A panel headed "Nutrition Facts" went
 * into the catalogue under that name.
 */
export const UNNAMED_PANEL =
  /^(nutrition|nutritional)\s*(facts|information|panel)?$|\b(unidentified|unknown|unnamed|generic)\b/i

/**
 * A name fit for a catalogue row, or null.
 *
 * Two readers, one rule. The model's reading of a panel comes through here, and
 * so does the name somebody types onto the entry afterwards, which the
 * `barcode` function writes for a panel that arrived without one. A name that
 * one path refuses and the other accepts would be the gap the next bad row
 * walks through.
 *
 * `resolveByLabel` renames an unreadable panel to "Packaged food" so the entry
 * has something to call itself. Fine for one row in one diary, useless as a
 * catalogue name: the next person scans a box with a name printed on it and is
 * told it is "Packaged food".
 *
 * The last two checks are for the typed half. A row here is read by strangers,
 * so a name has to contain a letter in some script, and it cannot be a link.
 */
export function catalogueName(raw: string | null | undefined): string | null {
  const named = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (named.length < 2 || UNNAMED_PANEL.test(named) || /^packaged food$/i.test(named)) {
    return null
  }
  if (!/\p{L}/u.test(named)) return null
  if (/https?:\/\/|www\.|@/i.test(named)) return null
  return named.slice(0, 120)
}

/** A panel's figures for one packet, judged and rounded, before it has a name. */
export type PanelFigures = Pick<
  CatalogueProduct,
  'barcode' | 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g' | 'serving_g'
>

/** The catalogue row for a packet once its figures have a name to go with. */
export function namedProduct(
  figures: PanelFigures,
  name: string,
  source: ProductSource,
): CatalogueProduct {
  // The panel is the back of the box and the brand is on the front. Left null
  // rather than guessed out of the product name.
  return { ...figures, name, brand: null, source }
}
