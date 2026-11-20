import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ONBOARDING_ART } from '@/features/onboarding'
import { track } from '@/lib/analytics'
import { Button, Text } from '@/ui'

/**
 * The app's own icon, and the FILE rather than a copy of the drawing, so the
 * mark beside the name here is the square somebody taps tomorrow.
 */
const LOGO = require('../../assets/app-mark.png')

/**
 * 01 WELCOME
 *
 * The first screen anybody sees, and the fork between the two kinds of visitor.
 *
 * A picture of the whole idea (a plate, and a phone that has just counted it)
 * over one sentence that says the same thing in words. It used to be a heading
 * about who the app is for over three perk cards, which explained the app in
 * four places and showed it in none. Showing it properly is the next step's job.
 *
 * Not a `Screen`: the picture bleeds under the status bar, and a shell that
 * pads for the safe area and the gutter is exactly what it must not do. The
 * picture is the part that gives way on a small phone, so the panel under it,
 * which holds the only two things anybody can act on, is never pushed off.
 *
 * "Get started" goes straight into the flow, with no account and nothing to
 * type. Anyone who already has one takes the second button and skips it.
 */
export default function Welcome() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()
  const insets = useSafeAreaInsets()

  /** Straight into the flow. No session needed: the answers are held locally. */
  const start = () => {
    // The top of the funnel, and the only place it can be marked. This screen
    // is also where a returning user lands, so rendering it is not the same
    // thing as starting; pressing this button is.
    track('Onboarding Started', {})
    router.push('/how')
  }

  /**
   * Skips the flow.
   *
   * `push`, so the edge swipe comes back here: someone who taps this by mistake
   * has not lost the way in. The mode says which side of that screen to open on,
   * because "I already have an account" under a "Save your progress" heading
   * reads as a tap that was ignored.
   */
  const signIn = () => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })

  return (
    <View className="flex-1 bg-canvas">
      <View className="min-h-[200px] flex-1">
        <Image
          source={ONBOARDING_ART.hero}
          style={{ flex: 1 }}
          contentFit="cover"
          contentPosition="top"
          transition={0}
          accessible={false}
        />
      </View>

      {/* Pulled up over the picture by its own corner radius, so the two read
          as one surface rather than a photo with a form under it. */}
      <View
        className="-mt-7 gap-5 rounded-t-card bg-canvas px-gutter pt-7"
        style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View className="gap-2.5">
          <View className="flex-row items-center gap-2">
            <Image
              source={LOGO}
              style={{ width: 30, height: 30, borderRadius: 8 }}
              contentFit="cover"
              accessible={false}
            />
            <Text variant="subtitle" className="text-pandan-ink">
              RiceCal
            </Text>
          </View>
          <Text variant="displayMd" accessibilityRole="header">
            {t('welcome.title')}
          </Text>
          <Text variant="meta" className="text-[17px] leading-[24px]">
            {t('welcome.subtitle')}
          </Text>
        </View>

        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('welcome.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={signIn}>
            {t('welcome.signIn')}
          </Button>
        </View>
      </View>
    </View>
  )
}
