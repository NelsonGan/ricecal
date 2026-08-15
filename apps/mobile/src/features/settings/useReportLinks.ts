import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect } from 'react'

import { track } from '@/lib/analytics'

/**
 * Where a report notification goes when it is tapped.
 *
 * `week-latest` rather than a date, because the notification is scheduled weeks
 * before the Monday it fires on and cannot know which week it will be about.
 * The story screen resolves it against the list — see `LATEST` in
 * `features/reviews/period.ts`.
 */
const ROUTE = {
  weekly: '/reviews/week-latest',
  monthly: '/reviews/month-latest',
} as const

type ReportKind = keyof typeof ROUTE

const isReport = (kind: unknown): kind is ReportKind => kind === 'weekly' || kind === 'monthly'

/**
 * Opens the review a report notification is about.
 *
 * TWO WAYS IN, and missing either one loses half the taps.
 * `getLastNotificationResponseAsync` covers the notification that LAUNCHED the
 * app — the app was not running, so no listener existed when the tap happened —
 * and the listener covers every tap after that. A cold launch is the common case
 * for a notification that fires at nine in the morning.
 *
 * Navigation rather than a param on some screen: the reminders are local and
 * fire whether or not anything is mounted, so the only thing that can act on one
 * is a hook living where the router already is.
 */
export function useReportLinks(): void {
  useEffect(() => {
    let alive = true

    const open = (response: Notifications.NotificationResponse | null) => {
      const kind = response?.notification.request.content.data?.kind
      if (!alive || !isReport(kind)) return
      // The weekly and monthly reports are the app's only unprompted way back
      // in — meal reminders say something and go, and there is no push at all —
      // so whether anybody taps them is the whole question about them.
      track('Notification Opened', { kind })
      router.push(ROUTE[kind])
    }

    /**
     * The tap that LAUNCHED the app, and then forgotten.
     *
     * It is delivered every time it is asked for rather than once, so without
     * the clear a second mount answers it again and navigates over whatever the
     * user had opened in between — a Fast Refresh does that, and so does signing
     * out and back in. Clearing is the OS's own answer to it; the alternative
     * was a flag in this module, which is a claim about the app run that only
     * this file would know to honour.
     */
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) Notifications.clearLastNotificationResponse()
      open(response)
    })

    const listener = Notifications.addNotificationResponseReceivedListener(open)
    return () => {
      alive = false
      listener.remove()
    }
  }, [])
}
