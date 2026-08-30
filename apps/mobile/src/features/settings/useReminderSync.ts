import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useMealTimes, useSession, useSettings } from '@/data'
import { rescheduleReminders } from '@/lib/notifications'

/**
 * Keeps the phone's scheduled reminders equal to the user's settings.
 *
 * Mounted once, inside the tabs. It watches the two queries that decide what
 * should be scheduled and rewrites the schedule whenever they change: turning a
 * reminder on, moving a meal, editing quiet hours, and the case nothing else
 * covers, signing in on a new phone where the settings arrive from Postgres and
 * the device has nothing queued.
 *
 * The copy is passed in rather than read inside the scheduler because a
 * notification is scheduled once and delivered days later, so whatever language
 * the user had when they turned it on is the language it fires in.
 */
export function useReminderSync(): void {
  const { t } = useTranslation(['profile', 'common'])
  const { userId } = useSession()
  const { data: settings } = useSettings()
  const { data: mealTimes } = useMealTimes()

  // What was last written to the OS. Rescheduling is cancel-then-schedule, so
  // doing it on every render would cancel a queue and rebuild it several times
  // a second while a screen is mounted.
  const lastKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!userId || !settings || !mealTimes) return

    const key = JSON.stringify([
      settings.notify_water,
      settings.notify_weigh_in,
      settings.notify_weekly_report,
      settings.notify_monthly_report,
      settings.quiet_from,
      settings.quiet_to,
      mealTimes.map((meal) => [meal.meal, meal.at, meal.reminder_enabled]),
    ])

    if (key === lastKey.current) return
    lastKey.current = key

    // The meal's own name, lowercased: it sits mid-sentence in the copy.
    const mealName = (meal: string) =>
      t(`common:meal.${meal}` as 'common:meal.breakfast').toLowerCase()

    rescheduleReminders(settings, mealTimes, {
      mealTitle: (meal) => t('profile:reminders.push.mealTitle', { meal: mealName(meal) }),
      mealBody: (meal) => t('profile:reminders.push.mealBody', { meal: mealName(meal) }),
      waterTitle: t('profile:reminders.push.waterTitle'),
      waterBody: t('profile:reminders.push.waterBody'),
      weighInTitle: t('profile:reminders.push.weighInTitle'),
      weighInBody: t('profile:reminders.push.weighInBody'),
      weeklyTitle: t('profile:reminders.push.weeklyTitle'),
      weeklyBody: t('profile:reminders.push.weeklyBody'),
      monthlyTitle: t('profile:reminders.push.monthlyTitle'),
      monthlyBody: t('profile:reminders.push.monthlyBody'),
    })
  }, [userId, settings, mealTimes, t])
}
