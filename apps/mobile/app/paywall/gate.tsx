import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { PurchasesUnavailable, purchasePlan, purchasesAvailable } from '@/data/purchases'
import { CheckList } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { Button, Card, Icon, type IconProps, Screen, Squish, Text, useToast } from '@/ui'

/**
 * The gated ways in, each naming a block in the `gate` copy bundle.
 *
 * Must stay in step with `ProFeature` in `features/paywall`, which is what
 * pushes to this route. NOTHING TYPECHECKS THE PAIR — a router param is a
 * string as far as the compiler is concerned — so a feature added there and
 * not here arrives with no `HERO` entry, and `<Icon {...undefined}>` renders a
 * card with a hole in it above three missing copy keys.
 */
type Feature = 'photo' | 'describe' | 'log'

const HERO: Record<Feature, IconProps> = {
  photo: { set: 'system', name: 'camera' },
  // The same sparkle the Describe button carries in the log sheet, so the gate
  // and the control it is gating look like one feature.
  describe: { set: 'system', name: 'sparkle' },
  // The plate, because this is the gate on writing an entry however it was
  // composed: searched, scanned off a packet, or cooked from a recipe.
  log: { set: 'food', name: 'empty-plate' },
}

/** Anything else in the param is a stale link, not a feature. */
const isFeature = (value: string | undefined): value is Feature =>
  value === 'photo' || value === 'describe' || value === 'log'

/**
 * W4 FEATURE GATE.
 *
 * One screen for both gates: which feature was blocked is a parameter, so a
 * new gated feature is a new entry in the copy bundle rather than a new route.
 */
export default function FeatureGate() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const toast = useToast()
  const params = useLocalSearchParams<{ feature?: string }>()
  const feature: Feature = isFeature(params.feature) ? params.feature : 'photo'

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
          {/* Not on the `log` gate. That one is reached from search, from a
              scanned packet or from a recipe, so the user has already found
              the food and offering to send them looking for it again reads as
              the app not having followed. */}
          {feature === 'log' ? (
            <Button variant="ghost" fullWidth onPress={() => goBack()}>
              {t('paywall:gate.notNow')}
            </Button>
          ) : (
            <Button variant="ghost" fullWidth onPress={() => router.replace('/log/search')}>
              {t('paywall:gate.searchInstead')}
            </Button>
          )}
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
