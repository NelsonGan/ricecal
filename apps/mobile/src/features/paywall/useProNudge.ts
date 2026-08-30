import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'

import { useEntitlement, useSession } from '@/data'
import { tutorialOffered } from '@/features/tutorial'
import { track } from '@/lib/analytics'
import { markPaywallSeen, paywallDue } from './nudge'

/**
 * How long Today gets to itself before the offer arrives. A paywall in the
 * first frame interrupts a task the app has not let the user start; a beat
 * later they have seen their diary, which is the paywall's best argument.
 *
 * Same number and same reasoning as the tutorial offer.
 */
const DELAY_MS = 1400

/**
 * The standing offer: a free account sees the paywall at most once every two
 * days.
 *
 * The only place Pro is offered without being asked for. Every other route
 * waits to be refused, so a free account that never presses a gated button is
 * never told the app has a paid tier at all.
 *
 * A screen rather than a toast, because this one has a price on it and a toast
 * cannot be decided from. It is dismissible and lands back on the diary.
 *
 * It waits for the entitlement: `entitled` is false while the query is in
 * flight and false when offline with nothing cached, and either would show a
 * paywall to somebody who has paid.
 *
 * Mounted by Today so the offer belongs to the screen it appears over. A tab
 * navigator keeps its screens mounted, so this is about where the timer is
 * booked rather than a guarantee about where it fires; 1.4 seconds is short
 * enough that nobody has changed tab, and the worst case is a dismissible page.
 */
export function useProNudge(): void {
  const router = useRouter()
  const { userId } = useSession()
  const { entitled, loading, unknown } = useEntitlement()

  /**
   * Refs rather than a dependency list, as `useTutorialOffer` does it. The
   * naive shape — cleanup clears the timer, a guard stops it being rescheduled
   * — drops the offer entirely if anything re-renders inside the delay.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offered = useRef(false)

  useEffect(() => {
    if (!userId || offered.current || timer.current) return
    // All three mean we do not know yet, and showing a paywall to somebody who
    // has already paid is worse than never showing one.
    if (entitled || loading || unknown) return
    if (!paywallDue(userId)) return
    // Not on the launch the tour is offered on. Both are booked by Today at
    // about the same beat, so on a new free account the tour's toast landed
    // across the paywall's buy button. The tour belongs to a first launch; the
    // paywall has a two-day clock and loses nothing by waiting.
    if (!tutorialOffered(userId)) return

    timer.current = setTimeout(() => {
      offered.current = true
      // Marked when shown rather than when answered, and here as well as by the
      // screen: a push dropped because the user was already navigating would
      // otherwise leave the clock unmoved and try again next launch.
      markPaywallSeen(userId)
      track('Paywall Shown', { screen: 'hard', trigger: 'nudge' })
      router.push('/paywall')
    }, DELAY_MS)
  }, [userId, entitled, loading, unknown, router])

  // Unmount only. A pending timer would push the paywall over whatever replaced
  // this screen. Nulled as well as cleared, so a mount torn down and rebuilt on
  // the same fiber books a new timer rather than seeing a spent handle.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    },
    [],
  )
}
