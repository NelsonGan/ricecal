import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSession } from '@/data'
import { Button, Icon, type IconProps, Screen, Text } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** 01 WELCOME */
export default function Welcome() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()
  const { session } = useSession()

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

  /**
   * The questions cannot start without an account.
   *
   * Every step from here writes to `profiles`, and the hooks that do it throw
   * outright when there is no session rather than failing quietly. This screen
   * is reached from sign-in's "What is RiceCal?", so no session is the ordinary
   * case and not a corner one — sending that user to the first question crashes
   * the screen. A signed-in user who has not finished onboarding is routed
   * straight to the questions by `app/index.tsx` and only arrives here on
   * purpose, so both directions stay reachable.
   */
  const start = () =>
    session
      ? router.push('/goal')
      : router.replace({ pathname: '/sign-in', params: { mode: 'sign-up' } })

  /** Both CTAs land on sign-in; the label decides which side of it opens. */
  const signIn = () => router.replace({ pathname: '/sign-in', params: { mode: 'sign-in' } })

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
