import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'

import { useEntitlement, useSession } from '@/data'
import { track } from '@/lib/analytics'
import { markPaywallSeen, paywallDue } from './nudge'

/**
 * How long Today gets to itself before the offer arrives.
 *
 * The app must not OPEN on a sales page. A user launching it is going somewhere
 * — usually to log what they are about to eat — and a paywall in the first
 * frame is the app interrupting a task it has not let them start. A beat later
 * they have seen their diary, which is also the best argument the paywall has.
 *
 * The same reasoning and the same number as the tutorial offer, which appears
 * on this screen for the same reason.
 */
const DELAY_MS = 1400

/**
 * The standing offer: a free account is shown the paywall at most once every
 * two days.
 *
 * THE ONE PLACE PRO IS OFFERED WITHOUT BEING ASKED FOR. Everything else in the
 * app waits to be refused — a fourth scan, a described meal, an older review —
 * and each of those only reaches somebody already pressing the button. A free
 * account that never presses one is never told the app has a paid tier at all,
 * which is the failure mode this exists for.
 *
 * WHY A SCREEN AND NOT A TOAST. The tutorial offer is a toast because it is a
 * question with a cheap answer ("want this explained?"). This one has a price
 * on it, and a toast that opens a paywall is two taps and a decision the user
 * cannot make from the toast. The screen is dismissible with a chevron and
 * lands back on the diary.
 *
 * IT WAITS FOR THE ANSWER rather than assuming one. `entitled` is false while
 * the subscription query is in flight and false when the app is offline with
 * nothing cached, and either would put a paywall in front of somebody who has
 * paid — on the day they paid, most memorably, since a cold launch resolves this
 * in milliseconds and a bad connection does not.
 *
 * Mounted by Today rather than by the tabs layout, so the offer belongs to the
 * screen it appears over. That is a statement about WHERE it is booked, not a
 * guarantee: a tab navigator keeps its screens mounted, so a timer booked here
 * survives a tab change. It is booked on MOUNT, which is the launch, and the
 * delay is 1.4 seconds — nobody has reached another tab by then, and the worst
 * case if they have is a dismissible page that lands back where they were. A
 * focus check would need a navigation dependency this app does not otherwise
 * carry, for a second and a half of exposure.
 */
export function useProNudge(): void {
  const router = useRouter()
  const { userId } = useSession()
  const { entitled, loading, unknown } = useEntitlement()

  /**
   * The pending timer, and whether the offer has already been made.
   *
   * REFS RATHER THAN A DEPENDENCY LIST, exactly as `useTutorialOffer` does it:
   * this effect reads values a re-render can hand back with new identities, and
   * the naive shape — cleanup clears the timer, a guard stops it being
   * rescheduled — drops the offer entirely if anything re-runs inside the delay.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offered = useRef(false)

  useEffect(() => {
    if (!userId || offered.current || timer.current) return
    // Not "not entitled": all three of these mean we do not know yet, and the
    // one thing worse than never showing a paywall is showing one to somebody
    // who has already paid.
    if (entitled || loading || unknown) return
    if (!paywallDue(userId)) return

    timer.current = setTimeout(() => {
      offered.current = true
      // Marked when it is SHOWN rather than when it is answered, and marked
      // here as well as by the screen itself: a router push that is dropped —
      // because the user was already navigating — would otherwise leave the
      // clock unmoved and try again on the next launch.
      markPaywallSeen(userId)
      track('Paywall Shown', { screen: 'hard', trigger: 'nudge' })
      router.push('/paywall')
    }, DELAY_MS)
  }, [userId, entitled, loading, unknown, router])

  // Unmount only. A pending timer holding a navigation after this screen has
  // gone would push the paywall over whatever replaced it. Nulled as well as
  // cleared, so a mount torn down and rebuilt on the same fiber — Fast Refresh,
  // StrictMode — books a new one rather than seeing a spent handle.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    },
    [],
  )
}
