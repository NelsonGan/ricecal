import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { track } from '@/lib/analytics'
import { Button, Icon, type IconProps, Screen, Text } from '@/ui'

/**
 * The app's own icon, not the mascot.
 *
 * The mascot is a character and the first screen is an introduction to a
 * PRODUCT: the thing a user is about to install on their home screen is this
 * square, and showing it here is what makes the icon they tap tomorrow
 * recognisable. It carries its own background, so it is clipped to the same
 * corner radius the platform gives it.
 */
const LOGO = require('../../assets/icon.png')

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
    router.push('/setup')
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
      /**
       * SCROLLS, because this screen is taller than a small phone.
       *
       * It was `scroll={false}`, which on a 6.1" display looks identical and on
       * an iPhone SE hid the bottom of the third perk: the card ran to y 0.831
       * and the "Get started" button started at 0.795, so the last quarter of it
       * sat behind the footer and "read by barcode" was cut to "read by". With
       * nothing to scroll there was no way to reach it — the first screen of the
       * app, and the pitch it exists to make, quietly truncated.
       *
       * The content is fixed in length, so on a large phone this never scrolls
       * and `justify-center` centres it exactly as before. It is the SMALL
       * phone, and the phone with larger text turned on, that need the overflow
       * to go somewhere.
       */
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
        <Image
          source={LOGO}
          style={{ width: 104, height: 104, borderRadius: 24 }}
          contentFit="cover"
        />
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
