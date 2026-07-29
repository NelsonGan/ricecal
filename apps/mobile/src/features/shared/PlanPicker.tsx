import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/mock'
import { Badge, cn, Squish, Text } from '@/ui'

export type PlanPickerProps = {
  value: Plan
  onChange: (plan: Plan) => void
  className?: string
}

/**
 * Yearly or monthly.
 *
 * A pair of radio cards rather than `RadioGroup`, because each option carries a
 * price block and a savings badge that a plain label cannot hold. The selection
 * state and the accessibility role are the same either way.
 */
export function PlanPicker({ value, onChange, className }: PlanPickerProps) {
  const { t } = useTranslation('paywall')

  return (
    <View className={cn('gap-3', className)} accessibilityRole="radiogroup">
      <PlanCard
        selected={value === 'yearly'}
        onPress={() => onChange('yearly')}
        title={t('hard.yearly')}
        badge={t('hard.yearlyBadge')}
        price={t('hard.yearlyPrice')}
        caption={t('hard.yearlyPerMonth')}
      />
      <PlanCard
        selected={value === 'monthly'}
        onPress={() => onChange('monthly')}
        title={t('hard.monthly')}
        detail={t('hard.monthlyBilling')}
        price={t('hard.monthlyPrice')}
      />
    </View>
  )
}

type PlanCardProps = {
  selected: boolean
  onPress: () => void
  title: string
  badge?: string
  detail?: string
  price: string
  caption?: string
}

function PlanCard({ selected, onPress, title, badge, detail, price, caption }: PlanCardProps) {
  return (
    <Squish
      depth={selected ? 5 : 0}
      radius={20}
      slabClassName={selected ? 'bg-pandan-soft-line' : ''}
      className={cn(
        'flex-row items-center gap-3.5 border-[3px] p-4',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${price}${caption ? `, ${caption}` : ''}`}
    >
      <View
        className={cn(
          'h-[24px] w-[24px] items-center justify-center rounded-full border-[3px]',
          selected ? 'border-pandan' : 'border-line-strong',
        )}
      >
        {selected ? <View className="h-[11px] w-[11px] rounded-full bg-pandan" /> : null}
      </View>

      <View className="min-w-0 flex-1 items-start gap-1">
        <Text variant="label" className="text-[16px]">
          {title}
        </Text>
        {badge ? (
          <Badge tone="pandan" className="bg-pandan">
            <Text className="font-body-black text-[11px] leading-[13px] text-on-pandan">
              {badge}
            </Text>
          </Badge>
        ) : null}
        {detail ? <Text variant="meta">{detail}</Text> : null}
      </View>

      <View className="items-end gap-0.5">
        <Text className="font-display text-[18px] leading-[23px] text-ink">{price}</Text>
        {caption ? <Text variant="meta">{caption}</Text> : null}
      </View>
    </Squish>
  )
}
