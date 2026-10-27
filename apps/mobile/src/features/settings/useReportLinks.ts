import * as Notifications from 'expo-notifications'
import { router, useNavigationContainerRef } from 'expo-router'
import { useEffect } from 'react'

import { useSession } from '@/data/session'
import { setOpenGroup } from '@/features/groups/store'
import { openLogger } from '@/features/workouts/loggerOpen'
import { getActiveWorkout } from '@/features/workouts/store'
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
 * Two ways in, and missing either loses half the taps.
 * `getLastNotificationResponseAsync` covers the notification that launched the
 * app, where no listener existed when the tap happened, and the listener covers
 * every tap after that. A cold launch is the common case for a notification that
 * fires at nine in the morning.
 *
 * Navigation rather than a param on some screen: the reminders are local and fire
 * whether or not anything is mounted, so the only thing that can act on one is a
 * hook living where the router already is.
 */
export function useReportLinks(): void {
  const { userId } = useSession()
  // Asked where the app is when a notification is tapped, rather than
  // subscribed to it: following every navigation would redraw the tab bar's
  // whole layout, which this hook lives in.
  const navigation = useNavigationContainerRef()
  useEffect(() => {
    let alive = true

    const open = (response: Notifications.NotificationResponse | null) => {
      const kind = response?.notification.request.content.data?.kind
      if (!alive) return
      // A running workout's notices open its logger, and a training-day
      // reminder the Workouts page. Not counted: they are the workout
      // talking, not a way back into the app. A notice can outlive its
      // workout in Notification Center, so with none running it lands on the
      // page rather than on an empty logger.
      //
      // Back to a logger that is already open, wherever it is in the stack:
      // with the library or an exercise's page on top of it, `navigate` pushed
      // a second logger.
      if (kind === 'rest' || kind === 'workout' || kind === 'started') {
        if (!userId || !getActiveWorkout(userId)) router.navigate('/workouts')
        else openLogger(router)
        return
      }
      if (kind === 'workout-reminder') {
        router.push('/workouts')
        return
      }
      // A nudge, an invite or a chat message from a group, the pushes that come
      // from a server. It opens the Groups tab on that group's board, or on the
      // list for an invite, which waits behind the envelope there. A message
      // opens the group's thread over the board, so going back lands on the
      // board, with the keyboard up: a tapped message is one to answer.
      if (kind === 'group') {
        const data = response?.notification.request.content.data
        const groupId = typeof data?.groupId === 'string' ? data.groupId : null
        const day = typeof data?.day === 'string' ? data.day : undefined
        if (userId && groupId && !data?.invite) setOpenGroup(userId, groupId, day)
        if (userId && data?.invite) setOpenGroup(userId, null)
        track('Notification Opened', {
          kind: data?.invite ? 'group_invite' : data?.chat ? 'group_message' : 'group_nudge',
        })
        // A message opens its thread in one push over whatever is showing; the
        // chat puts the Groups tab under itself once it has slid in. Switching
        // to Groups first popped anything open, drew the board, and then
        // pushed the chat over it, three transitions for one tap. The thread
        // already open is left as it is, and another group's is swapped.
        if (data?.chat && groupId) {
          const chat = { pathname: '/group/chat', params: { id: groupId, reply: '1' } } as const
          const route = (navigation.isReady() ? navigation.getCurrentRoute() : undefined) as
            | { name: string; params?: { id?: string } }
            | undefined
          const showing = route?.name === 'chat' ? route.params?.id : undefined
          if (!showing) router.push(chat)
          else if (showing !== groupId) router.replace(chat)
          return
        }
        router.navigate('/groups')
        return
      }
      if (!isReport(kind)) return
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
  }, [userId, navigation])
}
