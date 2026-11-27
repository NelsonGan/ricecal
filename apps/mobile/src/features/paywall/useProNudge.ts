import { router } from 'expo-router'
import { useEffect, useRef } from 'react'

import { useEntitlement, useProfile, useSession, useStreak, useWeighIns } from '@/data'
import { openPaywall, proFeatureTitle, STREAK_MILESTONE_DAYS } from '@/data/refusals'
import { announcementHasTheFloor } from '@/features/news/useAnnouncementOffer'
import { tutorialOffered } from '@/features/tutorial'
import { track } from '@/lib/analytics'
import { useToast } from '@/ui'
import { type Milestone, markMilestone, markPaywallSeen, milestoneDue, paywallDue } from './nudge'

/**
 * How long Today gets to itself before the offer arrives. A paywall in the
 * first frame interrupts a task the app has not let the user start; a beat
 * later they have seen their diary, which is the paywall's best argument.
 *
 * Same number and same reasoning as the tutorial offer.
 */
const DELAY_MS = 1400

/**
 * The offer nobody asked for: a free account sees the paywall at most once
 * every two days, and the offer names a milestone when it has one.
 *
 * Two kinds, one clock. A milestone (a seven day logging streak, or a weigh-in
 * first reaching the goal weight) is offered once per account with a toast
 * naming it. Otherwise it is the standing offer, the paywall alone, whenever
 * the two-day clock is due. Every other route waits to be refused, so without
 * the standing offer a free account that never presses a gated button is never
 * told the app has a paid tier.
 *
 * For November 2026 the milestones ran alone, and the yearly plan fell with
 * the standing offer: in the last week of October it led to 15 yearly
 * checkouts, half the hard paywall's, while the milestones then led to one to
 * four a week. So it is back, and a milestone takes its place on the launch it
 * falls on.
 *
 * A screen rather than a toast, because this one has a price on it and a toast
 * cannot be decided from. It is dismissible and lands back on the diary. At
 * most one paywall every two days holds from every route (`paywallDue`): a
 * milestone reached inside that waits, and is offered on a later launch if it
 * still holds.
 *
 * It waits for the entitlement: `entitled` is false while the query is in
 * flight and false when offline with nothing cached, and either would show a
 * paywall to somebody who has paid.
 *
 * Mounted by Today so the offer belongs to the screen it appears over. The
 * streak is the query Today's own badge reads and the weigh-ins are the one
 * the widgets already keep, so this asks the server for nothing.
 */
export function useProNudge(): void {
  const toast = useToast()
  const { userId } = useSession()
  const { entitled, loading, unknown } = useEntitlement()
  // Booleans rather than the profile, so a refetch does not restart the delay.
  const { data: profile } = useProfile()
  const profileLoaded = profile !== undefined
  const targetKg = Number(profile?.target_weight_kg ?? 0)
  const announcing = userId ? announcementHasTheFloor(userId, profile) : false
  const streak = useStreak()
  const { data: weighIns, isPending: weighInsPending, isError: weighInsError } = useWeighIns()
  // Nothing until both milestones can be judged. The standing offer booked
  // first would spend the two-day clock a milestone was owed, and a failed read
  // is a zero streak or no weigh-ins that mean nothing.
  const milestonesKnown =
    !streak.isPending && !streak.isError && !weighInsPending && !(weighInsError && !weighIns)
  // Settled to the offer itself, so a refetch that changes nothing does not
  // restart the delay either.
  const offer: Milestone | 'nudge' | null =
    userId && milestonesKnown
      ? (milestoneDue(userId, {
          streakDays: streak.current,
          streakGoal: STREAK_MILESTONE_DAYS,
          weighIns,
          targetKg,
        }) ?? 'nudge')
      : null

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offered = useRef(false)
  const latestToast = useRef(toast)
  latestToast.current = toast

  useEffect(() => {
    if (!userId || !offer || offered.current || timer.current) return
    // All three mean we do not know yet, and showing a paywall to somebody who
    // has already paid is worse than never showing one.
    if (entitled || loading || unknown) return
    if (!paywallDue(userId)) return
    // Not on the launch the tour is offered on. Both are booked by Today at
    // about the same beat, so on a new free account the tour's toast landed
    // across the paywall's buy button. The tour belongs to a first launch; the
    // paywall has a two-day clock and loses nothing by waiting.
    if (!tutorialOffered(userId)) return
    // Nor while an announcement is due or up. Without the profile there is no
    // telling, and waiting costs nothing. One put up during the delay flips
    // `announcing`, which cancels this timer.
    if (!profileLoaded || announcing) return

    timer.current = setTimeout(() => {
      timer.current = null
      // A different paywall may have moved this account's clock during the wait.
      if (!paywallDue(userId)) return
      offered.current = true
      // Marked when shown rather than when answered, and here as well as by the
      // screen: a push dropped because the user was already navigating would
      // otherwise leave the clock unmoved and try again next launch.
      markPaywallSeen(userId)
      if (offer === 'nudge') {
        // No toast: there is no news to give, only the price.
        track('Paywall Shown', { screen: 'hard', trigger: 'nudge' })
        router.push('/paywall')
        return
      }
      markMilestone(userId, offer)
      openPaywall(latestToast.current, {
        title: proFeatureTitle(offer),
        tone: 'success',
        feature: offer,
      })
    }, DELAY_MS)

    // Eligibility and account changes cancel the old offer. Clearing the ref
    // also lets a newly eligible account book its own timer.
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [userId, offer, entitled, loading, unknown, profileLoaded, announcing])
}
