import { useTranslation } from 'react-i18next'

import type { Plan } from '@/data'
import type { PlanPrices } from '@/data/purchases'
import { Text } from '@/ui'
import { trialDurationText } from './trial'

/** The selected plan's charge terms stay with the sticky purchase button. */
export function PlanTerms({ plan, prices }: { plan: Plan; prices?: PlanPrices }) {
  const { t } = useTranslation('paywall')
  const selected = prices?.[plan]
  if (!selected?.priceString) return null

  const price = selected.priceString
  let terms: string
  if (plan === 'lifetime') {
    terms = t('hard.smallPrintLifetime', { price })
  } else if (selected.freeTrialEligible && selected.trialDuration) {
    terms = t(plan === 'yearly' ? 'hard.smallPrintYearly' : 'hard.smallPrintMonthly', {
      duration: trialDurationText(t, selected.trialDuration),
      price,
    })
  } else {
    terms = t(
      plan === 'yearly' ? 'hard.smallPrintYearlyNoTrial' : 'hard.smallPrintMonthlyNoTrial',
      { price },
    )
  }

  return (
    <Text variant="caption" className="text-center text-faint">
      {terms}
    </Text>
  )
}
