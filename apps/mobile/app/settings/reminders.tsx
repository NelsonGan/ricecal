import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, View } from 'react-native'
import { type Meal, useMealTimes, useSettings, useUpdateMealTime, useUpdateSettings } from '@/data'
import { ToggleRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { ensureNotificationPermission } from '@/lib/notifications'
import { useThemeColors } from '@/theme/useTheme'
import { Alert, AppBar, Card, Icon, Screen, Text, useToast } from '@/ui'

const REMINDER_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

/** U4 REMINDERS */
export default function RemindersScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const colors = useThemeColors()
  const toast = useToast()

  const { data: settings } = useSettings()
  const { data: mealTimes } = useMealTimes()
  const updateSettings = useUpdateSettings()
  const updateMealTime = useUpdateMealTime()
  const [blocked, setBlocked] = useState(false)

  /**
   * Every switch on this screen goes through here.
   *
   * Permission is asked for on the first thing the user turns on, not on
   * launch — the ask lands when they have just said what they want, which is
   * the only moment it makes sense. Turning something OFF never asks.
   */
  const withPermission = async (enable: boolean, write: () => void) => {
    if (!enable) {
      write()
      return
    }

    try {
      const granted = await ensureNotificationPermission()
      if (!granted) {
        setBlocked(true)
        toast.show({ title: t('profile:reminders.denied'), tone: 'warning' })
        return
      }
      setBlocked(false)
      write()
    } catch (error) {
      // A switch that does nothing and says nothing is the worst outcome here:
      // the user believes the reminder is on. Anything unexpected is reported.
      toast.show({
        title: error instanceof Error ? error.message : t('profile:reminders.denied'),
        tone: 'error',
      })
    }
  }

  const timeFor = (meal: Meal) => (mealTimes ?? []).find((slot) => slot.meal === meal)?.at ?? ''
  const enabledFor = (meal: Meal) =>
    (mealTimes ?? []).find((slot) => slot.meal === meal)?.reminder_enabled ?? false

  return (
    <Screen>
      <AppBar
        title={t('profile:reminders.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {/* Only after a refusal, and it links out rather than asking again:
          once `canAskAgain` is false the OS dialog never appears again. */}
      {blocked ? (
        <Alert
          tone="warning"
          title={t('profile:reminders.blockedTitle')}
          description={t('profile:reminders.blockedBody')}
          action={
            <Text
              variant="label"
              className="text-pandan-ink"
              onPress={() => Linking.openSettings()}
            >
              {t('profile:reminders.openSettings')}
            </Text>
          }
        />
      ) : null}

      <Card title={t('profile:reminders.meals')} contentClassName="gap-0">
        {REMINDER_MEALS.map((meal, index) => (
          <ToggleRow
            key={meal}
            title={t('profile:reminders.mealAt', {
              meal: t(`common:meal.${meal}`),
              time: formatTime(timeFor(meal)),
            })}
            value={enabledFor(meal)}
            onValueChange={(value) =>
              withPermission(value, () => updateMealTime.mutate({ meal, reminder_enabled: value }))
            }
            divider={index < REMINDER_MEALS.length - 1}
          />
        ))}
      </Card>

      <Card title={t('profile:reminders.habits')} contentClassName="gap-0">
        <ToggleRow
          title={t('profile:reminders.water')}
          value={settings?.notify_water ?? false}
          onValueChange={(value) =>
            withPermission(value, () => updateSettings.mutate({ notify_water: value }))
          }
        />
        <ToggleRow
          title={t('profile:reminders.weighIn')}
          value={settings?.notify_weigh_in ?? false}
          onValueChange={(value) =>
            withPermission(value, () => updateSettings.mutate({ notify_weigh_in: value }))
          }
        />
        <ToggleRow
          title={t('profile:reminders.weeklyReport')}
          value={settings?.notify_weekly_report ?? false}
          onValueChange={(value) =>
            withPermission(value, () => updateSettings.mutate({ notify_weekly_report: value }))
          }
          divider={false}
        />
      </Card>

      <Card title={t('profile:reminders.quietHours')}>
        <View className="flex-row items-center justify-between">
          <Text variant="label">
            {t('profile:reminders.quietRange', {
              from: formatTime(settings?.quiet_from ?? '22:00'),
              to: formatTime(settings?.quiet_to ?? '07:00'),
            })}
          </Text>
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.faint} />
        </View>
        <Text variant="meta">{t('profile:reminders.quietNote')}</Text>
        <Text variant="meta">{t('profile:reminders.ramadanNote')}</Text>
      </Card>
    </Screen>
  )
}

/** "08:00:00" → "8:00 am". Postgres `time` carries seconds nobody wants to read. */
function formatTime(at: string): string {
  const [rawHour = '0', minute = '00'] = at.split(':')
  const hour = Number(rawHour)
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${minute} ${suffix}`
}
