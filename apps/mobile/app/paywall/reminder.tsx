import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { StatRow } from '@/features/shared'
import { useAppState } from '@/mock'
import { Button, Card, Icon, Screen, Text } from '@/ui'

/** W2 TRIAL REMINDER */
export default function TrialReminder() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const { subscription, streak, weighIns, profile } = useAppState((state) => ({
    subscription: state.subscription,
    streak: state.streak,
    weighIns: state.weighIns,
    profile: state.profile,
  }))

  // Counted from the real seed rather than hardcoded, so the numbers agree with
  // what the diary shows if the user goes and looks.
  const daysLogged = Math.min(streak.current, 7)
  const meals = daysLogged * 3
  const dropped = Math.max(0, (weighIns[0]?.kg ?? profile.weightKg) - profile.weightKg)

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => router.back()}>
            {t('paywall:reminder.keep')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/settings/subscription')}
          >
            {t('paywall:reminder.manage')}
          </Button>
        </View>
      }
    >
      <View className="items-center gap-4">
        <Icon set="system" name="clock" size={92} />

        <Text className="text-center font-display text-[28px] leading-[34px] text-heading">
          {t('paywall:reminder.title', { count: subscription.trialDaysLeft })}
        </Text>
        <Text className="text-center text-[15px] leading-[23px]">
          {t('paywall:reminder.body', { days: daysLogged, kg: dropped.toFixed(1) })}
        </Text>

        <Card className="w-full">
          <StatRow
            size="md"
            stats={[
              {
                key: 'days',
                label: t('paywall:reminder.daysLogged'),
                value: String(daysLogged),
              },
              { key: 'meals', label: t('paywall:reminder.meals'), value: String(meals) },
              {
                key: 'kg',
                label: t('paywall:reminder.kgDown'),
                value: dropped.toFixed(1),
              },
            ]}
          />
        </Card>

        <Text variant="caption" className="text-center text-faint">
          {t('paywall:reminder.starts', {
            date: subscription.startsOn,
            price: t('paywall:hard.yearlyPrice'),
          })}
        </Text>
      </View>
    </Screen>
  )
}
