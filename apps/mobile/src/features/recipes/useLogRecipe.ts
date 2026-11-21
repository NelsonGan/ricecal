import { useTranslation } from 'react-i18next'

import { type Recipe, useLogFood, useRemoveEntry, useSelectedDate } from '@/data'
import { useToast } from '@/ui'
import { recipeLog } from './cooking'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Which day a recipe logs into. Today, from the Recipes tab and anything opened
 * from it: it is a tab of its own now, and the diary's selected day is whatever
 * somebody last looked at on Today, so "Add to today" used to file tonight's
 * dinner under yesterday. The log sheet is the exception, and says so by
 * passing its day as `date` when it opens a recipe.
 */
export function useRecipeLogDate(date?: string) {
  const { todayKey } = useSelectedDate()
  const logDate = date && DATE_KEY.test(date) ? date : todayKey
  return { logDate, isToday: logDate === todayKey }
}

/**
 * Servings of a recipe into the diary, the same way from every door: the card's
 * plus, the recipe's sheet and the end of cook mode. Confirmed once the row is
 * written, with an undo, because two of those doors are one tap; and a failure
 * says so rather than leaving a success toast over nothing.
 */
export function useLogRecipe() {
  const { t } = useTranslation(['recipes', 'common'])
  const toast = useToast()
  const logFood = useLogFood()
  const removeEntry = useRemoveEntry()

  const log = (recipe: Recipe, quantity: number, logDate: string, onLogged?: () => void) => {
    logFood.mutate(recipeLog(recipe, quantity, logDate), {
      onSuccess: (row) => {
        toast.show({
          title: t('recipes:card.logged', { name: recipe.name }),
          tone: 'success',
          action: {
            label: t('common:action.undo'),
            onPress: () => removeEntry.mutate({ id: row.id, logDate, source: 'quickAdd' }),
          },
        })
        onLogged?.()
      },
      onError: () => toast.show({ title: t('recipes:edit.saveFailed'), tone: 'error' }),
    })
  }

  return { log, pending: logFood.isPending }
}
