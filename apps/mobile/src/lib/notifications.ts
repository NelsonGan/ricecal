import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import type { MealTime, Settings } from '@/data/types'
import { isQuiet, parseTime } from './quiet-hours'

/**
 * Local reminders.
 *
 * All of it is scheduled on the device. A meal reminder is "every day at
 * 08:00 in the user's own timezone", which iOS and Android both express as a
 * repeating calendar trigger — no server, no push token, and nothing to
 * deliver if the phone is offline at breakfast.
 *
 * That is why `meal_times.at` is a `time` and not a timestamp: the rule is
 * about the user's clock, and it stays true when they fly somewhere else. The
 * OS re-evaluates a calendar trigger against the current timezone; a stored
 * instant would fire an hour early for the rest of the trip.
 *
 * Push, when it exists, is for what the phone cannot know by itself — the
 * weekly report, a friend's nudge. Everything here is deliberately not that.
 */

/** One category per kind, so a reschedule can replace its own and nothing else. */
const CHANNEL = 'reminders'

export type ReminderCopy = {
  mealTitle: (meal: string) => string
  mealBody: (meal: string) => string
  waterTitle: string
  waterBody: string
  weighInTitle: string
  weighInBody: string
  weeklyTitle: string
  weeklyBody: string
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/**
 * Asks, once, and reports what the user said.
 *
 * Never called on launch. A notification the user never asked for on the day
 * they sign up is how an app gets its permission revoked — which is also why
 * every `reminder_enabled` starts false in the signup trigger. The ask happens
 * when they turn their first reminder on.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync()
  if (existing.granted) return true

  // `canAskAgain` false means they said no already. Asking again is a no-op
  // that returns denied, so the caller needs to send them to Settings instead.
  if (!existing.canAskAgain) return false

  try {
    const request = await Notifications.requestPermissionsAsync()
    return request.granted
  } catch (error) {
    /**
     * The request can reject AFTER the user has already tapped Allow.
     *
     * expo-notifications stores its server registration in the keychain once
     * permission is granted, and on a build with no entitlements that write
     * throws — so the OS has the permission and the SDK reports failure.
     * Asking the OS directly is what tells those two cases apart; without it
     * the switch the user just turned on quietly turns itself back off.
     */
    const granted = await notificationsAllowed()
    if (!granted) throw error
    console.warn('[notifications] permission granted, but the SDK could not record it', error)
    return true
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted
  } catch {
    return false
  }
}

/** Android needs a channel before anything will show. iOS ignores this. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  })
}

const dailyTrigger = (hour: number, minute: number): Notifications.CalendarTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
  hour,
  minute,
  repeats: true,
  channelId: CHANNEL,
})

/**
 * Rewrites every scheduled reminder from the user's settings.
 *
 * Cancel-then-schedule rather than diffing: the whole set is small, the
 * settings that produce it are the source of truth, and a diff has to be
 * correct about the one case that matters least — the reminder that did not
 * change. Cancelling everything also cleans up after a reminder whose meal was
 * deleted, or one scheduled by a previous version of this function.
 */
export async function rescheduleReminders(
  settings: Settings,
  mealTimes: readonly MealTime[],
  copy: ReminderCopy,
): Promise<void> {
  await ensureChannel()
  await Notifications.cancelAllScheduledNotificationsAsync()

  if (!(await notificationsAllowed())) return

  const quiet = (time: { hour: number; minute: number }) =>
    isQuiet(time, settings.quiet_from, settings.quiet_to)

  for (const meal of mealTimes) {
    if (!meal.reminder_enabled) continue
    const time = parseTime(meal.at)
    // A meal inside quiet hours is not rescheduled to a different time — the
    // user chose when they eat. It is simply not announced.
    if (quiet(time)) continue

    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.mealTitle(meal.meal),
        body: copy.mealBody(meal.meal),
        data: { kind: 'meal', meal: meal.meal },
      },
      trigger: dailyTrigger(time.hour, time.minute),
    })
  }

  // Water is the one reminder with no time of its own. Mid-afternoon is when
  // a day's drinking is behind and can still be caught up.
  if (settings.notify_water && !quiet({ hour: 15, minute: 0 })) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.waterTitle, body: copy.waterBody, data: { kind: 'water' } },
      trigger: dailyTrigger(15, 0),
    })
  }

  // First thing, because that is the reading the weight chart is drawn from.
  if (settings.notify_weigh_in && !quiet({ hour: 7, minute: 30 })) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.weighInTitle, body: copy.weighInBody, data: { kind: 'weigh-in' } },
      trigger: dailyTrigger(7, 30),
    })
  }

  if (settings.notify_weekly_report) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.weeklyTitle, body: copy.weeklyBody, data: { kind: 'weekly' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        // Sunday evening, looking back at the week that just ended.
        weekday: 1,
        hour: 19,
        minute: 0,
        channelId: CHANNEL,
      },
    })
  }
}

/** What is actually queued. Used by the reminders screen to show the count. */
export async function scheduledCount(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
}
