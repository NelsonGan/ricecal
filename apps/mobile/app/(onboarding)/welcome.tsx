import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { track } from '@/lib/analytics'
import { Button, Icon, type IconProps, Screen, Text } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/**
 * 01 WELCOME
 *
 * The first screen anybody sees, and the fork between the two kinds of visitor.
 *
 * "Get started" goes straight into the questions — no account, nothing to type,
 * no reason given for why an email would be needed before a single question has
 * been answered. The account comes at the end, once the app has shown what it
 * works out for them. Anyone who already has one takes the second button and
 * skips the seven screens entirely.
 */
export default function Welcome() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()

  const perks: { key: string; icon: IconProps; title: string; subtitle: string }[] = [
    {
      key: 'track',
      icon: { set: 'body', name: 'flame-burn' },
      title: t('welcome.perks.track.title'),
      subtitle: t('welcome.perks.track.subtitle'),
    },
    {
      key: 'habit',
      icon: { set: 'body', name: 'heart-rate' },
      title: t('welcome.perks.habit.title'),
      subtitle: t('welcome.perks.habit.subtitle'),
    },
    {
      key: 'local',
      icon: { set: 'dishes', name: 'nasi-lemak' },
      title: t('welcome.perks.local.title'),
      subtitle: t('welcome.perks.local.subtitle'),
    },
  ]

  /** Straight into the questions. No session needed: the answers are held locally. */
  const start = () => {
    // The top of the funnel, and the only place it can be marked. This screen
    // is also where a returning user lands, so rendering it is not the same
    // thing as starting — pressing this button is.
    track('Onboarding Started', {})
    router.push('/about')
  }

  /**
   * Skips the questions.
   *
   * `push`, so the edge swipe comes back here — someone who taps this by mistake
   * has not lost the way in. The mode says which side of that screen to open on,
   * because "I already have an account" under a "Save your progress" heading
   * reads as a tap that was ignored.
   */
  const signIn = () => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('welcome.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={signIn}>
            {t('welcome.signIn')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-4">
        <Image source={MASCOT} style={{ width: 112, height: 112 }} contentFit="contain" />
        <Text variant="displayMd" className="text-center">
          {t('welcome.title')}
        </Text>
        <Text className="text-center text-[16px] leading-[24px]">{t('welcome.subtitle')}</Text>
      </View>

      <View className="gap-3 pt-6">
        {perks.map((perk) => (
          <View
            key={perk.key}
            className="flex-row items-center gap-3.5 rounded-md border-2 border-line bg-surface p-4"
            accessible
          >
            <Icon {...perk.icon} size={40} />
            <View className="min-w-0 flex-1">
              <Text variant="bodyStrong" className="text-[16px]">
                {perk.title}
              </Text>
              <Text variant="meta">{perk.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  )
}
