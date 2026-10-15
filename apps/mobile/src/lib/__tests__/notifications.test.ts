import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import type { MealTime, Settings } from '@/data/types'
import { type ReminderCopy, rescheduleReminders, scheduleNoticeAt } from '@/lib/notifications'

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    TIME_INTERVAL: 'timeInterval',
  },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}))

const copy: ReminderCopy = {
  mealTitle: (meal) => meal,
  mealBody: (meal) => meal,
  waterTitle: 'Water',
  waterBody: 'Water',
  weighInTitle: 'Weight',
  weighInBody: 'Weight',
  weeklyTitle: 'Week',
  weeklyBody: 'Week',
  monthlyTitle: 'Month',
  monthlyBody: 'Month',
  workoutTitle: 'Train',
  workoutBody: 'Train',
}
const settings = {
  notify_water: true,
  notify_weigh_in: true,
  notify_weekly_report: true,
  notify_monthly_report: true,
} as Settings
const meals = [
  { meal: 'breakfast', at: '08:15:00', reminder_enabled: true },
  { meal: 'lunch', at: '12:00:00', reminder_enabled: false },
  { meal: 'dinner', at: '22:30:00', reminder_enabled: true },
] as MealTime[]

const originalOS = Platform.OS
afterEach(() => {
  Platform.OS = originalOS
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as never)
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([])
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async ({ trigger }) => {
    // Model the native rejection that stopped every later reminder on Android.
    if (
      Platform.OS === 'android' &&
      trigger !== null &&
      typeof trigger === 'object' &&
      'type' in trigger &&
      trigger.type === 'calendar'
    ) {
      throw new Error('Trigger of type: calendar is not supported on Android.')
    }
    return 'scheduled'
  })
})

it.each(['android', 'ios'] as const)('schedules the full reminder set on %s', async (platform) => {
  Platform.OS = platform
  await rescheduleReminders(settings, meals, copy)

  const requests = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(([r]) => r)
  expect(requests.map((r) => r.content.data?.kind)).toEqual([
    'meal',
    'meal',
    'water',
    'weigh-in',
    'weekly',
    'monthly',
  ])
  expect(requests.map((r) => r.trigger)).toEqual([
    { type: 'daily', hour: 8, minute: 15, channelId: 'reminders' },
    { type: 'daily', hour: 22, minute: 30, channelId: 'reminders' },
    { type: 'daily', hour: 15, minute: 0, channelId: 'reminders' },
    { type: 'daily', hour: 7, minute: 30, channelId: 'reminders' },
    { type: 'weekly', weekday: 2, hour: 9, minute: 0, channelId: 'reminders' },
    { type: 'monthly', day: 1, hour: 9, minute: 0, channelId: 'reminders' },
  ])
})

it('schedules nothing without notification permission', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as never)
  await rescheduleReminders(settings, meals, copy)
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled()
})

it('books a workout reminder on each training day, as this API numbers weekdays', async () => {
  await rescheduleReminders(
    { ...settings, workout_reminder_days: [1, 3, 0], workout_reminder_at: '18:30:00' } as Settings,
    [],
    copy,
  )
  const workouts = jest
    .mocked(Notifications.scheduleNotificationAsync)
    .mock.calls.map(([request]) => request)
    .filter((request) => request.content.data?.kind === 'workout-reminder')
  expect(workouts.map((request) => request.trigger)).toEqual([
    { type: 'weekly', weekday: 2, hour: 18, minute: 30, channelId: 'reminders' },
    { type: 'weekly', weekday: 4, hour: 18, minute: 30, channelId: 'reminders' },
    { type: 'weekly', weekday: 1, hour: 18, minute: 30, channelId: 'reminders' },
  ])
})

it('rewrites only the reminders, never a running workout or scan notice', async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
    { identifier: 'meal', content: { data: { kind: 'meal' } } },
    { identifier: 'old', content: { data: {} } },
    { identifier: 'rest', content: { data: { kind: 'rest' } } },
    { identifier: 'stale', content: { data: { kind: 'workout' } } },
    { identifier: 'scan', content: { data: { kind: 'scan' } } },
  ] as never)
  await rescheduleReminders(settings, meals, copy)
  const cancelled = jest
    .mocked(Notifications.cancelScheduledNotificationAsync)
    .mock.calls.map(([id]) => id)
  expect(cancelled.sort()).toEqual(['meal', 'old'])
  expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled()
})

it('books "rest is over" on a channel that can be heard, and "still training?" on the quiet one', async () => {
  Platform.OS = 'android'
  const at = Date.now() + 90_000
  await scheduleNoticeAt(at, 'rest', { title: 'Rest', body: 'Rest' })
  await scheduleNoticeAt(at, 'workout', { title: 'Still', body: 'Still' })

  const requests = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map(([r]) => r)
  expect(requests.map((r) => [r.identifier, r.content.sound, r.trigger])).toEqual([
    ['workout-rest', 'default', { type: 'timeInterval', seconds: 90, channelId: 'workout-rest' }],
    ['workout-stale', undefined, { type: 'timeInterval', seconds: 90, channelId: 'reminders' }],
  ])
  expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.calls).toContainEqual([
    'workout-rest',
    { name: 'Rest timer', importance: 4 },
  ])
})
