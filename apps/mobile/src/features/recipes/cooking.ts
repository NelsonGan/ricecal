import type { Recipe, RecipeIngredientInput, RecipeTag } from '@/data'

/**
 * The cook's side of a recipe: how long it takes, how much of each thing goes
 * in for the number of people tonight, and which recipes a filter chip keeps.
 *
 * Pure and React-free, like `basis.ts`, so the arithmetic the screens show is
 * the arithmetic the tests pin.
 */

/** Prep plus cook, or undefined when the cook gave neither. */
export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>) {
  if (recipe.prepMinutes == null && recipe.cookMinutes == null) return undefined
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
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
 * The chips over the Recipes shelf. `all` keeps everything; `favourites` and
 * `quick` read the row; the rest are meal tags.
 */
export type RecipeFilter = 'all' | 'favourites' | 'quick' | RecipeTag

/** What "quick" means: on the table in half an hour, prep included. */
export const QUICK_MINUTES = 30

export function matchesFilter(recipe: Recipe, filter: RecipeFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'favourites') return recipe.isFavourite
  if (filter === 'quick') {
    const total = totalMinutes(recipe)
    return total != null && total <= QUICK_MINUTES
  }
  return recipe.tags.includes(filter)
}

/**
 * Minutes as the form keeps them: digits only, empty for "not said", and
 * clamped to what `recipes.prep_minutes` accepts (two days).
 */
export const MAX_MINUTES = 2880

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
 * A name matches whole ("soy sauce"), or by its first word when that word is
 * long enough to mean something ("chicken" for "Chicken thigh"). Only the first
 * word, because the last is usually the generic half: "sauce" would put the
 * oyster sauce beside a step about the soy. A miss costs nothing, since the full
 * list is one tap away; a wrong match puts the wrong jar in the cook's hand.
 */
export function ingredientsInStep<T extends { name: string }>(step: string, ingredients: T[]): T[] {
  const text = step.toLocaleLowerCase()
  return ingredients.filter((item) => {
    const name = item.name.trim().toLocaleLowerCase()
    if (!name) return false
    if (text.includes(name)) return true
    const first = name.split(/[\s,(]+/)[0] ?? ''
    return first.length >= 4 && text.includes(first)
  })
}
