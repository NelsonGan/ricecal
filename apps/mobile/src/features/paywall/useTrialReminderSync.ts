import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'

import { useStoreEntitlement, useSubscription } from '@/data'
import { datePattern } from '@/lib/dates'
import { bookTrialReminder } from '@/lib/notifications'
import { reminderLeadDays, trialReminderAt, trialToRemind } from './trial'

/**
 * Keeps the paywall's promise: a notification a few days before a free trial
 * becomes a charge. Booked from the receipt rather than at the purchase
 * button, so a reinstall, a second phone or a trial started on another device
 * all get it, and a cancelled trial takes it back.
 *
 * Checked again whenever the app comes to the front, which is also how the
 * reminder gets booked after the welcome screen's permission prompt: the
 * system sheet takes the app out of the foreground and hands it back.
 *
 * Not cancelled on sign out, unlike the meal reminders: see `bookTrialReminder`.
 */
export function useTrialReminderSync(): void {
  const { t } = useTranslation('paywall')
  const { data: store } = useStoreEntitlement()
  const { data: subscription } = useSubscription()
  const [foregrounds, setForegrounds] = useState(0)

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1)
    })
    return () => listener.remove()
  }, [])

  const trial = trialToRemind(store, subscription)
  const start = trial?.start?.getTime()
  const end = trial?.end.getTime()

  // biome-ignore lint/correctness/useExhaustiveDependencies: `foregrounds` is the re-check
  useEffect(() => {
    if (trial === undefined) return
    if (trial === null || end === undefined) {
      void bookTrialReminder(null)
      return
    }
    const endsAt = new Date(end)
    // An unknown start reads as a long trial, which gets the full three days.
    const startedAt = new Date(start ?? 0)
    const at = trialReminderAt(startedAt, endsAt)
    void bookTrialReminder(
      at
        ? {
            at,
            title: t('trialReminder.title', { count: reminderLeadDays(startedAt, endsAt) }),
            body: t('trialReminder.body', { date: format(endsAt, datePattern('dayMonthLong')) }),
          }
        : null,
    )
  }, [trial === undefined, trial === null, start, end, foregrounds, t])
}
