import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { PlanPicker } from '@/features/shared'
import { Icon, Text } from '@/ui'
import { PlanTable } from './PlanTable'
import { PurchaseTerms } from './PurchaseTerms'

/**
 * The app's icon.
 *
 * This screen is asking somebody to buy a PRODUCT, and the square at the top of
 * it should be the one they are about to keep on their home screen. Same rule
 * as the welcome screen, and the two are the first and last screens of the
 * flow: both render the icon FILE, so neither can drift from the home screen
 * when the icon changes.
 */
const LOGO = require('../../../assets/icon.png')

type ProPitchBaseProps = {
  /**
   * Restoring a purchase, as a link at the end of the page rather than a button
   * in the footer.
   *
   * Only the onboarding paywall passes it. Pinned under "Maybe later" it was a
   * third full-width control in a stack of three, which made "Restore purchase"
   * look like a way forward from this screen rather than the escape hatch for
   * somebody who has already paid on another phone.
   *
   * The standing paywall keeps the link in its compact legal row: it is reached
   * from a refused tap rather than from a flow, so somebody arriving there
   * having already paid is a likelier visitor.
   */
  onRestore?: () => void
}

export type ProPitchProps = ProPitchBaseProps &
  (
    | {
        mode?: 'select'
        plan: Plan
        onPlanChange: (plan: Plan) => void
      }
    | {
        mode: 'purchase'
        onPlanPurchase: (plan: Plan) => void
        onRestore: () => void
        purchasingPlan?: Plan | null
        restoring?: boolean
      }
  )

/**
 * The sales half of both paywall screens.
 *
 * Shared because they were diverging: two files with the same mark at the top,
 * the same perks and the same plan picker, and a change to one silently made
 * the other the old version. What differs between them is how you LEAVE — the
 * onboarding one offers "Maybe later", the standing one has a back chevron —
 * so that is what stays in the screens.
 */
export function ProPitch(props: ProPitchProps) {
  const { t } = useTranslation(['paywall', 'profile'])
  const { data: prices } = usePlanPrices()
  const purchaseMode = props.mode === 'purchase'
  const plan = purchaseMode ? null : props.plan

  const disclosureFor = (candidate: Plan): string | undefined => {
    const price = prices?.[candidate]?.priceString
    if (!price) return undefined
    if (candidate === 'lifetime') {
      return t('paywall:hard.smallPrintLifetime', { price })
    }
    if (prices?.[candidate]?.freeTrialEligible === true) {
      return t(
        candidate === 'yearly' ? 'paywall:hard.smallPrintYearly' : 'paywall:hard.smallPrintMonthly',
        { price },
      )
    }
    return t(
      candidate === 'yearly'
        ? 'paywall:hard.smallPrintYearlyNoTrial'
        : 'paywall:hard.smallPrintMonthlyNoTrial',
      { price },
    )
  }

  const smallPrint = plan ? disclosureFor(plan) : null

  const purchaseDisclosures = {
    yearly: disclosureFor('yearly'),
    monthly: disclosureFor('monthly'),
    lifetime: disclosureFor('lifetime'),
  } satisfies Partial<Record<Plan, string>>

  return (
    <>
      <View className="items-center gap-2.5">
        <Image
          source={LOGO}
          style={{ width: 76, height: 76, borderRadius: 18 }}
          contentFit="cover"
        />
        <Text variant="title" className="text-center">
          {t('paywall:hard.title')}
        </Text>
      </View>

      {/* What each tier gets, side by side. It was a list of everything Pro
          includes, which is the right shape for an app with no free tier and
          the wrong one for this: a reader whose barcode scanner already works
          needs to know which of these lines is the one they do not have. See
          `PlanTable`. */}
      <PlanTable />

      <View className="gap-3">
        <View className="gap-1.5">
          <Text variant="overline">{t('paywall:hard.choosePlan')}</Text>
          <View className="flex-row items-center gap-2">
            <Icon set="system" name="shield" size={16} />
            <Text variant="caption" className="flex-1 text-pandan-ink">
              {/* Purchase mode has no selected plan, but the two subscriptions
                  both carry this assurance. Select mode changes the line when
                  lifetime is chosen so it never promises a cancellation for a
                  one-off purchase. */}
              {t(
                !purchaseMode && plan === 'lifetime'
                  ? 'paywall:hard.assuranceLifetime'
                  : 'paywall:hard.assurance',
              )}
            </Text>
          </View>
        </View>

        {purchaseMode ? (
          <PlanPicker
            showLifetime
            mode="purchase"
            onPurchase={props.onPlanPurchase}
            pendingPlan={props.purchasingPlan}
            disabled={props.restoring}
            disclosures={purchaseDisclosures}
          />
        ) : (
          <PlanPicker showLifetime value={props.plan} onChange={props.onPlanChange} />
        )}

        {!purchaseMode && smallPrint ? (
          <Text variant="caption" className="text-center text-faint">
            {smallPrint}
          </Text>
        ) : null}

        {/* One compact legal row on both paywalls. The trial-ended screen uses
            the same component without restore, because it has its own account
            recovery path. */}
        <PurchaseTerms
          onRestore={props.onRestore}
          restoreDisabled={
            purchaseMode && (props.purchasingPlan != null || props.restoring === true)
          }
        />
      </View>
    </>
  )
}
