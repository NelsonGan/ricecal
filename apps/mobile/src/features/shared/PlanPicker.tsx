import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, cn, Icon, Squish, Text } from '@/ui'

/**
 * What a price reads as before the store has answered.
 *
 * A dash rather than a guess, which is the same symbol a stat tile uses for a
 * missing measurement. The alternative was a figure written in this repo, and
 * it was wrong for every Malaysian user (shown dollars, charged ringgit) and
 * wrong again whenever a price moved without an app release.
 */
const PENDING = '—'

type PlanPickerBaseProps = {
  /**
   * Whether to offer the one-off purchase.
   *
   * Lifetime has no introductory offer, so purchase screens use its regular
   * one-off terms regardless of the subscription trial eligibility beside it.
   */
  showLifetime?: boolean
  className?: string
}

export type PlanPickerProps = PlanPickerBaseProps &
  (
    | {
        /** A radio-style chooser whose selected plan is acted on elsewhere. */
        mode?: 'select'
        value: Plan
        onChange: (plan: Plan) => void
      }
    | {
        /** Every card is the purchase action for the plan it describes. */
        mode: 'purchase'
        onPurchase: (plan: Plan) => void
        /** The store terms displayed on each directly actionable plan. */
        disclosures: Partial<Record<Plan, string>>
        /** Disables every plan while one store sheet is being opened. */
        pendingPlan?: Plan | null
        /** Another store action, such as restore, currently owns the SDK. */
        disabled?: boolean
      }
  )

/**
 * Yearly, monthly, and optionally lifetime.
 *
 * Select mode is a radio group for flows with a separate continue button.
 * Purchase mode replaces the radio with an arrow and makes the full card the
 * action, for a paywall where there is no second confirmation button in-app.
 */
export function PlanPicker(props: PlanPickerProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()
  const purchaseMode = props.mode === 'purchase'
  const choose = (plan: Plan) => (purchaseMode ? props.onPurchase(plan) : props.onChange(plan))
  const selected = (plan: Plan) => !purchaseMode && props.value === plan

  // Computed by the store's own numbers, so it cannot drift from the prices
  // beside it the way a hardcoded "SAVE 50%" did.
  const saving = prices?.yearlySavingPercent

  return (
    <View
      className={cn('gap-3', props.className)}
      accessibilityRole={purchaseMode ? undefined : 'radiogroup'}
    >
      <PlanCard
        action={purchaseMode}
        busy={purchaseMode && props.pendingPlan === 'yearly'}
        disabled={purchaseMode && (props.pendingPlan != null || props.disabled === true)}
        selected={selected('yearly')}
        onPress={() => choose('yearly')}
        title={t('plans.yearly')}
        badge={saving && saving > 0 ? t('plans.yearlyBadge', { percent: saving }) : undefined}
        detail={t('plans.yearlyBilling')}
        price={prices?.yearly?.priceString ?? PENDING}
        caption={
          prices?.yearly?.perMonthString
            ? t('plans.perMonth', { price: prices.yearly.perMonthString })
            : undefined
        }
        disclosure={purchaseMode ? props.disclosures.yearly : undefined}
      />
      <PlanCard
        action={purchaseMode}
        busy={purchaseMode && props.pendingPlan === 'monthly'}
        disabled={purchaseMode && (props.pendingPlan != null || props.disabled === true)}
        selected={selected('monthly')}
        onPress={() => choose('monthly')}
        title={t('plans.monthly')}
        detail={t('plans.monthlyBilling')}
        price={prices?.monthly?.priceString ?? PENDING}
        disclosure={purchaseMode ? props.disclosures.monthly : undefined}
      />
      {props.showLifetime ? (
        /* No badge here. The yearly card's is a SAVING — a number worth the
           emphasis because it is a comparison somebody can check. "PAY ONCE"
           restated the line directly under it and earned its colour with
           nothing. */
        <PlanCard
          action={purchaseMode}
          busy={purchaseMode && props.pendingPlan === 'lifetime'}
          disabled={purchaseMode && (props.pendingPlan != null || props.disabled === true)}
          selected={selected('lifetime')}
          onPress={() => choose('lifetime')}
          title={t('plans.lifetime')}
          detail={t('plans.lifetimeDetail')}
          price={prices?.lifetime?.priceString ?? PENDING}
          disclosure={purchaseMode ? props.disclosures.lifetime : undefined}
        />
      ) : null}
    </View>
  )
}

type PlanCardProps = {
  action: boolean
  busy: boolean
  disabled: boolean
  selected: boolean
  onPress: () => void
  title: string
  badge?: string
  detail?: string
  price: string
  caption?: string
  disclosure?: string
}

function PlanCard({
  action,
  busy,
  disabled,
  selected,
  onPress,
  title,
  badge,
  detail,
  price,
  caption,
  disclosure,
}: PlanCardProps) {
  const colors = useThemeColors()

  return (
    <Squish
      depth={action ? 4 : selected ? 5 : 0}
      radius={20}
      slabClassName={action ? 'bg-line' : selected ? 'bg-pandan-soft-line' : ''}
      className={cn(
        'border-[3px] p-4',
        action ? 'flex-row items-center gap-3.5' : 'gap-2',
        selected ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
        disabled && !busy && 'opacity-60',
      )}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={action ? 'button' : 'radio'}
      accessibilityState={action ? { busy } : { selected }}
      /* Everything on the card, in reading order. The label overrides the
         children rather than adding to them, so anything left out of it is
         simply not announced — which is what happened to the saving and the
         billing period, the two things the card is asking somebody to weigh. */
      accessibilityLabel={(disclosure
        ? [title, badge, disclosure, caption]
        : [title, badge, detail, price, caption]
      )
        .filter(Boolean)
        .join(', ')}
    >
      <View className={action ? 'min-w-0 flex-1 gap-2' : 'w-full'}>
        <View className="flex-row items-center gap-3.5">
          {action ? null : (
            <View
              className={cn(
                'h-[24px] w-[24px] items-center justify-center rounded-full border-[3px]',
                selected ? 'border-pandan' : 'border-line-strong',
              )}
            >
              {selected ? <View className="h-[11px] w-[11px] rounded-full bg-pandan" /> : null}
            </View>
          )}

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
        </View>

        {disclosure ? (
          <Text variant="micro" className="text-muted">
            {disclosure}
          </Text>
        ) : null}
      </View>

      {action ? (
        // A sibling of the whole text block, including its disclosure, so the
        // arrow stays vertically centred whether terms take a line or not.
        <View className="h-[36px] w-[36px] items-center justify-center rounded-full bg-pandan">
          {busy ? (
            <ActivityIndicator size="small" color={colors.onPandan} />
          ) : (
            <Icon set="ui" name="arrow-right" size={18} tintColor={colors.onPandan} />
          )}
        </View>
      ) : null}
    </Squish>
  )
}
