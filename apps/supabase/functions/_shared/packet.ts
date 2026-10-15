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

/** What a meal or a moment is called, rather than a packet. */
const NOT_A_PRODUCT =
  /^(food|meal|snacks?|breakfast|brunch|lunch|dinner|supper|dessert|drinks?|tea ?time|makan|sarapan|minum petang)$/i

/**
 * A name fit for a catalogue row, or null.
 *
 * Two writers, one rule. The model's reading of a panel comes through here, and
 * so does the name somebody types onto the entry afterwards, which the
 * `barcode` function writes for a panel that arrived without one. A name that
 * one path refuses and the other accepts would be the gap the next bad row
 * walks through.
 *
 * `resolveByLabel` renames an unreadable panel to "Packaged food" so the entry
 * has something to call itself. Fine for one row in one diary, useless as a
 * catalogue name: the next person scans a box with a name printed on it and is
 * told it is "Packaged food". "Snack" and "Lunch" fail for the same reason.
 *
 * The rest is for the typed half, since a row here is read by strangers.
 * Invisible and direction-changing characters go first, or "Packaged\u200Bfood"
 * compares as a new name while reading as the old one. Then a name needs two
 * letters in some script, and it cannot be a link, a handle, a phone number or
 * anything markup could read.
 */
export function catalogueName(raw: string | null | undefined): string | null {
  const named = (raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (UNNAMED_PANEL.test(named) || /^packaged food$/i.test(named) || NOT_A_PRODUCT.test(named)) {
    return null
  }
  if ((named.match(/\p{L}/gu) ?? []).length < 2) return null
  if (
    /https?:\/\/|www\.|@|[<>]|\.(com|net|org|io|ly|co|me|app|shop|store|my|sg|xyz|info|link)\b|\d[\d\s-]{6,}\d/i.test(
      named,
    )
  ) {
    return null
  }
  // By character rather than by UTF-16 unit, so the cut never lands inside an
  // emoji and leaves half of it behind.
  return Array.from(named).slice(0, 120).join('').trim()
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

/** How long a panel waits for a name before it stops counting. */
export const PANEL_WAIT_DAYS = 30

/** A panel kept by `scan-meal`, as `packet_panels` stores it. */
export type WaitingPanel = {
  barcode: string
  kcal: number
  carbs_g: number | string
  protein_g: number | string
  fat_g: number | string
  serving_g: number | string | null
  created_at: string
}

/** The entry the panel logged, as its owner left it. */
export type NamedEntry = {
  display_label: string | null
  base_kcal: number
  base_carbs_g: number | string
  base_protein_g: number | string
  base_fat_g: number | string
  override_kcal: number | null
  override_carbs_g: number | string | null
  override_protein_g: number | string | null
  override_fat_g: number | string | null
}

/**
 * The catalogue row a renamed entry earns its waiting panel, or why not.
 *
 * Three ways to refuse, each leaving the panel to wait:
 *
 *   the name is not one a stranger should be shown;
 *   the entry no longer counts the panel's figures, because fix-by-typing
 *     re-priced it or the nutrition sheet overrode it, which is its owner saying
 *     the photo was read wrong;
 *   the panel is over a month old, past the point anyone renaming the entry is
 *     still thinking about the packet.
 *
 * Numbers are read with `Number`, since PostgREST may send `numeric` columns as
 * strings. Both sides are rounded to a tenth already, so equality is to within
 * rounding and an untouched entry always matches.
 */
export function nameForPanel(
  entry: NamedEntry,
  panel: WaitingPanel,
  now: Date = new Date(),
): { product: CatalogueProduct } | { reason: string } {
  const name = catalogueName(entry.display_label)
  if (!name) return { reason: 'not a name for strangers' }

  const same = (a: number | string, b: number | string) => Math.abs(Number(a) - Number(b)) < 0.05
  const overridden = [
    entry.override_kcal,
    entry.override_carbs_g,
    entry.override_protein_g,
    entry.override_fat_g,
  ].some((value) => value != null)
  const unchanged =
    same(entry.base_kcal, panel.kcal) &&
    same(entry.base_carbs_g, panel.carbs_g) &&
    same(entry.base_protein_g, panel.protein_g) &&
    same(entry.base_fat_g, panel.fat_g)
  if (overridden || !unchanged) return { reason: 'the owner corrected the figures' }

  const age = now.getTime() - new Date(panel.created_at).getTime()
  if (!(age <= PANEL_WAIT_DAYS * 86_400_000)) return { reason: 'the panel waited too long' }

  return {
    product: namedProduct(
      {
        barcode: Number(panel.barcode),
        kcal: Number(panel.kcal),
        carbs_g: Number(panel.carbs_g),
        protein_g: Number(panel.protein_g),
        fat_g: Number(panel.fat_g),
        serving_g: panel.serving_g == null ? null : Number(panel.serving_g),
      },
      name,
      'user_named',
    ),
  }
}
