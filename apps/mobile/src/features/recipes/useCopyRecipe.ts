import { FREE_RECIPES } from '@ricecal/shared'
import { useTranslation } from 'react-i18next'
import { isRecipeLimit, useRecipeQuota, useSaveRecipeCopy } from '@/data'
import { openPaywall } from '@/data/refusals'
import { useRequirePro } from '@/features/paywall'
import { useToast } from '@/ui'

/**
 * Saves a copy of somebody else's food to the viewer's own shelf, gated and
 * told the way the food's own page does it. Shared by that page and a food
 * card in a group chat, so the two cannot disagree about the ceiling.
 *
 * Resolves to the copy's id, or null when it was refused or failed, having
 * said why.
 */
export function useCopyRecipe() {
  const { t } = useTranslation('recipes')
  const toast = useToast()
  const requirePro = useRequirePro()
  const quota = useRecipeQuota()
  const saveCopy = useSaveRecipeCopy()

  const copy = async (source: { recipeId: string; shareSlug?: string }): Promise<string | null> => {
    // A saved copy is a food of yours: it lands on your shelf, it is yours to
    // edit, and the database counts it against the same three. So the gate is
    // here as well as on the plus button, or "save somebody else's" would be
    // the way round the ceiling, and the user would meet a trigger's error
    // message instead of a paywall.
    if (quota.atLimit && !requirePro('new_recipe')) return null
    try {
      const newId = await saveCopy.mutateAsync(source)
      toast.show({ title: t('detail.savedCopy'), tone: 'success' })
      return newId
    } catch (error) {
      // The trigger refusing, rather than the write failing. Reachable even
      // past the guard above: the count read here can be a shelf out of date
      // (another phone saved a third recipe a minute ago), and "could not save
      // that" would send somebody to try again at a ceiling that is not going
      // to move. Same answer as the recipe form gives.
      if (isRecipeLimit(error)) {
        // Through `openPaywall`, so the toast comes from the top like every
        // other one that opens this screen: the paywall's buy button is a
        // footer, and a bottom toast lands on it.
        openPaywall(toast, {
          title: t('edit.limitReached', { count: FREE_RECIPES }),
          feature: 'new_recipe',
        })
        return null
      }
      toast.show({ title: t('detail.saveCopyFailed'), tone: 'error' })
      return null
    }
  }
  return { copy, busy: saveCopy.isPending }
}
