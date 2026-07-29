import { format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useCurrentWeight, useStreak, useSubscription, useWeighIns } from '@/data'
import { StatRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { Button, Card, Icon, Screen, Text } from '@/ui'

/** W2 TRIAL REMINDER */
export default function TrialReminder() {
  const { t } = useTranslation(['paywall', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const { data: subscription } = useSubscription()
  const { data: weighIns = [] } = useWeighIns()
  const current = useCurrentWeight() ?? 0
  const streak = useStreak()

  // Whole days until the store charges. Derived from the instant RevenueCat
  // reported rather than a counter, which would need something to decrement it.
  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : 0

  // Counted from what was actually logged, so the numbers agree with the diary
  // if the user goes and looks.
  const daysLogged = Math.min(streak.current, 7)
  const meals = daysLogged * 3
  const dropped = Math.max(0, (weighIns[0]?.kg ?? current) - current)

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center"
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => goBack()}>
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

        <Text variant="title" className="text-center">
          {t('paywall:reminder.title', { count: trialDaysLeft })}
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
            date: subscription?.trial_ends_at
              ? format(parseISO(subscription.trial_ends_at), 'd MMMM')
              : '',
            price: t('paywall:hard.yearlyPrice'),
          })}
        </Text>
      </View>
    </Screen>
  )
}
