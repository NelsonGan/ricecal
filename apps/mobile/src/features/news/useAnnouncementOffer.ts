import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { claimAnnouncement, useProfile, useSession } from '@/data'
import { keys } from '@/data/keys'
import { tutorialOffered } from '@/features/tutorial/prompt'
import { reportError } from '@/lib/errors'
import { type Announcement, announcementToShow } from './announcements'

/**
 * How long Today gets to itself first, for the reason the tutorial offer gives.
 * Ahead of the Pro nudge's 1.4 s, which stands aside for it.
 */
const DELAY_MS = 1200

/**
 * The account this launch has put an announcement up for, so the Pro nudge,
 * booked by the same screen at nearly the same beat, does not push a paywall
 * over it. Module state, because it is a fact about this run of the app; keyed
 * by account so signing into another one without a restart does not silence
 * that account's offer too.
 */
let claimedFor: string | null = null

/**
 * Whether an announcement has the floor this launch: one is due on the profile
 * as cached, or one has already been put up. The Pro nudge asks before booking
 * and again before firing. An announcement is once per account and the nudge
 * has a two-day clock, so the nudge is the one that waits.
 */
export function announcementHasTheFloor(
  userId: string,
  seen: readonly string[] | undefined,
): boolean {
  return claimedFor === userId || announcementToShow(seen) !== null
}

/** Whether this launch has started putting an announcement up for this account. */
export function announcementClaimedThisLaunch(userId: string): boolean {
  return claimedFor === userId
}

/**
 * Puts the newest announcement up over Today, once per account.
 *
 * The rules, and where each one lives:
 *
 * - Once: claimed on the server (`claimAnnouncement`) before the card is
 *   drawn, so a reinstall or a second phone does not show it again, and
 *   whatever it switches on is switched on in the same write as "seen".
 * - Only the newest: `announcementToShow`.
 * - Not for new accounts: onboarding writes every current id as seen.
 * - Not on a first launch: the tutorial toast has that one, as it does over
 *   the Pro nudge, and a toast under a modal is a toast nobody sees.
 * - Online only. A card that says auto post was switched on cannot be shown
 *   over a write that never landed; it waits for a launch that can make it.
 * - Only while Today is on top. A modal put up over the log sheet or a pushed
 *   page stacks on a native modal, which iOS can refuse to present, and the
 *   claim would already be spent. Leaving Today cancels the wait; coming back
 *   books it again.
 *
 * Mounted by Today rather than the tabs layout, like the other launch offers,
 * so it belongs to the screen it appears over.
 */
export function useAnnouncementOffer(): { announcement: Announcement | null; close: () => void } {
  const queryClient = useQueryClient()
  const { userId } = useSession()
  const { data: profile } = useProfile()
  const focused = useIsFocused()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const started = useRef(false)

  const due = profile?.onboarded_at ? announcementToShow(profile.seen_announcements) : null

  useEffect(() => {
    if (!userId || !due || !focused || started.current || timer.current) return
    if (!tutorialOffered(userId)) return

    timer.current = setTimeout(() => {
      timer.current = null
      if (!onlineManager.isOnline()) return
      started.current = true
      claimedFor = userId
      claimAnnouncement(userId, due.id, due.enables)
        .then((updated) => {
          if (!updated) return
          queryClient.setQueryData(keys.profile(userId), updated)
          setAnnouncement(due)
        })
        .catch((error: unknown) => {
          // Unclaimed, so the next launch tries again. The nudge has already
          // stood aside for this one, which costs nothing.
          started.current = false
          reportError(error, { scope: 'announcement_claim', announcement: due.id })
        })
    }, DELAY_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [userId, due, focused, queryClient])

  const close = useCallback(() => setAnnouncement(null), [])
  return { announcement, close }
}

/** For tests: forget that this launch showed anything. */
export function resetAnnouncementLaunchForTest(): void {
  claimedFor = null
}
