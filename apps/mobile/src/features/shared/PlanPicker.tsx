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
  /**
   * Whether to offer the one-off purchase.
   *
   * Off in the places that are selling a TRIAL — the onboarding step and the
   * feature gates both lead with "free for 7 days", and lifetime has no trial
   * to offer. Putting it there would make the button under it lie about one of
   * the three options.
   */
  showLifetime?: boolean
  className?: string
}

/**
 * Yearly, monthly, and optionally lifetime.
 *
 * Radio cards rather than `RadioGroup`, because each option carries a price
 * block and a badge that a plain label cannot hold. The selection state and the
 * accessibility role are the same either way.
 *
 * THE THREE CARDS ARE ONE SHAPE: a name, a line of small print under it, and a
 * price on the right. Every difference between them then reads as information
 * rather than as three cards drawn to different rules. The yearly one earns two
 * additions and no more — a small pill beside its name for the saving, and the
 * per-month figure under its price — which is exactly the comparison it is
 * asking somebody to make. It used to carry the saving as a full-size status
 * pill on a row of its own and no billing line at all, which left one card a
 * head taller than the two below it and the odd one out.
 */
export function PlanPicker({ value, onChange, showLifetime = false, className }: PlanPickerProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()

  // Computed by the store's own numbers, so it cannot drift from the prices
  // beside it the way a hardcoded "SAVE 50%" did.
  const saving = prices?.yearlySavingPercent

  return (
    <View className={cn('gap-3', className)} accessibilityRole="radiogroup">
      <PlanCard
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
        selected={value === 'monthly'}
        onPress={() => onChange('monthly')}
        title={t('plans.monthly')}
        detail={t('plans.monthlyBilling')}
        price={prices?.monthly?.priceString ?? PENDING}
      />
      {showLifetime ? (
        /* No badge here. The yearly card's is a SAVING — a number worth the
           emphasis because it is a comparison somebody can check. "PAY ONCE"
           restated the line directly under it and earned its colour with
           nothing. */
        <PlanCard
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
      /* Everything on the card, in reading order. The label overrides the
         children rather than adding to them, so anything left out of it is
         simply not announced — which is what happened to the saving and the
         billing period, the two things the card is asking somebody to weigh. */
      accessibilityLabel={[title, badge, detail, price, caption].filter(Boolean).join(', ')}
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
        {/* The badge sits ON the title's line, so a card carrying one is the
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
    </Squish>
  )
}
