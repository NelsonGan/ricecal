import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import type { MealTime, Settings } from '@/data/types'
import { announceGroupChatPush } from './groupChatPushes'
import { parseTime } from './meal-times'

/**
 * Local reminders, all scheduled on the device. A meal reminder is "every day at
 * 08:00 in the user's own timezone", which both platforms express with a daily
 * trigger: no server, no push token, nothing to deliver if the phone is
 * offline at breakfast.
 *
 * That is why `meal_times.at` is a `time` rather than a timestamp. The OS
 * re-evaluates the daily trigger against the current timezone, where a stored
 * instant would fire an hour early for the rest of a trip.
 *
 * Push, when it exists, is for what the phone cannot know by itself.
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
  workoutTitle: string
  workoutBody: string
}

/**
 * The kinds `rescheduleReminders` owns. Everything else that is scheduled (a
 * scan's notice, a workout's rest timer and its "still training?") belongs to
 * whatever booked it, and rewriting the reminders must not cancel it: turning
 * the water reminder on mid-workout used to take the rest timer's notice with
 * it.
 */
const REMINDER_KINDS: ReadonlySet<unknown> = new Set([
  'meal',
  'water',
  'weigh-in',
  'weekly',
  'monthly',
  'workout-reminder',
])

/**
 * Whether the screen that asks "still training?" is open. The workouts feature
 * says how to tell; until it does, the prompt is taken to be on screen.
 */
let workoutPromptShown: () => boolean = () => true
export function whenWorkoutPromptShown(check: () => boolean): void {
  workoutPromptShown = check
}

/**
 * The group chat on screen, as `<group>:<day>`, so its own pushes do not drop a
 * banner over the thread that is already showing the message. The release only
 * clears its own chat: when one thread replaces another, the old one's blur can
 * land after the new one's focus.
 */
let openChat: string | null = null
export function showingGroupChat(chat: string): () => void {
  openChat = chat
  return () => {
    if (openChat === chat) openChat = null
  }
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
    const data = notification.request.content.data
    const kind = data?.kind
    // The same goes for a workout's rest timer, whose countdown is on every
    // screen, a workout started on the watch, which the bar over every tab
    // already shows, and its "still training?", but only where the logger can
    // ask it: on Today at the three-hour mark nothing else would.
    const transient =
      kind === 'scan' ||
      kind === 'rest' ||
      kind === 'started' ||
      (kind === 'workout' && workoutPromptShown()) ||
      (kind === 'group' && data?.chat === true && openChat === `${data.groupId}:${data.day}`)
    const watching = transient && AppState.currentState === 'active'
    // A chat message, heard while the app is open: the board's count catches up.
    if (kind === 'group' && data?.chat === true && typeof data.groupId === 'string') {
      announceGroupChatPush(data.groupId)
    }

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

/**
 * "Rest is over" has a channel of its own on Android, where the sound belongs
 * to the channel rather than to the notification. On the reminders channel,
 * silent by design, it arrived with no sound and no banner while iOS played
 * one. High importance is what lets it pop up over whatever else is on screen.
 */
const REST_CHANNEL = 'workout-rest'

async function ensureRestChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
  })
}

// CALENDAR is iOS-only; DAILY repeats at the chosen local time on both platforms.
const dailyTrigger = (hour: number, minute: number): Notifications.DailyTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour,
  minute,
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
export function rescheduleReminders(
  settings: Settings,
  mealTimes: readonly MealTime[],
  copy: ReminderCopy,
): Promise<void> {
  return afterReminders(() => writeReminders(settings, mealTimes, copy))
}

let reminderRun: Promise<void> = Promise.resolve()

/**
 * One at a time. Two runs that overlapped each read the booked list before
 * the other had booked, and both full sets stayed: tapping Mon then Wed on
 * the workout reminders quickly left Monday booked twice.
 */
function afterReminders(step: () => Promise<void>): Promise<void> {
  reminderRun = reminderRun.catch(() => {}).then(step)
  return reminderRun
}

/** Every scheduled reminder, unbooked. For signing out: they are that account's. */
export function cancelReminders(): Promise<void> {
  return afterReminders(unbookReminders)
}

async function unbookReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      // A notification with no kind at all predates the kinds, and was a reminder.
      .filter((entry) => {
        const kind = entry.content.data?.kind
        return kind === undefined || REMINDER_KINDS.has(kind)
      })
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
  )
}

