import type { IconRef } from '@/data/types'

/**
 * The edge functions' own matcher, imported rather than copied, the way the jobs
 * Worker imports `icon-match.ts`: one table of phrases, so a recipe line drawn
 * here and a name drawn on the server cannot disagree.
 *
 * Required on first use rather than imported, because `data/mappers.ts` imports
 * this file and the app loads that at launch: the catalogue's matcher sorts its
 * whole table when it loads, and a launch that never opens a recipe should not
 * pay for it.
 */
type Matcher = typeof import('../../../supabase/functions/_shared/ingredient-icons.ts')
let matcher: Matcher['ingredientIconFor'] | undefined

/**
 * The drawing for one ingredient line of a recipe, from its name.
 *
 * Worked out on the device rather than stored on the row, so every recipe has
 * them at once: the ones written before the drawings existed, the community's,
 * a typed line, a line read from a photo or a video. Nothing about the line has
 * to change for it to be drawn, and a better phrase table redraws them all.
 *
 * Cached, because a checklist asks for every line on every render and the
 * answer for "Garlic" never changes.
 */
const cache = new Map<string, IconRef | undefined>()

export function ingredientIcon(name: string): IconRef | undefined {
  if (cache.has(name)) return cache.get(name)
  matcher ??= (require('../../../supabase/functions/_shared/ingredient-icons.ts') as Matcher)
    .ingredientIconFor
  const found = matcher(name)
  // `ICON_NAMES` on the server is written from the same files as the app's
  // registry, so a name it answers with is a drawing the app has.
  const icon = found ? ({ set: found.set, name: found.name } as IconRef) : undefined
  cache.set(name, icon)
  return icon
}
