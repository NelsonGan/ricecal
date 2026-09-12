import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { PlanPicker } from '@/features/shared'
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { Button, Icon, Text } from '@/ui'
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

      {purchaseMode ? (
        <View className="flex-row items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            contentClassName="px-2"
            labelClassName="text-[12px]"
            onPress={props.onRestore}
            disabled={props.purchasingPlan != null || props.restoring}
          >
            {t('paywall:hard.restore')}
          </Button>
          <Text variant="micro">·</Text>
          <Button
            variant="ghost"
            size="sm"
            contentClassName="px-2"
            labelClassName="text-[12px]"
            onPress={() => openLegal(TERMS_URL)}
          >
            {t('paywall:hard.terms')}
          </Button>
          <Text variant="micro">·</Text>
          <Button
            variant="ghost"
            size="sm"
            contentClassName="px-2"
            labelClassName="text-[12px]"
            onPress={() => openLegal(PRIVACY_URL)}
          >
            {t('profile:account.privacy')}
          </Button>
        </View>
      ) : (
        <View className="items-center gap-1.5">
          <View className="flex-row items-center gap-2">
            <Icon set="system" name="shield" size={16} />
            <Text variant="caption" className="text-pandan-ink">
              {/* Branches with the small print below it, or the two contradict
                  each other. See `assuranceLifetime`. */}
              {t(plan === 'lifetime' ? 'paywall:hard.assuranceLifetime' : 'paywall:hard.assurance')}
            </Text>
          </View>
          {/* No placeholder sentence while the store is loading. A real price
              earns real terms; until then the picker already shows a dash. */}
          {smallPrint ? (
            <Text variant="caption" className="text-center text-faint">
              {smallPrint}
            </Text>
          ) : null}

          {props.onRestore ? (
            // `self-center` because `Button` sets `self-start` on its own
            // container, and align-self beats the column's align-items.
            <Button variant="ghost" size="sm" className="self-center" onPress={props.onRestore}>
              {t('paywall:hard.restore')}
            </Button>
          ) : null}

          {/* Guideline 3.1.2. The sentence above says what it costs and how long
              it lasts; this is the pair of links that has to sit beside it. */}
          <PurchaseTerms />
        </View>
      )}
    </>
  )
}
