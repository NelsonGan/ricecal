import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Macros, Targets } from '@/data'
import { progressOf } from '@/lib/nutrition'
import { cn, MacroBar } from '@/ui'

export type MacroBarsProps = {
  eaten: Macros
  targets: Pick<Targets, 'carbs' | 'protein' | 'fat'>
  className?: string
}

/**
 * Carbs, protein and fat as three labelled bars.
 *
 * Always in that order and always in those colours: the same triple appears on
 * Today, on a food's detail and in the weekly report, and a reader learns the
 * colour once.
 */
export function MacroBars({ eaten, targets, className }: MacroBarsProps) {
  const { t } = useTranslation()

  const rows = [
    {
      key: 'carbs',
      label: t('macro.carbs'),
      grams: eaten.carbs,
      goal: targets.carbs,
      tone: 'kaya',
    },
    {
      key: 'protein',
      label: t('macro.protein'),
      grams: eaten.protein,
      goal: targets.protein,
      tone: 'hibiscus',
    },
    { key: 'fat', label: t('macro.fat'), grams: eaten.fat, goal: targets.fat, tone: 'teh' },
  ] as const

  return (
    <View className={cn('flex-1 gap-2.5', className)}>
      {rows.map((row) => (
        <MacroBar
          key={row.key}
          label={row.label}
          amount={t('unit.grams', { value: row.grams })}
          value={progressOf(row.grams, row.goal)}
          tone={row.tone}
        />
      ))}
    </View>
  )
}
