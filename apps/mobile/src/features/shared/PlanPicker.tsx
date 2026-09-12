import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { Badge, cn, Squish, Text } from '@/ui'

/**
 * What a price reads as before the store has answered.
 *
 * A dash rather than a guess, which is the same symbol a stat tile uses for a
 * missing measurement. The alternative was a figure written in this repo, and
 * it was wrong for every Malaysian user (shown dollars, charged ringgit) and
 * wrong again whenever a price moved without an app release.
 */
const PENDING = '—'

export type PlanPickerProps = {
  value: Plan
  onChange: (plan: Plan) => void
  /** Whether to offer the one-off purchase beside the subscriptions. */
  showLifetime?: boolean
  /** A purchase or restore currently owns the store SDK. */
  disabled?: boolean
  className?: string
}

/** Yearly, monthly, and optionally lifetime, as one radio-style choice. */
export function PlanPicker({
  value,
  onChange,
  showLifetime = false,
  disabled = false,
  className,
}: PlanPickerProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()

  // Computed by the store's own numbers, so it cannot drift from the prices
  // beside it the way a hardcoded "SAVE 50%" did.
  const saving = prices?.yearlySavingPercent

  return (
    <View className={cn('gap-3', className)} accessibilityRole="radiogroup">
      <PlanCard
        disabled={disabled}
        selected={value === 'yearly'}
        onPress={() => onChange('yearly')}
        title={t('plans.yearly')}
        badge={saving && saving > 0 ? t('plans.yearlyBadge', { percent: saving }) : undefined}
        detail={t('plans.yearlyBilling')}
        price={prices?.yearly?.priceString ?? PENDING}
        caption={
          prices?.yearly?.perMonthString
            ? t('plans.perMonth', { price: prices.yearly.perMonthString })
            : undefined
        }
      />
      <PlanCard
        disabled={disabled}
        selected={value === 'monthly'}
        onPress={() => onChange('monthly')}
        title={t('plans.monthly')}
        detail={t('plans.monthlyBilling')}
        price={prices?.monthly?.priceString ?? PENDING}
      />
      {showLifetime ? (
        /* No badge here. The yearly card's is a SAVING, a number worth the
           emphasis because it is a comparison somebody can check. "PAY ONCE"
           restated the line directly under it and earned its colour with
           nothing. */
        <PlanCard
          disabled={disabled}
          selected={value === 'lifetime'}
          onPress={() => onChange('lifetime')}
          title={t('plans.lifetime')}
          detail={t('plans.lifetimeDetail')}
          price={prices?.lifetime?.priceString ?? PENDING}
        />
      ) : null}
    </View>
  )
}

type PlanCardProps = {
  disabled: boolean
  selected: boolean
  onPress: () => void
  title: string
  badge?: string
  detail?: string
  price: string
  caption?: string
}

function PlanCard({
  disabled,
  selected,
  onPress,
  title,
  badge,
  detail,
  price,
  caption,
}: PlanCardProps) {
  return (
    <Squish
      depth={selected ? 5 : 0}
      radius={20}
      slabClassName={selected ? 'bg-pandan-soft-line' : ''}
      className={cn(
        'gap-2 border-[3px] p-4',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
        disabled && 'opacity-60',
      )}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      /* Everything on the card, in reading order. The label overrides the
         children rather than adding to them, so the saving and billing period
         cannot disappear from the choice a screen reader hears. */
      accessibilityLabel={[title, badge, detail, price, caption].filter(Boolean).join(', ')}
    >
      <View className="w-full">
        <View className="flex-row items-center gap-3.5">
          <View
            className={cn(
              'h-[24px] w-[24px] items-center justify-center rounded-full border-[3px]',
              selected ? 'border-pandan' : 'border-line-strong',
            )}
          >
            {selected ? <View className="h-[11px] w-[11px] rounded-full bg-pandan" /> : null}
          </View>

          <View className="min-w-0 flex-1 items-start gap-1">
            {/* The badge sits on the title's line, so a card carrying one is the
                same height as a card that does not. */}
            <View className="flex-row items-center gap-2">
              <Text variant="label" className="text-[16px]">
                {title}
              </Text>
              {badge ? (
                <Badge size="sm" className="bg-pandan" labelClassName="text-on-pandan">
                  {badge}
                </Badge>
              ) : null}
            </View>
            {detail ? <Text variant="meta">{detail}</Text> : null}
          </View>

          <View className="items-end gap-0.5">
            <Text variant="subtitle" className="text-ink">
              {price}
            </Text>
            {caption ? <Text variant="meta">{caption}</Text> : null}
          </View>
        </View>
      </View>
    </Squish>
  )
}
