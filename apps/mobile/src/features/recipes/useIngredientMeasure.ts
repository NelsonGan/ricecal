import { useTranslation } from 'react-i18next'

import type { RecipeIngredientInput } from '@/data'
import { useMeasureText } from '@/features/shared/useMeasureText'
import { keyOf, shownAmount } from './basis'

/**
 * An ingredient's amount as the cook measured it: "2 tbsp" for a row stored as
 * 29.57 ml, "200 g", "3 pieces".
 */
export function useIngredientMeasure() {
  const { t } = useTranslation('recipes')
  const measure = useMeasureText()
  return (item: Pick<RecipeIngredientInput, 'amount' | 'unit' | 'displayUnit'>) => {
    const key = keyOf(item.unit, item.displayUnit)
    const shown = shownAmount(item.amount, key)
    return key === 'piece'
      ? `${shown.toLocaleString()} ${t('ingredient.unit.piece', { count: shown })}`
      : measure.amount(shown, key)
  }
}
