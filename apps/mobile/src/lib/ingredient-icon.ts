import type { IconRef } from '@/data/types'
// The edge functions' own matcher, imported rather than copied, the way the jobs
// Worker imports `icon-match.ts`: one table of phrases, so a recipe line drawn
// here and a name drawn on the server cannot disagree.
import { ingredientIconFor } from '../../../supabase/functions/_shared/ingredient-icons.ts'

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
  const found = ingredientIconFor(name)
  // `ICON_NAMES` on the server is written from the same files as the app's
  // registry, so a name it answers with is a drawing the app has.
  const icon = found ? ({ set: found.set, name: found.name } as IconRef) : undefined
  cache.set(name, icon)
  return icon
}
