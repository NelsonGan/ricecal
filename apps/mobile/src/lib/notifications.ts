import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'

import type { MealTime, Settings } from '@/data/types'
import { parseTime } from './meal-times'

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
  monthlyTitle: string
  monthlyBody: string
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    /**
     * A scan notice is never shown to someone who is looking at the scan.
     *
     * It is booked at the shutter for a fixed delay (see `scheduleScanNotice`)
     * because a suspended app cannot post anything when the answer arrives. A
     * scan slower than that delay therefore fires it while the user is
     * watching the row still spin — a banner saying the plate is counted, over
     * a plate that is not counted yet. The row in front of them is the better
     * answer, so the banner steps aside.
     */
    const scan = notification.request.content.data?.kind === 'scan'
    const watching = scan && AppState.currentState === 'active'

    return {
      shouldShowBanner: !watching,
      shouldShowList: !watching,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }
  },
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

  // No quiet-hours filter. It silently dropped reminders the user had asked
  // for — a meal at 22:30 was scheduled, skipped, and never explained — and
  // the window it checked against was not editable anywhere in the app.
  for (const meal of mealTimes) {
    if (!meal.reminder_enabled) continue
    const time = parseTime(meal.at)

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
  if (settings.notify_water) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.waterTitle, body: copy.waterBody, data: { kind: 'water' } },
      trigger: dailyTrigger(15, 0),
    })
  }

  // First thing, because that is the reading the weight chart is drawn from.
  if (settings.notify_weigh_in) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.weighInTitle, body: copy.weighInBody, data: { kind: 'weigh-in' } },
      trigger: dailyTrigger(7, 30),
    })
  }

  /**
   * The two look-backs, and both open the review they are about — see
   * `data.kind`, which `useReportLinks` routes on.
   *
   * MONDAY MORNING, not Sunday evening. A weekly review is of a FINISHED week,
   * and `review_periods` will not offer one until it is over: fired at seven on
   * Sunday it linked to the week before last, which is a notice about a week
   * nobody remembers arriving while the one they are living is still going.
   */
  if (settings.notify_weekly_report) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.weeklyTitle, body: copy.weeklyBody, data: { kind: 'weekly' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        // 1 is Sunday in this API, so Monday is 2. The one off-by-one here that
        // no type can catch, since every weekday is a valid number.
        weekday: 2,
        hour: 9,
        minute: 0,
        channelId: CHANNEL,
      },
    })
  }

  if (settings.notify_monthly_report) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.monthlyTitle, body: copy.monthlyBody, data: { kind: 'monthly' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        // The first, for the month that ended yesterday. Same rule as the week.
        day: 1,
        hour: 9,
        minute: 0,
        channelId: CHANNEL,
      },
    })
  }
}

/**
 * "Your plate is counted" — for the scan the user walked away from.
 *
 * SCHEDULED AT THE SHUTTER, NOT AT THE ANSWER.
 *
 * A scan takes fifteen to thirty seconds, which is long enough to lock the
 * phone and put it in a pocket — and iOS suspends the app well before that,
 * so the code that runs when the answer arrives is code that may never run.
 * Posting from there produced nothing at all. What the system does honour
 * while an app is suspended is a notification that was already scheduled, so
 * this one is booked the moment the shutter fires and cancelled if the app is
 * still awake when the plate lands. The user is told either by the row in
 * front of them or by this, never by both.
 *
 * Which is also why the copy is generic: at booking time nobody knows what
 * the dish is. `announceScan` replaces it with the name when the app is alive
 * to say so.
 *
 * Best-effort throughout: a notification that cannot be posted must never take
 * a scan down with it.
 */
const SCAN_NOTICE_DELAY_S = 25

export async function scheduleScanNotice(title: string, body: string): Promise<string | null> {
  try {
    if (!(await notificationsAllowed())) {
      // Said out loud, because the alternative is a feature that silently
      // does nothing and a bug report with no thread to pull.
      console.warn('[notifications] a scan started, but notifications are not permitted')
      return null
    }
    await ensureChannel()
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'scan' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: SCAN_NOTICE_DELAY_S,
        channelId: CHANNEL,
      },
    })
  } catch (error) {
    console.warn('[notifications] could not book the scan notice', error)
    return null
  }
}

export async function cancelScanNotice(id: string | null): Promise<void> {
  if (!id) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch {
    // Already delivered, most likely. Nothing to undo and nothing to say.
  }
}

/** The named version, for when the app is awake but not in front. */
export async function announceScan(title: string, body: string): Promise<void> {
  try {
    if (!(await notificationsAllowed())) return
    await ensureChannel()
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'scan' } },
      trigger: null,
    })
  } catch (error) {
    console.warn('[notifications] could not announce the finished scan', error)
  }
}