async function writeReminders(
  settings: Settings,
  mealTimes: readonly MealTime[],
  copy: ReminderCopy,
): Promise<void> {
  await ensureChannel()
  await unbookReminders()

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

  // Workouts, on the days the user trains. Stored as JavaScript's `getDay()`
  // (0 is Sunday) and booked as this API's weekday, where 1 is Sunday.
  const at = parseTime(settings.workout_reminder_at ?? '18:00')
  for (const day of settings.workout_reminder_days ?? []) {
    if (day < 0 || day > 6) continue
    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.workoutTitle,
        body: copy.workoutBody,
        data: { kind: 'workout-reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day + 1,
        hour: at.hour,
        minute: at.minute,
        channelId: CHANNEL,
      },
    })
  }
}

/**
 * "Your plate is counted", for the scan the user walked away from. Scheduled at
 * the shutter rather than at the answer: a scan takes fifteen to thirty seconds
 * and iOS suspends the app well before that, so the code that runs when the
 * answer arrives may never run. A notification booked in advance is honoured
 * while an app is suspended, and this one is cancelled if the app is awake when
 * the plate lands.
 *
 * Which is why the copy is generic: at booking time nobody knows what the dish
 * is, and `announceScan` replaces it with the name when the app can say so.
 *
 * Best-effort throughout: a notification that cannot be posted must never take a
 * scan down with it.
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

/**
 * The one-off notices a running workout books: its rest timer and its "still
 * training?". Each has one fixed identifier, so booking it again replaces it.
 * With random ids, every relaunch mid-workout booked a second "still
 * training?" that finishing never cancelled, and it fired hours later for a
 * workout already saved.
 */
const WORKOUT_NOTICE = {
  rest: 'workout-rest',
  workout: 'workout-stale',
  /** A workout started on the Apple Watch, so the phone says where it is. */
  started: 'workout-started',
} as const

/**
 * Bumped by every booking and every cancel of a kind, so a booking that is
 * still waiting on the permission check gives up if anything came after it. A
 * rest skipped in that moment was cancelled first and then booked anyway.
 */
const noticeGeneration: Record<string, number> = {}
const nextGeneration = (kind: string) => {
  noticeGeneration[kind] = (noticeGeneration[kind] ?? 0) + 1
  return noticeGeneration[kind]
}

/**
 * Book a workout notice for a moment. Best effort, like the scan notice: it
 * does nothing when notifications are not allowed or the moment has passed.
 */
export async function scheduleNoticeAt(
  at: number,
  kind: keyof typeof WORKOUT_NOTICE,
  content: { title: string; body: string },
): Promise<void> {
  const generation = nextGeneration(kind)
  const seconds = Math.round((at - Date.now()) / 1000)
  if (seconds < 1) return
  const rest = kind === 'rest'
  try {
    if (!(await notificationsAllowed())) return
    await (rest ? ensureRestChannel() : ensureChannel())
    if (noticeGeneration[kind] !== generation) return
    await Notifications.scheduleNotificationAsync({
      identifier: WORKOUT_NOTICE[kind],
      content: { ...content, data: { kind }, sound: rest ? 'default' : undefined },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: rest ? REST_CHANNEL : CHANNEL,
      },
    })
  } catch (error) {
    console.warn('[notifications] could not book a workout notice', error)
  }
}

/** Post a workout notice now. Best effort, as booking one is. */
export async function announceNotice(
  kind: keyof typeof WORKOUT_NOTICE,
  content: { title: string; body: string },
): Promise<void> {
  const generation = nextGeneration(kind)
  try {
    if (!(await notificationsAllowed())) return
    await ensureChannel()
    if (noticeGeneration[kind] !== generation) return
    await Notifications.scheduleNotificationAsync({
      identifier: WORKOUT_NOTICE[kind],
      content: { ...content, data: { kind } },
      trigger: null,
    })
  } catch (error) {
    console.warn('[notifications] could not post a workout notice', error)
  }
}

/**
 * Take a workout notice back: unbooked if it is still to come, and cleared from
 * Notification Center if it already came, so "Rest is over" for a workout that
 * has since finished is not left there to tap.
 */
export async function cancelNotice(kind: keyof typeof WORKOUT_NOTICE): Promise<void> {
  nextGeneration(kind)
  const id = WORKOUT_NOTICE[kind]
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(id),
    Notifications.dismissNotificationAsync(id),
  ])
}
