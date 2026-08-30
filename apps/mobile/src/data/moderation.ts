import { useMutation, useQueryClient } from '@tanstack/react-query'

import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'
import type { ReportReason } from './types'

/**
 * The two things a reader can do about somebody else's cooking.
 *
 * App Review guideline 1.2 asks for four things from an app whose users see each
 * other's writing. The filter before posting is `functions/recipes
 * {action:review}`, the published contact is the help row, and taking something
 * down is `service_role`'s; these two belong to the reader.
 *
 * Neither write is what makes the recipe disappear. A restrictive read policy on
 * `recipes` does that (see `schemas/24_moderation.sql`), so every screen honours
 * it without knowing it exists, and this layer inserts the row and empties the
 * cache holding the old answer.
 *
 * The author is never told, and neither table is readable by anybody but the
 * person who wrote the row: a report is an accusation and a block is a judgement
 * about a person, and either visible to its subject starts an argument.
 */

/**
 * Report a recipe, which hides it from the reporter immediately. Three people
 * reporting the same recipe takes it off the shelf for everybody, which is
 * `report_threshold`'s job; from here it always looks the same.
 *
 * `ignoreDuplicates`, keyed on the pair. Reporting twice is the same as reporting
 * once, so a duplicate-key error would be a bug report about a feature working.
 * Ignore rather than merge, because a merging upsert is `on conflict do update`,
 * which needs an UPDATE grant `recipe_reports` deliberately has none of. It also
 * keeps the reason given first, which is the right one.
 */
export function useReportRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recipeId, reason }: { recipeId: string; reason: ReportReason }) => {
      const { error } = await supabase
        .from('recipe_reports')
        .upsert(
          { recipe_id: recipeId, reporter_id: userId, reason },
          { onConflict: 'recipe_id,reporter_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: (_result, { recipeId, reason }) => {
      // The reason and nothing else. Which recipe was reported is in Postgres,
      // where it can be acted on; what this answers is whether the four
      // reasons are the right four.
      track('Recipe Reported', { reason })
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.recipe(recipeId) })
    },
  })
}

/**
 * Block a cook, which hides everything of theirs at once.
 *
 * `authorId` is the recipe's `owner_id`. It is never the caller's own: the
 * table has a check constraint against that, because blocking yourself would
 * hide your own recipes from you and nobody would guess why.
 *
 * `ignoreDuplicates` because the pair is the primary key and blocking somebody
 * twice is not an error, for the same reason reporting twice is not.
 */
export function useBlockAuthor() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (authorId: string) => {
      const { error } = await supabase
        .from('blocked_authors')
        .upsert(
          { user_id: userId, author_id: authorId },
          { onConflict: 'user_id,author_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: () => {
      track('Author Blocked', {})
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
    },
  })
}
