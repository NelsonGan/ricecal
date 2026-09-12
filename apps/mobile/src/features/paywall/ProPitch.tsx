import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { PlanPicker } from '@/features/shared'
import { Text } from '@/ui'
import { PlanTable } from './PlanTable'
import { ProWordmark } from './ProWordmark'
import { PurchaseTerms } from './PurchaseTerms'

export type ProPitchProps = {
  /** The standing page carries the wordmark in its own back bar. */
  showBrand?: boolean
  plan: Plan
  onPlanChange: (plan: Plan) => void
  onRestore: () => void
  /** A purchase or restore currently owns the store SDK. */
  disabled?: boolean
}

/**
 * The single offer shared by the onboarding and standing paywalls.
 *
 * The plan comes first because it is the decision the screen asks for. The
 * comparison follows as supporting detail, and the legal links stay at the end
 * of the scroll content rather than competing with the purchase button.
 */
export function ProPitch({
  showBrand = true,
  plan,
  onPlanChange,
  onRestore,
  disabled = false,
}: ProPitchProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()

  const price = prices?.[plan]?.priceString
  let smallPrint: string | undefined
  if (price) {
    if (plan === 'lifetime') {
      smallPrint = t('hard.smallPrintLifetime', { price })
    } else if (prices?.[plan]?.freeTrialEligible === true) {
      smallPrint = t(plan === 'yearly' ? 'hard.smallPrintYearly' : 'hard.smallPrintMonthly', {
        price,
      })
    } else {
      smallPrint = t(
        plan === 'yearly' ? 'hard.smallPrintYearlyNoTrial' : 'hard.smallPrintMonthlyNoTrial',
        { price },
      )
    }
  }

  return (
    <>
      {showBrand ? <ProWordmark /> : null}

      <View className="gap-3">
        <View className="gap-1">
          <Text variant="subtitle">{t('hard.choosePlan')}</Text>
          <Text variant="meta">
            {t(plan === 'lifetime' ? 'hard.assuranceLifetime' : 'hard.assurance')}
          </Text>
        </View>

        <PlanPicker showLifetime value={plan} onChange={onPlanChange} disabled={disabled} />

        {smallPrint ? (
          <Text variant="caption" className="text-center text-faint">
            {smallPrint}
          </Text>
        ) : null}
      </View>

      {/* What each tier gets, side by side. A reader whose barcode scanner
          already works needs to know which lines actually change with Pro. */}
      <PlanTable />

      {/* One compact legal row on both paywalls. The trial-ended screen uses
          the same component without restore, because it has its own account
          recovery path. */}
      <PurchaseTerms onRestore={onRestore} restoreDisabled={disabled} />
    </>
  )
}
