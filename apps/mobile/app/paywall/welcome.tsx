import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { usePlanSummary } from '@/features/paywall'
import { CheckList } from '@/features/shared'
import { useEnterApp } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, Screen, Squish, Text } from '@/ui'

/** W5 WELCOME TO PRO */
export default function WelcomeToPro() {
  const { t } = useTranslation('paywall')
  const enterApp = useEnterApp()
  /**
   * Which plan was just bought.
   *
   * Lifetime has no trial and nothing to cancel, and this screen told every
   * buyer "Trial active for 7 days" regardless — false for a one-off purchase,
   * and false again for anybody who arrived here by RESTORING a subscription
   * they bought months ago.
   */
  const { plan } = useLocalSearchParams<{ plan?: string }>()
  const lifetime = plan === 'lifetime'
  // WHETHER THIS IS ACTUALLY A TRIAL is the store's answer, not the button's.
  // The line under the title used to claim seven free days to everybody who had
  // not bought lifetime — including a resubscriber, who has already used the
  // introductory offer for this subscription group and was charged on the spot.
  const { state } = usePlanSummary()
  const colors = useThemeColors()

  /**
   * Land on Today, and stop there.
   *
   * IT USED TO RAISE THE LOG SHEET AS WELL, and that put a camera in front of
   * somebody who had just paid. `/log` with no `panel` param does not open on
   * the four tiles: `openingPanel` falls through to `'camera'`, so the viewfinder
   * is what a bare push presents. Whatever the user was doing when they hit the
   * paywall — reading their trends, opening a recipe, finishing onboarding —
   * they were not asking to photograph a plate, and being handed a live camera
   * as the first thing Pro does is a demand rather than a reward.
   *
   * So the button goes to the diary and the FloatingAction is right there when
   * they want it. A purchase should return people to the app, not redirect them
   * into one feature of it.
   *
   * `enterApp` rather than a bare replace, because this screen is the end of
   * onboarding as often as it is a purchase made from the app — and a replace
   * leaves every screen the user walked to get here standing under the diary.
   * See `useEnterApp`.
   */
  const goToDiary = () => enterApp()

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <Button fullWidth onPress={goToDiary}>
          {t('welcome.start')}
        </Button>
      }
    >
      <View className="items-center gap-4">
        <Squish
          depth={8}
          radius={34}
          slabClassName="bg-pandan-slab"
          className="h-24 w-24 items-center justify-center bg-pandan"
        >
          <Icon set="ui" name="check" size={48} tintColor={colors.onPandan} />
        </Squish>

        <Text variant="title" className="text-center">
          {t('welcome.title')}
        </Text>
        <Text className="text-center text-[15px] leading-[23px]">
          {lifetime
            ? t('welcome.bodyLifetime')
            : state === 'trial'
              ? t('welcome.body')
              : t('welcome.bodyActive')}
        </Text>
      </View>

      <View className="pt-4">
        <CheckList items={[t('welcome.perks.log'), t('welcome.perks.database')]} />
      </View>

      <Text variant="caption" className="pt-2 text-center text-faint">
        {lifetime ? t('welcome.manageNoteLifetime') : t('welcome.manageNote')}
      </Text>
    </Screen>
  )
}
