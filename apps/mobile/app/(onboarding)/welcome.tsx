import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, Icon, type IconProps, Screen, Text } from '@/ui'

const MASCOT = require('../../assets/brand/mascot.png')

/** 01 WELCOME */
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

  /** "I already have an account" goes to the real sign-in screen. */
  const signIn = () => router.replace('/sign-in')

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => router.push('/goal')}>
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
