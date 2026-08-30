import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useSession, useUpdateMealTime } from '@/data'
import { FactRow, OnboardingStep } from '@/features/onboarding'
import { ensureNotificationPermission } from '@/lib/notifications'
import { Card, Icon, Text, useToast } from '@/ui'

/**
 * Enable notifications: the one ask that has to do something.
 *
 * Every `reminder_enabled` starts false in the signup trigger, because an app
 * that schedules notifications nobody asked for gets its permission revoked. So a
 * screen that only calls `ensureNotificationPermission` grants the OS permission
 * and schedules nothing, and granting here also turns the three meal reminders on.
 *
 * One button, saying "Continue": guideline 5.1.1(iv), the rule the health step is
 * shaped by. It used to read "Enable notifications" with a "Maybe later" beside
 * it, which breaks both halves at once.
 *
 * Nothing here can trap anybody, which is what makes losing the skip safe.
 * `ensureNotificationPermission` is entirely local, and `enable` calls `next()`
 * from a `finally`, so every outcome leaves by the same door.
 *
 * The rows are what will actually arrive, and the third is the one every other
 * tracker gets wrong: water and weigh-in nudges stay off until asked for.
 *
 * Nothing is scheduled from this screen. `useReminderSync` rewrites the whole
 * queue inside the tabs, and a second scheduler would race it.
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
   * The three writes, started but not waited on. Sequential rather than parallel,
   * because each carries an optimistic update over the same cache key, so three
   * in flight means three snapshots of three different "previous" states.
   *
   * Detached, because writes are `networkMode: 'online'`: with no signal
   * react-query pauses them and an awaited `mutateAsync` never settles, which
   * left the flow stopped dead on the last screen before the diary. The
   * optimistic update has already flipped the cache, and the paused writes land
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
