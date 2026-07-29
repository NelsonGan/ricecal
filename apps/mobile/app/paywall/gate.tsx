import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { CheckList } from '@/features/shared'
import { useDispatch } from '@/mock'
import { Button, Card, Icon, type IconProps, Screen, Squish, Text } from '@/ui'

type Feature = 'photo' | 'barcode' | 'voice'

const HERO: Record<Feature, IconProps> = {
  photo: { set: 'system', name: 'camera' },
  barcode: { set: 'system', name: 'barcode' },
  voice: { set: 'system', name: 'microphone' },
}

/**
 * W4 FEATURE GATE.
 *
 * One screen for three gates: which feature was blocked is a parameter, so a
 * new gated feature is a new entry in the copy bundle rather than a new route.
 */
export default function FeatureGate() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const dispatch = useDispatch()
  const params = useLocalSearchParams<{ feature?: Feature }>()
  const feature: Feature = params.feature ?? 'photo'

  const start = () => {
    dispatch({ type: 'setSubscription', status: 'trial' })
    router.replace('/paywall/welcome')
  }

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('paywall:gate.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={() => router.replace('/log/search')}>
            {t('paywall:gate.searchInstead')}
          </Button>
        </View>
      }
    >
      <View className="h-[150px] items-center justify-center rounded-card border-[3px] border-line bg-track">
        <Icon {...HERO[feature]} size={104} />
      </View>

      <Card>
        <View className="flex-row items-center gap-3.5">
          <Squish
            depth={4}
            radius={16}
            slabClassName="bg-pandan-slab"
            className="h-11 w-11 items-center justify-center bg-pandan"
          >
            <Icon {...HERO[feature]} size={24} />
          </Squish>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong">{t(`paywall:gate.${feature}.title`)}</Text>
            <Text variant="meta">{t(`paywall:gate.${feature}.body`)}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('paywall:gate.whatYouGet')}>
        <CheckList
          items={[
            t(`paywall:gate.${feature}.perks.multiItem`),
            t(`paywall:gate.${feature}.perks.portion`),
            t(`paywall:gate.${feature}.perks.offline`),
          ]}
        />
      </Card>

      <Card tone="kaya">
        <Text variant="meta">{t('paywall:gate.freeNote')}</Text>
      </Card>
    </Screen>
  )
}
