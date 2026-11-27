import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { PlanPicker } from '@/features/shared'
import { Text } from '@/ui'
import { PlanTable } from './PlanTable'
import { PurchaseTerms } from './PurchaseTerms'
import { PaywallSocialProof } from './SocialProof'
import { TrialTimeline } from './TrialTimeline'

export type ProPitchProps = {
  plan: Plan
  onPlanChange: (plan: Plan) => void
  onRestore: () => void
  /** A purchase or restore currently owns the store SDK. */
  disabled?: boolean
}

/**
 * The single offer shared by the onboarding and standing paywalls, in two
 * halves because `PaywallOffer` lays them out itself: with two panes on iPhone
 * Duo the plans stand in the second, over the purchase button, and `Screen`
 * only finds an `Aside` among its own children, never inside a component.
 *
 * The plan comes first because it is the decision the screen asks for. The
 * comparison follows as supporting detail, and the legal links stay at the end
 * of the scroll content rather than competing with the purchase button.
 */
export function ProPlanChoice({
  plan,
  onPlanChange,
  disabled = false,
}: Pick<ProPitchProps, 'plan' | 'onPlanChange' | 'disabled'>) {
  const { t } = useTranslation('paywall')
  return (
    <View className="mt-sm gap-3">
      <View className="gap-0">
        <Text variant="subtitle">{t('hard.choosePlan')}</Text>
        <Text variant="meta">
          {t(plan === 'lifetime' ? 'hard.assuranceLifetime' : 'hard.assurance')}
        </Text>
      </View>

      <PlanPicker showLifetime value={plan} onChange={onPlanChange} disabled={disabled} />

      {/* Under the plans it is about, and in the same pane on iPhone Duo, so
          switching to a plan without a trial takes the timeline with it. */}
      <TrialTimeline plan={plan} />
    </View>
  )
}

export function ProDetails({
  onRestore,
  disabled = false,
}: Pick<ProPitchProps, 'onRestore' | 'disabled'>) {
  return (
    <>
      {/* The rating and real reviews, read on the way from the plans to the
          comparison. First in this pane, so on iPhone Duo it opens the pane
          beside the plans rather than following the long table. */}
      <PaywallSocialProof />

      {/* What each tier gets, side by side. A reader whose barcode scanner
          already works needs to know which lines actually change with Pro. */}
      <View className="mt-md">
        <PlanTable />
      </View>

      {/* One compact legal row on both paywalls. The trial-ended screen uses
          the same component without restore, because it has its own account
          recovery path. */}
      <PurchaseTerms onRestore={onRestore} restoreDisabled={disabled} />
    </>
  )
}
