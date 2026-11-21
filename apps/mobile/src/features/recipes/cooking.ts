import type { LogInput, Recipe, RecipeIngredientInput } from '@/data'
// The module itself rather than the `@/data` barrel, which would pull in the
// client and the router and make this file anything but pure.
import { snapshotFromRecipe } from '@/data/snapshot'

/**
 * The cook's side of a recipe: how long it takes, how much of each thing goes
 * in for the number of people tonight, and which recipes a filter chip keeps.
 *
 * Pure and React-free, like `basis.ts`, so the arithmetic the screens show is
 * the arithmetic the tests pin.
 */

/**
 * Prep plus cook, or undefined when the cook gave neither, or gave nothing but
 * zeros: "0 min" on a card reads as a recipe that takes no time.
 */
export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>) {
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  return total > 0 ? total : undefined
}

/**
 * What one ingredient comes to when the pot is cooked for `cooking` people
 * instead of the `servings` it was written for. Only the amount moves: the
 * per-unit figures are the food's density, which does not change with the pot.
 */
export function scaleIngredient<T extends Pick<RecipeIngredientInput, 'amount'>>(
  item: T,
  servings: number,
  cooking: number,
): T {
  if (servings <= 0 || cooking === servings) return item
  return { ...item, amount: (item.amount * cooking) / servings }
}

/**
 * Servings of a recipe as a diary entry. One builder for the card's plus, the
 * recipe's own sheet and the end of cook mode, so the three cannot drift on
 * where the entry says it came from.
 */
export function recipeLog(recipe: Recipe, quantity: number, logDate: string): LogInput {
  return {
    snapshot: snapshotFromRecipe(recipe),
    quantity,
    logDate,
    source: 'quickAdd',
    method: 'recipe',
  }
}

/**
 * Minutes as the form keeps them: digits only, empty for "not said", and
 * clamped to what `recipes.prep_minutes` accepts (two days).
 */
const MAX_MINUTES = 2880

export function parseMinutes(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '')
  if (!digits) return null
  return Math.min(MAX_MINUTES, Number.parseInt(digits, 10))
}

/**
 * A source link as the column accepts it: http or https, no spaces, at most
 * 2,000 characters. A bare "instagram.com/reel/…" gets its scheme, because
 * nobody types one and the check would refuse the save over it.
 */
export function normaliseSourceUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  if (/\s/.test(withScheme) || withScheme.length > 2000) return null
  if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(withScheme)) return null
  return withScheme
}

/** The host a source link is shown as: "instagram.com", not the whole URL. */
export function sourceHost(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url)
  return match?.[1] ?? url
}

/**
 * The ingredients a step mentions, for the "You need" card in cook mode.
 *
 * Whole words only, and every word of the name: "Rice vinegar" needs both, so
 * "cook the rice" does not put the vinegar in the cook's hand, and "Corn" does
 * not match "cornflour". A plural on either side still matches ("potato" in
 * "the potatoes"). The one shortcut is a name that ends in a cut of meat,
 * where the meat alone is how a method says it: "Chicken thighs" for "add the
 * chicken". A miss costs nothing, since the full list is one tap away; a wrong
 * match puts the wrong jar in the cook's hand, so the rule leans to missing.
 */
export function ingredientsInStep<T extends { name: string }>(step: string, ingredients: T[]): T[] {
  const said = new Set(words(step))
  const mentioned = (word: string) =>
    said.has(word) ||
    said.has(`${word}s`) ||
    said.has(`${word}es`) ||
    (word.endsWith('s') && said.has(word.slice(0, -1))) ||
    (word.endsWith('es') && said.has(word.slice(0, -2)))

  return ingredients.filter((item) => {
    const name = words(item.name)
    if (name.length === 0) return false
    if (name.every(mentioned)) return true
    const last = name[name.length - 1] ?? ''
    return name.length > 1 && CUTS.has(last) && mentioned(name[0] ?? '')
  })
}

/** A name's or a step's words, lower case, without punctuation. */
function words(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .split(/[\s,.;:!?()"'/-]+/)
    .filter(Boolean)
}

/** Parts of an animal, after which a method names only the animal. */
const CUTS = new Set([
  'thigh',
  'thighs',
  'breast',
  'breasts',
  'wing',
  'wings',
  'drumstick',
  'drumsticks',
  'leg',
  'legs',
  'fillet',
  'fillets',
  'belly',
  'mince',
  'chop',
  'chops',
  'ribs',
  'shoulder',
  'shank',
  'loin',
])
