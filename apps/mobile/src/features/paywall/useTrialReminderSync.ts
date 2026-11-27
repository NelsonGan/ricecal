import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'

import { useSession, useStoreEntitlement } from '@/data'
import { datePattern } from '@/lib/dates'
import { onNotificationPermissionGranted } from '@/lib/notificationPermission'
import { bookTrialReminder } from '@/lib/notifications'
import { reminderLeadDays, trialReminderAt, trialToRemind } from './trial'

/**
 * Keeps the paywall's promise: a notification a few days before a free trial
 * becomes a charge. Booked from the receipt rather than at the purchase
 * button, so a reinstall, a second phone or a trial started on another device
 * all get it, and a cancelled trial takes it back.
 *
 * Checked again whenever the app comes to the front and whenever a
 * permission ask ends in a yes, which is how the reminder gets booked after
 * the welcome screen's prompt.
 *
 * Not cancelled on sign out, unlike the meal reminders, and only ever taken
 * back by the account that booked it: see `bookTrialReminder`.
 */
export function useTrialReminderSync(): void {
  const { t } = useTranslation('paywall')
  const { userId } = useSession()
  const { data: store } = useStoreEntitlement()
  const [checks, setChecks] = useState(0)

  useEffect(() => {
    const recheck = () => setChecks((n) => n + 1)
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck()
    })
    const stopListening = onNotificationPermissionGranted(recheck)
    return () => {
      listener.remove()
      stopListening()
    }
  }, [])

  const trial = trialToRemind(store)
  const start = trial?.start?.getTime()
  const end = trial?.end.getTime()

  // biome-ignore lint/correctness/useExhaustiveDependencies: `checks` is the re-check
  useEffect(() => {
    if (trial === undefined || !userId) return
    if (trial === null || end === undefined) {
      void bookTrialReminder(userId, null)
      return
    }
    const endsAt = new Date(end)
    // An unknown start reads as a long trial, which gets the full three days.
    const startedAt = new Date(start ?? 0)
    const at = trialReminderAt(startedAt, endsAt)
    void bookTrialReminder(
      userId,
      at
        ? {
            at,
            title: t('trialReminder.title', { count: reminderLeadDays(startedAt, endsAt) }),
            body: t('trialReminder.body', { date: format(endsAt, datePattern('dayMonthLong')) }),
          }
        : null,
    )
  }, [trial === undefined, trial === null, start, end, checks, userId, t])
}
