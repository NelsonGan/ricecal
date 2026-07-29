import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { CheckList, PlanPicker } from '@/features/shared'
import { type Plan, useDispatch } from '@/mock'
import { Button, Icon, Screen, Text } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** 09 FREE TRIAL */
export default function TrialStep() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()
  const dispatch = useDispatch()
  const [plan, setPlan] = useState<Plan>('yearly')

  const start = () => {
    dispatch({ type: 'setSubscription', status: 'trial', plan })
    router.replace('/paywall/welcome')
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('trial.start')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onPress={() => {
              dispatch({ type: 'setSubscription', status: 'none' })
              router.replace('/preview')
            }}
          >
            {t('trial.later')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-2.5">
        <Image source={MASCOT} style={{ width: 72, height: 72 }} contentFit="contain" />
        <Text className="text-center font-display text-[28px] leading-[34px] text-heading">
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
