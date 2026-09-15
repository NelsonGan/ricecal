import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { PlanPicker } from '@/features/shared'
import { Text } from '@/ui'
import { PlanTable } from './PlanTable'
import { PurchaseTerms } from './PurchaseTerms'

export type ProPitchProps = {
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
export function ProPitch({ plan, onPlanChange, onRestore, disabled = false }: ProPitchProps) {
  const { t } = useTranslation('paywall')
  return (
    <>
      <View className="mt-sm gap-3">
        <View className="gap-0">
          <Text variant="subtitle">{t('hard.choosePlan')}</Text>
          <Text variant="meta">
            {t(plan === 'lifetime' ? 'hard.assuranceLifetime' : 'hard.assurance')}
          </Text>
        </View>

        <PlanPicker showLifetime value={plan} onChange={onPlanChange} disabled={disabled} />
      </View>

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
