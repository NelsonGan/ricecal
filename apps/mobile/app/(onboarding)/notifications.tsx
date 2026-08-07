import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useSession, useUpdateMealTime } from '@/data'
import { FactRow, OnboardingStep, stepNumber, TOTAL_STEPS } from '@/features/onboarding'
import { ensureNotificationPermission } from '@/lib/notifications'
import { Card, Text, useToast } from '@/ui'

/**
 * 09 ENABLE NOTIFICATIONS
 *
 * The one ask that has to do something.
 *
 * Every `reminder_enabled` starts false in the signup trigger, deliberately —
 * an app that schedules notifications nobody asked for is an app that gets its
 * permission revoked. Which means a screen that only calls
 * `ensureNotificationPermission` and moves on grants the OS permission and then
 * schedules NOTHING: the user taps "Enable notifications", says yes to the
 * system dialog, and never receives one. So granting here also turns the three
 * meal reminders on, which is what the button says it does.
 *
 * The rows below are what will actually arrive, and the third row is there
 * because it is the one every other tracker gets wrong: water and weigh-in
 * nudges exist and stay OFF until somebody goes and asks for them.
 *
 * Nothing is scheduled from this screen. `useReminderSync` is mounted inside the
 * tabs and rewrites the whole queue from `meal_times` and `user_settings`; a
 * second scheduler here would race it, and cancel-then-schedule means the loser
 * of that race leaves an empty queue behind.
 */

/** The three that get turned on. Snack is a meal slot, not a reminder anybody wants. */
const REMINDER_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

export default function NotificationsStepRoute() {
  const { session, loading } = useSession()

  if (loading) return null
  // `useUpdateMealTime` reaches `useUserId`, which throws by design without one.
  if (!session) return <Redirect href="/" />

  return <NotificationsStep />
}

function NotificationsStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const updateMealTime = useUpdateMealTime()

  const [busy, setBusy] = useState(false)

  const next = () => router.replace('/(onboarding)/tutorial')

  /**
   * The three writes, started but NOT waited on.
   *
   * Sequential rather than parallel, because each carries an optimistic update
   * over the same cache key: three in flight at once means three snapshots of
   * three different "previous" states, and one failure rolls the other two back
   * with it.
   *
   * Detached, because writes are `networkMode: 'online'` across the app — so on
   * a phone with no signal react-query PAUSES these rather than rejecting them,
   * and an awaited `mutateAsync` simply never settles. That left the button
   * disabled and the flow stopped dead on the last screen before the diary. The
   * optimistic update has already flipped the cache, `useReminderSync` schedules
   * from that the moment Today mounts, and the paused writes land by themselves
   * when the connection does.
   */
  const turnOnMealReminders = async () => {
    for (const meal of REMINDER_MEALS) {
      await updateMealTime.mutateAsync({ meal, reminder_enabled: true })
    }
  }

  const enable = async () => {
    setBusy(true)
    try {
      const granted = await ensureNotificationPermission()
      if (!granted) {
        // `canAskAgain` is false by now, so the dialog will never appear again.
        // Saying where the switch lives beats asking a second time and being
        // silently refused.
        toast.show({ title: t('onboarding:notifications.blocked'), tone: 'warning' })
        return
      }

      // Nothing to report on failure from here: the mutation rolls its own
      // optimistic update back, and by then this screen is gone. The reminders
      // screen in Me shows whatever actually stuck.
      turnOnMealReminders().catch(() => {})
    } catch (error) {
      // A permission the SDK could not record, most likely. The flow carries on
      // either way: Me has a screen that fixes this, and a new account stuck
      // behind a toast has nowhere to go at all.
      toast.show({
        title: error instanceof Error ? error.message : t('onboarding:notifications.blocked'),
        tone: 'warning',
      })
    } finally {
      setBusy(false)
      next()
    }
  }

  return (
    <OnboardingStep
      step={stepNumber('notifications')}
      total={TOTAL_STEPS}
      accent="kaya"
      title={t('onboarding:notifications.title')}
      subtitle={t('onboarding:notifications.subtitle')}
      primaryLabel={t('onboarding:notifications.enable')}
      primaryDisabled={busy}
      onPrimary={enable}
      secondaryLabel={t('onboarding:notifications.later')}
      onSecondary={next}
    >
      <Card title={t('onboarding:notifications.sendTitle')}>
        <View className="gap-3.5">
          <FactRow
            icon={{ set: 'system', name: 'bell-active' }}
            title={t('onboarding:notifications.meals')}
            body={t('onboarding:notifications.mealsBody')}
          />
          <FactRow
            icon={{ set: 'system', name: 'camera' }}
            title={t('onboarding:notifications.scans')}
            body={t('onboarding:notifications.scansBody')}
          />
          <FactRow
            icon={{ set: 'system', name: 'bell-off' }}
            title={t('onboarding:notifications.nothingElse')}
            body={t('onboarding:notifications.nothingElseBody')}
          />
        </View>

        <Text variant="meta" className="pt-4">
          {t('onboarding:notifications.promise')}
        </Text>
      </Card>
    </OnboardingStep>
  )
}
