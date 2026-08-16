import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { CheckList } from '@/features/shared'
import { useEnterApp } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, Screen, Squish, Text } from '@/ui'

/** W5 WELCOME TO PRO */
export default function WelcomeToPro() {
  const { t } = useTranslation('paywall')
  const router = useRouter()
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
  const colors = useThemeColors()

  /**
   * Land on Today, then raise the log sheet over it.
   *
   * Two calls rather than one: the sheet is a root-level modal and needs the
   * day underneath it, or it floats over an empty stack with nothing behind
   * its scrim. The router queues both actions in order, so the replace lands
   * first.
   *
   * `enterApp` rather than a bare replace, because this screen is the end of
   * onboarding as often as it is a purchase made from the app — and a replace
   * leaves every screen the user walked to get here standing under the diary.
   * See `useEnterApp`.
   */
  const logFirstMeal = () => {
    enterApp()
    router.push('/log')
  }

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <Button fullWidth onPress={logFirstMeal}>
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
          {lifetime ? t('welcome.bodyLifetime') : t('welcome.body')}
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
