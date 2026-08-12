import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { PurchasesUnavailable, purchasePlan, purchasesAvailable } from '@/data/purchases'
import { CheckList } from '@/features/shared'
import { Button, Card, Icon, type IconProps, Screen, Squish, Text, useToast } from '@/ui'

/** The gated ways in, each naming a block in the `gate` copy bundle. */
type Feature = 'photo' | 'describe'

const HERO: Record<Feature, IconProps> = {
  photo: { set: 'system', name: 'camera' },
  // The same sparkle the Describe button carries in the log sheet, so the gate
  // and the control it is gating look like one feature.
  describe: { set: 'system', name: 'sparkle' },
}

/**
 * W4 FEATURE GATE.
 *
 * One screen for both gates: which feature was blocked is a parameter, so a
 * new gated feature is a new entry in the copy bundle rather than a new route.
 */
export default function FeatureGate() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ feature?: Feature }>()
  const feature: Feature = params.feature ?? 'photo'

  // Yearly: the gate is the first thing a user sees, and the yearly plan is
  // the one the design leads with.
  const start = async () => {
    if (!purchasesAvailable()) {
      toast.show({ title: t('paywall:hard.notConfigured'), tone: 'warning' })
      return
    }
    try {
      await purchasePlan('yearly')
      router.replace('/paywall/welcome')
    } catch (error) {
      if (error instanceof PurchasesUnavailable) return
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    }
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
