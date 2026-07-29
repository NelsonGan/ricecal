import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ToggleRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { type Reminders, useAppState, useDispatch } from '@/mock'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, Card, Icon, Screen, Text } from '@/ui'

/** U4 REMINDERS */
export default function RemindersScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const dispatch = useDispatch()
  const colors = useThemeColors()
  const { reminders, mealTimes } = useAppState((state) => ({
    reminders: state.reminders,
    mealTimes: state.profile.mealTimes,
  }))

  const set = (patch: Partial<Reminders>) => dispatch({ type: 'setReminders', patch })

  const timeFor = (meal: 'breakfast' | 'lunch' | 'dinner') =>
    mealTimes.find((slot) => slot.meal === meal)?.time ?? ''

  return (
    <Screen>
      <AppBar
        title={t('profile:reminders.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card title={t('profile:reminders.meals')} contentClassName="gap-0">
        {(['breakfast', 'lunch', 'dinner'] as const).map((meal, index) => (
          <ToggleRow
            key={meal}
            title={t('profile:reminders.mealAt', {
              meal: t(`common:meal.${meal}`),
              time: timeFor(meal),
            })}
            value={reminders[meal]}
            onValueChange={(value) => set({ [meal]: value })}
            divider={index < 2}
          />
        ))}
      </Card>

      <Card title={t('profile:reminders.habits')} contentClassName="gap-0">
        <ToggleRow
          title={t('profile:reminders.water')}
          value={reminders.water}
          onValueChange={(water) => set({ water })}
        />
        <ToggleRow
          title={t('profile:reminders.weighIn')}
          value={reminders.weighIn}
          onValueChange={(weighIn) => set({ weighIn })}
        />
        <ToggleRow
          title={t('profile:reminders.weeklyReport')}
          value={reminders.weeklyReport}
          onValueChange={(weeklyReport) => set({ weeklyReport })}
          divider={false}
        />
      </Card>

      <Card title={t('profile:reminders.quietHours')}>
        <View className="flex-row items-center justify-between">
          <Text variant="label">
            {t('profile:reminders.quietRange', {
              from: reminders.quietFrom,
              to: reminders.quietTo,
            })}
          </Text>
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.faint} />
        </View>
        <Text variant="meta">{t('profile:reminders.ramadanNote')}</Text>
      </Card>
    </Screen>
  )
}
