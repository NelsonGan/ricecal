import * as Notifications from 'expo-notifications'
import { router, useNavigationContainerRef } from 'expo-router'
import { useEffect } from 'react'

import { useSession } from '@/data/session'
import { isGroupsPageOnTop, setOpenGroup } from '@/features/groups/store'
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
      // from a server. A nudge opens that group's board on the day it was
      // about, and an invite the Groups page with its invites open. A message
      // opens the group's thread, so going back lands on the group's card on
      // Social, with the keyboard up: a tapped message is one to answer.
      if (kind === 'group') {
        const data = response?.notification.request.content.data
        const groupId = typeof data?.groupId === 'string' ? data.groupId : null
        const day = typeof data?.day === 'string' ? data.day : undefined
        // Chosen on Social too, so back from the board or the chat lands on it.
        if (userId && groupId && !data?.invite) setOpenGroup(userId, groupId, day)
        track('Notification Opened', {
          kind: data?.invite ? 'group_invite' : data?.chat ? 'group_message' : 'group_nudge',
        })
        // The invites, on the Groups page already open if it is the one on
        // top, so two taps in a row do not stack two pages.
        if (data?.invite) {
          if (isGroupsPageOnTop()) router.setParams({ invites: '1' })
          else router.push({ pathname: '/group', params: { invites: '1' } })
          return
        }
        if (!groupId) return
        // The thread or the board opens in one push over whatever is showing,
        // and puts Social under itself once it has slid in. Switching tabs
        // first popped anything open, drew the tab, and then pushed over it,
        // three transitions for one tap. The same screen already open for this
        // group is left as it is (a board takes the new day from the store),
        // and another group's is swapped.
        const screen = data?.chat
          ? ({ pathname: '/group/chat', params: { id: groupId, reply: '1' } } as const)
          : ({ pathname: '/group/board', params: { id: groupId } } as const)
        const route = (navigation.isReady() ? navigation.getCurrentRoute() : undefined) as
          | { name: string; params?: { id?: string } }
          | undefined
        const name = data?.chat ? 'chat' : 'board'
        const showing = route?.name === name ? route.params?.id : undefined
        if (!showing) router.push(screen)
        else if (showing !== groupId) router.replace(screen)
        return
      }
      // The warning before a free account's meal photos are swept, from the
      // jobs Worker. An older app has no such kind and ignores the tap.
      if (kind === 'photos') {
        track('Notification Opened', { kind: 'photo_removals' })
        router.push('/settings/photos')
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
