import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { Plan } from '@/data'
import { PurchasesUnavailable, purchasePlan, purchasesAvailable } from '@/data/purchases'
import { CheckList, PlanPicker } from '@/features/shared'
import { Button, Icon, Screen, Text, useToast } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** 09 FREE TRIAL */
export default function TrialStep() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()
  const toast = useToast()
  const [plan, setPlan] = useState<Plan>('yearly')

  /**
   * The store decides entitlement, not this screen.
   *
   * On success RevenueCat's webhook writes `subscriptions` and the app reads
   * it. Until the SDK key is provisioned there is nothing to buy, and saying
   * so beats a screen that claims a trial started and then does not have one.
   */
  const start = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('trial.notConfigured'), tone: 'warning' })
      router.replace('/preview')
      return
    }
    try {
      await purchasePlan(plan)
      router.replace('/paywall/welcome')
    } catch (error) {
      if (error instanceof PurchasesUnavailable) return
      toast.show({
        title: error instanceof Error ? error.message : t('trial.later'),
        tone: 'error',
      })
    }
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('trial.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={() => router.replace('/preview')}>
            {t('trial.later')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2.5">
        <Image source={MASCOT} style={{ width: 72, height: 72 }} contentFit="contain" />
        <Text variant="title" className="text-center">
          {t('trial.title')}
        </Text>
      </View>

      <CheckList
        items={[
          t('trial.perks.unlimited'),
          t('trial.perks.scanning'),
          t('trial.perks.database'),
          t('trial.perks.sync'),
        ]}
      />

      <PlanPicker value={plan} onChange={setPlan} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {t('trial.assurance')}
          </Text>
        </View>
        <Text variant="caption" className="text-center text-faint">
          {t('trial.smallPrint')}
        </Text>
      </View>
    </Screen>
  )
}
