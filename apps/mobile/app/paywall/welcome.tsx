import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { CheckList } from '@/features/shared'
import { Button, Icon, Screen, Squish, Text } from '@/ui'

/** W5 WELCOME TO PRO */
export default function WelcomeToPro() {
  const { t } = useTranslation('paywall')
  const router = useRouter()

  /**
   * Land on Today, then raise the log sheet over it.
   *
   * Two calls rather than one: the sheet is a root-level modal and needs the
   * day underneath it, or it floats over an empty stack with nothing behind
   * its scrim. The router queues both actions in order, so the replace lands
   * first.
   */
  const logFirstMeal = () => {
    router.replace('/today')
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
          <Icon set="ui" name="check" size={48} />
        </Squish>

        <Text className="text-center font-display text-[30px] leading-[36px] text-heading">
          {t('welcome.title')}
        </Text>
        <Text className="text-center text-[15px] leading-[23px]">{t('welcome.body')}</Text>
      </View>

      <View className="pt-4">
        <CheckList
          items={[t('welcome.perks.log'), t('welcome.perks.database'), t('welcome.perks.sync')]}
        />
      </View>

      <Text variant="caption" className="pt-2 text-center text-faint">
        {t('welcome.manageNote')}
      </Text>
    </Screen>
  )
}
