import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { cn, Text } from '@/ui'

/**
 * Grams at a tenth below ten and whole above, which is what the figure is worth:
 * "0.5g" of protein in a sauce is information, "52.3g" of carbs is noise.
 */
const gramsFigure = (value: number) =>
  value >= 10 ? Math.round(value).toLocaleString() : String(Math.round(value * 10) / 10)

const MACROS = [
  { key: 'carbs', dot: 'bg-kaya' },
  { key: 'protein', dot: 'bg-hibiscus' },
  { key: 'fat', dot: 'bg-teh' },
] as const

/**
 * Carbs, protein and fat as three coloured dots, each with its grams: one quiet
 * line under a part of a plate, so what the part brings is read at a glance
 * without a table. The colours are the macro bars' own, which is what lets a
 * row leave the names out; `named` puts them back once, on the total, as the
 * key to the rest.
 *
 * One accessible element that says the names in full, since a dot says nothing
 * to a screen reader.
 */
export function MacroDots({
  carbs,
  protein,
  fat,
  named = false,
  className,
}: {
  carbs: number
  protein: number
  fat: number
  named?: boolean
  className?: string
}) {
  const { t } = useTranslation('common')
  const values = { carbs, protein, fat }
  const spoken = MACROS.map(
    (m) => `${t(`macro.${m.key}`)} ${t('unit.grams', { value: gramsFigure(values[m.key]) })}`,
  ).join(', ')

  return (
    <View
      accessible
      accessibilityLabel={spoken}
      className={cn('flex-row flex-wrap items-center gap-x-3 gap-y-1', className)}
    >
      {MACROS.map((m) => (
        <View key={m.key} className="flex-row items-center gap-1.5">
          <View className={cn('h-2.5 w-2.5 rounded-full', m.dot)} />
          <Text variant="meta">
            {t('unit.grams', { value: gramsFigure(values[m.key]) })}
            {named ? ` ${t(`macro.${m.key}`)}` : ''}
          </Text>
        </View>
      ))}
    </View>
  )
}
