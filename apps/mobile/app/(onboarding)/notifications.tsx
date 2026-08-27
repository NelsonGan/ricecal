import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useSession, useUpdateMealTime } from '@/data'
import { FactRow, OnboardingStep } from '@/features/onboarding'
import { ensureNotificationPermission } from '@/lib/notifications'
import { Card, Icon, Text, useToast } from '@/ui'

/**
 * 09 ENABLE NOTIFICATIONS
 *
 * The one ask that has to do something.
 *
 * Every `reminder_enabled` starts false in the signup trigger, deliberately —
 * an app that schedules notifications nobody asked for is an app that gets its
 * permission revoked. Which means a screen that only calls
 * `ensureNotificationPermission` and moves on grants the OS permission and then
 * schedules NOTHING: the user says yes to the system dialog and never receives
 * one. So granting here also turns the three meal reminders on, which is what
 * the rows on this screen promise.
 *
 * ONE BUTTON, AND IT SAYS "CONTINUE". Guideline 5.1.1(iv), the same rule the
 * health step is shaped by: the message has to lead to the request, and the
 * button in front of it may not be worded as the ask. It used to read "Enable
 * notifications" with a "Maybe later" beside it, which is both halves of that
 * at once.
 *
 * NOTHING HERE CAN TRAP ANYBODY, which is what makes losing the skip safe.
 * `ensureNotificationPermission` is entirely local — no network, so nothing to
 * pause offline — and `enable` calls `next()` from a `finally`, so a granted
 * permission, a refusal, a phone that has already been asked and an SDK that
 * threw all leave by the same door.
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

  /**
   * Straight to the offer, and then to the diary.
   */
  const next = () => router.replace('/paywall/intro')

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
      name="notifications"
      accent="kaya"
      title={t('onboarding:notifications.title')}
      subtitle={t('onboarding:notifications.subtitle')}
      /* "Continue", and no second button, for the same reason the health step
         has neither: guideline 5.1.1(iv). A message shown before a permission
         request has to LEAD to the request, so a "Maybe later" beside it is a
         way past the sheet the guideline does not allow; and the button in
         front of the sheet may not be worded as the ask, so "Enable
         notifications" is out. Apple's own examples are "Continue" and "Next".

         Saying no is the system dialog's own "Don't Allow", which is where the
         decision always actually was — and `enable` moves on regardless, so
         this is a one-tap answer either way. */
      primaryLabel={t('common:action.continue')}
      primaryDisabled={busy}
      onPrimary={enable}
      secondaryLabel={undefined}
      onSecondary={undefined}
    >
      {/* A clock and a bowl, which is the whole ask in one picture.
          96 because that is the ceiling `Icon` documents for art, and on an SE
          it is what leaves the promise line clear of the CTA.

          This screen has room for a picture where the other permission does
          not: the health step already carries a card of read rows, a reason
          card when the store is unusable and a demo button, and a hero on top
          of that is what pushes its CTA off a small phone. */}
      <View className="items-center pb-1">
        <Icon set="scenes" name="clock" size={96} />
      </View>

      {/* Three lines and no card title. What each row said underneath itself
          ("breakfast, lunch and dinner, at your own times") is now the screen's
          own subtitle, said once — the rows were repeating the heading in
          smaller type, which is how a permission ask ends up being three
          paragraphs long. The third row stays, because "and nothing else" is
          the one thing here nobody expects and every other tracker gets wrong. */}
      <Card>
        <View className="gap-4">
          <FactRow
            icon={{ set: 'system', name: 'bell-active' }}
            title={t('onboarding:notifications.meals')}
          />
          <FactRow
            icon={{ set: 'system', name: 'camera' }}
            title={t('onboarding:notifications.scans')}
          />
          <FactRow
            icon={{ set: 'system', name: 'bell-off' }}
            title={t('onboarding:notifications.nothingElse')}
          />
        </View>
      </Card>

      <Text variant="meta" className="px-0.5 text-center">
        {t('onboarding:notifications.promise')}
      </Text>
    </OnboardingStep>
  )
}
