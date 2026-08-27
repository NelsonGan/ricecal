import { useMutation, useQueryClient } from '@tanstack/react-query'

import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'
import type { ReportReason } from './types'

/**
 * The two things a reader can do about somebody else's cooking.
 *
 * App Review guideline 1.2 asks an app whose users can see each other's writing
 * for four things, and the community shelf is exactly that. The filter before
 * anything is posted is `functions/recipes {action:review}`; the published
 * contact is the help row; taking something down is `service_role`'s. These are
 * the two that belong to the reader: report it, and never see that cook again.
 *
 * NEITHER WRITE IS WHAT MAKES THE RECIPE DISAPPEAR. A restrictive read policy
 * on `recipes` does that — see `schemas/24_moderation.sql` — so the shelf, the
 * detail screen, the ingredient rows and everything written next all honour it
 * without knowing it exists. All this layer does is insert the row and empty
 * the cache that is still holding the old answer.
 *
 * THE AUTHOR IS NEVER TOLD, and neither table is readable by anyone but the
 * person who wrote the row. A report is an accusation and a block is a
 * judgement about a person; either one visible to its subject turns a
 * moderation tool into a way to start an argument.
 */

/**
 * Report a recipe, which hides it from the reporter immediately.
 *
 * Three separate people reporting the same recipe takes it off the shelf for
 * everybody, and that is the database's job rather than this one's — see
 * `report_threshold`. From here it always looks the same.
 *
 * `ignoreDuplicates`, keyed on the pair, and both halves of that matter.
 * Reporting twice is the same as reporting once, so a duplicate-key error shown
 * to somebody who had already reported this recipe would be a bug report about
 * a feature working. And IGNORE rather than MERGE, because the difference is a
 * grant: PostgREST turns a merging upsert into `on conflict do update`, which
 * needs UPDATE, and `recipe_reports` deliberately has none — so the merging
 * form comes back 403 and the screen says "could not do that" about a report
 * that is simply already filed. Ignoring conflicts needs only INSERT, and it
 * keeps the reason given the FIRST time, which is the right one: a report is a
 * record rather than a setting.
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
