import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useProfile, useSession } from '@/data'
import { keys } from '@/data/keys'
import { fetchProfile } from '@/data/profile'
import { tutorialOffered } from '@/features/tutorial/prompt'
import { type Announcement, announcementDue } from './announcements'

/**
 * How long Today gets to itself first, for the reason the tutorial offer gives.
 * Ahead of the Pro nudge's 1.4 s, which stands aside for it.
 */
const DELAY_MS = 1200

/** Long enough to reuse the read this launch has just made. */
const FRESH_MS = 30_000

/**
 * The account this run of the app has put a card up for. The Pro nudge, booked
 * by the same screen at nearly the same beat, does not push a paywall over it,
 * and the card is not put up twice. Keyed by account, so signing into another
 * one without a restart does not silence that account's offer too.
 */
let shownFor: string | null = null

/**
 * Whether the tour had already been offered when this run of the app first
 * asked, per account. Read once rather than live: the tour's toast marks itself
 * offered 1.2 s into a first launch, and a live read would then let the card
 * cover that toast on the same launch, a tab switch later.
 */
const tourBefore = new Map<string, boolean>()

function tourOfferedBeforeThisRun(userId: string): boolean {
  let offered = tourBefore.get(userId)
  if (offered === undefined) {
    offered = tutorialOffered(userId)
    tourBefore.set(userId, offered)
  }
  return offered
}

/**
 * Whether an announcement has the floor this run: one is due, or one has been
 * put up. The Pro nudge asks before booking. An announcement is once per
 * account and the nudge has a two-day clock, so the nudge is the one that
 * waits, until the app is next started.
 */
export function announcementHasTheFloor(
  userId: string,
  profile: Parameters<typeof announcementDue>[0],
): boolean {
  return shownFor === userId || announcementDue(profile) !== null
}

/**
 * Puts the newest announcement up over Today, once per account.
 *
 * The rules, and where each one lives:
 *
 * - Once: the card marks itself seen on the server the moment it is on screen
 *   (`AnnouncementCard`, `onShow`), applying what it enables in the same
 *   statement. Nothing is written before then, so a card iOS refuses to
 *   present (over another modal) or a request that never returns cannot
 *   switch a setting on behind a card nobody saw.
 * - Only the newest, and never for a new account: `announcementDue`, and
 *   onboarding marking every current id seen.
 * - Not on a launch the tour is offered on, a toast under a modal being a
 *   toast nobody sees.
 * - Online, with a fresh read: a card another phone has already shown is not
 *   shown again from a cached profile.
 * - Only while Today is on top. Leaving it cancels the wait, and focus is
 *   asked again after the read.
 *
 * Mounted by Today rather than the tabs layout, like the other launch offers,
 * so it belongs to the screen it appears over.
 */
export function useAnnouncementOffer(): { announcement: Announcement | null; close: () => void } {
  const queryClient = useQueryClient()
  const { userId } = useSession()
  const { data: profile } = useProfile()
  const focused = useIsFocused()
  const focusedNow = useRef(focused)
  focusedNow.current = focused
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  const due = announcementDue(profile)
  const tourDone = userId ? tourOfferedBeforeThisRun(userId) : false

  useEffect(() => {
    if (!userId || !due || !focused || !tourDone || shownFor === userId) return
    let cancelled = false

    const timer = setTimeout(async () => {
      if (!onlineManager.isOnline()) return
      let fresh: Awaited<ReturnType<typeof fetchProfile>>
      try {
        fresh = await queryClient.fetchQuery({
          queryKey: keys.profile(userId),
          queryFn: () => fetchProfile(userId),
          staleTime: FRESH_MS,
        })
      } catch {
        return
      }
      if (cancelled || !focusedNow.current || shownFor === userId) return
      if (announcementDue(fresh)?.id !== due.id) return
      shownFor = userId
      setAnnouncement(due)
    }, DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [userId, due, focused, tourDone, queryClient])

  const close = useCallback(() => setAnnouncement(null), [])
  return { announcement, close }
}

/** For tests: forget what this run of the app has shown and read. */
export function resetAnnouncementRunForTest(): void {
  shownFor = null
  tourBefore.clear()
}
