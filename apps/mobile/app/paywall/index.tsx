import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { type Plan, usePlanPrices } from '@/data'
import {
  PurchasesUnavailable,
  purchasePlan,
  purchasesAvailable,
  restorePurchases,
} from '@/data/purchases'
import { CheckList, PlanPicker } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Screen, Text, useToast } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** W1 HARD PAYWALL */
export default function HardPaywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const toast = useToast()
  const colors = useThemeColors()
  const [plan, setPlan] = useState<Plan>('yearly')
  const { data: prices } = usePlanPrices()

  /**
   * Starts the store's purchase sheet.
   *
   * Nothing is written locally on success: RevenueCat's webhook updates
   * `subscriptions` and the app reads that — the table has no client write
   * grant, deliberately. Until the SDK key is provisioned this says so rather
   * than pretending a trial started.
   */
  const start = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    try {
      await purchasePlan(plan)
      router.replace('/paywall/welcome')
    } catch (error) {
      if (error instanceof PurchasesUnavailable) return
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
  }

  const restore = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    await restorePurchases()
    toast.show({ title: t('paywall:hard.restored') })
  }

  const priceString = prices?.[plan]?.priceString
  const smallPrint = !priceString
    ? t('paywall:hard.smallPrintPending')
    : plan === 'lifetime'
      ? t('paywall:hard.smallPrintLifetime', { price: priceString })
      : plan === 'yearly'
        ? t('paywall:hard.smallPrintYearly', { price: priceString })
        : t('paywall:hard.smallPrintMonthly', { price: priceString })

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {plan === 'lifetime' ? t('paywall:hard.startLifetime') : t('paywall:hard.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={restore}>
            {t('paywall:hard.restore')}
          </Button>
        </View>
      }
    >
      {/* `justify-end`, not `items-end`: every squishy control sets
          `self-start` on its own box, which beats a parent's `align-items`.
          Justification on a row is not something the child can override. */}
      <View className="flex-row justify-end">
        <IconButton size="sm" accessibilityLabel={t('common:a11y.close')} onPress={() => goBack()}>
          <Icon set="ui" name="close" size={18} tintColor={colors.muted} />
        </IconButton>
      </View>

      <View className="items-center gap-2.5">
        <Image source={MASCOT} style={{ width: 72, height: 72 }} contentFit="contain" />
        <Text variant="title" className="text-center">
          {t('paywall:hard.title')}
        </Text>
      </View>

      <CheckList
        items={[
          t('paywall:hard.perks.unlimited'),
          t('paywall:hard.perks.scanning'),
          t('paywall:hard.perks.database'),
        ]}
      />

      <PlanPicker showLifetime value={plan} onChange={setPlan} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {t('paywall:hard.assurance')}
          </Text>
        </View>
        <Text variant="caption" className="text-center text-faint">
          {/* The sentence needs the number, so it waits for it rather than
              printing half of itself. */}
          {smallPrint}
        </Text>
      </View>
    </Screen>
  )
}
