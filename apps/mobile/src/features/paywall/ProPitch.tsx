import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { PlanPicker } from '@/features/shared'
import { Button, Icon, Text } from '@/ui'
import { PlanTable } from './PlanTable'

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

export type ProPitchProps = {
  plan: Plan
  onPlanChange: (plan: Plan) => void
  /**
   * Restoring a purchase, as a LINK at the end of the page rather than a button
   * in the footer.
   *
   * Only the onboarding paywall passes it, and the placement is the point.
   * Pinned under "Maybe later" it was a third full-width control in a stack of
   * three, which made "Restore purchase" look like one of the ways forward from
   * this screen — it is not, it is the escape hatch for somebody who has
   * already paid on another phone. Under the small print it is where every
   * other app puts it, and the two people a month who need it know to scroll.
   *
   * The standing paywall keeps its footer button: it is reached from a refused
   * tap rather than from a flow, and somebody arriving there having already
   * paid is a likelier visitor.
   */
  onRestore?: () => void
}

/**
 * The sales half of both paywall screens.
 *
 * Shared because they were diverging: two files with the same mark at the top,
 * the same perks and the same plan picker, and a change to one silently made
 * the other the old version. What differs between them is how you LEAVE — the
 * onboarding one offers "Maybe later", the standing one has a back chevron —
 * so that is what stays in the screens.
 */
export function ProPitch({ plan, onPlanChange, onRestore }: ProPitchProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()

  const priceString = prices?.[plan]?.priceString
  const smallPrint = !priceString
    ? t('hard.smallPrintPending')
    : plan === 'lifetime'
      ? t('hard.smallPrintLifetime', { price: priceString })
      : plan === 'yearly'
        ? t('hard.smallPrintYearly', { price: priceString })
        : t('hard.smallPrintMonthly', { price: priceString })

  return (
    <>
      <View className="items-center gap-2.5">
        <Image
          source={LOGO}
          style={{ width: 76, height: 76, borderRadius: 18 }}
          contentFit="cover"
        />
        <Text variant="title" className="text-center">
          {t('hard.title')}
        </Text>
      </View>

      {/* What each tier gets, side by side. It was a list of everything Pro
          includes, which is the right shape for an app with no free tier and
          the wrong one for this: a reader whose barcode scanner already works
          needs to know which of these lines is the one they do not have. See
          `PlanTable`. */}
      <PlanTable />

      <PlanPicker showLifetime value={plan} onChange={onPlanChange} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {/* Branches with the small print below it, or the two contradict
                each other. See `assuranceLifetime`. */}
            {t(plan === 'lifetime' ? 'hard.assuranceLifetime' : 'hard.assurance')}
          </Text>
        </View>
        {/* The sentence needs the price, so it waits for it rather than
            printing half of itself. */}
        <Text variant="caption" className="text-center text-faint">
          {smallPrint}
        </Text>

        {onRestore ? (
          // `self-center` because `Button` sets `self-start` on its own
          // container, and align-self beats the column's align-items.
          <Button variant="ghost" size="sm" className="self-center" onPress={onRestore}>
            {t('hard.restore')}
          </Button>
        ) : null}
      </View>
    </>
  )
}
