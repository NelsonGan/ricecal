import { useTranslation } from 'react-i18next'

import { amountText, type MeasureUnit } from '@/lib/measures'
import { formatPortion, type PortionWords } from '@/lib/portions'

/**
 * The figure an amount in a unit reads as. Whole grams and millilitres, with
 * the thousands separator; spoons and cups as the quarters a measuring set has
 * ("1½ tbsp", "¾ cup"); kilograms and litres with plain decimals, since "1½ kg"
 * reads like a recipe from another century.
 */
export function measureFigure(unit: MeasureUnit, amount: number): string {
  if (unit === 'g' || unit === 'ml') {
    // Whole from 50 up, as `roundedFor` rounds them: below that a gram is a
    // visible share of the amount, and 10.5 g printed as "11" disagreed with
    // the 10.5 stored and costed.
    return amount >= 50 ? Math.round(amount).toLocaleString() : amountText(amount)
  }
  if (unit === 'kg' || unit === 'l') return amountText(amount)
  return formatPortion(amount)
}

/**
 * The count a unit's plural agrees with. A fraction of one reads as one, "¾
 * cup" rather than "¾ cups", where i18next's English rules call anything but
 * exactly 1 plural.
 */
export const pluralCount = (amount: number) => (amount > 0 && amount < 1 ? 1 : amount)

/**
 * Amounts and unit names in the language the app is read in. A hook rather than
 * a function taking `t`, because every caller has its own namespaces and these
 * keys live in `common`.
 */
export function useMeasureText() {
  const { t } = useTranslation('common')
  return {
    /** "150 g", "2 tbsp", "小さじ2". */
    amount: (amount: number, unit: MeasureUnit) =>
      t(`measure.${unit}`, { count: pluralCount(amount), value: measureFigure(unit, amount) }),
    /** "tbsp", "cups": the unit alone, agreeing with the figure beside it. */
    unit: (unit: MeasureUnit, count = 1) => t(`measureUnit.${unit}`, { count: pluralCount(count) }),
  }
}

/**
 * What `portionLabel` needs to say an amount in the app's language: servings
 * counted in its own word, and units as `useMeasureText` says them.
 */
export function usePortionWords(): PortionWords {
  const { t } = useTranslation('logging')
  const measure = useMeasureText()
  return {
    servings: (quantity) =>
      t('detail.servingCount', { count: pluralCount(quantity), value: formatPortion(quantity) }),
    measured: measure.amount,
  }
}
