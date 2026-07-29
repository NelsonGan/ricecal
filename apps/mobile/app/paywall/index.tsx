import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { CheckList, PlanPicker } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { type Plan, useDispatch } from '@/mock'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, IconButton, Screen, Text, useToast } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** W1 HARD PAYWALL */
export default function HardPaywall() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const dispatch = useDispatch()
  const toast = useToast()
  const colors = useThemeColors()
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
            {t('paywall:hard.start')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onPress={() => toast.show({ title: t('paywall:hard.restored') })}
          >
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
          t('paywall:hard.perks.sync'),
        ]}
      />

      <PlanPicker value={plan} onChange={setPlan} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {t('paywall:hard.assurance')}
          </Text>
        </View>
        <Text variant="caption" className="text-center text-faint">
          {t('paywall:hard.smallPrint')}
        </Text>
      </View>
    </Screen>
  )
}
