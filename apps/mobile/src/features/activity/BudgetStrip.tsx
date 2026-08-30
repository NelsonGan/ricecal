import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { cn, ProgressBar, Text } from '@/ui'
import { count } from './format'

export type BudgetStripProps = {
  goal: number
  eaten: number
  /** Active energy only. Resting is already inside `goal` — see the note below. */
  burned: number
  /** False when the user has turned the extension off in settings. */
  extends: boolean
  className?: string
}

/**
 * goal - eaten + burned = left.
 *
 * Burned calories extend the budget and never shrink what was eaten. Every app in
 * this category has at some point shipped the other version, which turns a diary
 * into a scoreboard people play by moving more and eating less. The arithmetic
 * here is an addition, laid out as one.
 *
 * `burned` is active energy rather than total burn, because `goal` is a
 * Mifflin-St Jeor figure that already contains basal metabolism: adding the
 * store's resting energy would credit about 1,500 kcal a day for being alive
 * twice.
 *
 * The bar is drawn against goal + burned, so moving lengthens the track rather
 * than emptying it. Against the goal alone, a run pushes the fill backwards.
 */
export function BudgetStrip({
  goal,
  eaten,
  burned,
  extends: extending,
  className,
}: BudgetStripProps) {
  const { t } = useTranslation('activity')

  const credited = extending ? burned : 0
  const budget = goal + credited
  const left = budget - eaten
  const over = left < 0

  return (
    <View className={cn('gap-3', className)}>
      <Text variant="overline">{t('today.budgetTitle')}</Text>

      {/* The equation as a row of terms, each with its caps label under it.
          Written out rather than reduced to one number because the reduction is
          the thing people distrust: "613 left" invites "left after what?", and
          this answers it in the same glance. */}
      <View className="flex-row items-end gap-1.5">
        <Term label={t('today.goal')} value={count(goal)} />
        <Operator symbol="−" />
        <Term label={t('today.eaten')} value={count(eaten)} />
        <Operator symbol="+" />
        <Term
          label={t('today.burned')}
          value={count(credited)}
          // The one term that is a gain. Tinted so the addition reads at a
          // glance, and greyed when the extension is switched off, which is the
          // only honest way to show a figure that is real but not being spent.
          tone={extending ? 'text-pandan-ink' : 'text-faint'}
        />
        <Operator symbol="=" />
        <Term
          label={over ? t('today.over') : t('today.left')}
          value={count(Math.abs(left))}
          tone={over ? 'text-hibiscus-ink' : 'text-heading'}
          emphasis
        />
      </View>

      <ProgressBar
        value={budget > 0 ? eaten / budget : 0}
        tone={over ? 'hibiscus' : 'pandan'}
        height={14}
        accessibilityLabel={t('today.budgetTitle')}
      />

      {extending ? null : <Text variant="meta">{t('today.budgetOff')}</Text>}
    </View>
  )
}

function Term({
  label,
  value,
  tone = 'text-heading',
  emphasis = false,
}: {
  label: string
  value: string
  tone?: string
  emphasis?: boolean
}) {
  return (
    <View className="min-w-0 flex-1 items-center gap-0.5">
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        className={cn('font-display', emphasis ? 'text-[26px]' : 'text-[20px]', tone)}
      >
        {value}
      </Text>
      <Text variant="micro" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/**
 * The operator between two terms.
 *
 * Its own component so it can sit on the numbers' baseline rather than the
 * row's: aligned to the bottom of the box it would hang below the digits,
 * because the terms carry a label under them and the operator does not.
 */
function Operator({ symbol }: { symbol: string }) {
  return (
    <Text className="pb-[18px] font-display text-[16px] text-faint" accessibilityElementsHidden>
      {symbol}
    </Text>
  )
}
