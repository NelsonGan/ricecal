import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useSession } from '@/data'
import { useToast } from '@/ui'
import { markTutorialOffered, tutorialOffered } from './prompt'

/**
 * How long Today gets to itself before the offer arrives.
 *
 * A toast in the same frame as the first paint is part of the launch rather
 * than an offer: the user is still reading the screen it is covering. Long
 * enough to be a second thing that happens, short enough to be seen.
 */
const DELAY_MS = 1200

/** Longer than the usual six seconds. This one asks a question. */
const DURATION_MS = 12000

/**
 * Offers the tour, once per account, on Today.
 *
 * Declining is silence: the toast dismisses itself and never returns. That is
 * only acceptable because Me carries a permanent row to the same screen, which
 * is the answer for somebody who looked away and then wanted it.
 *
 * Mounted by Today rather than by the tabs layout, because the toast is about
 * the screen it appears over.
 */
export function useTutorialOffer(): void {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const { userId } = useSession()

  /**
   * The pending timer, and whether the offer has already been made.
   *
   * Refs rather than a dependency list, because this effect reads four values a
   * re-render could hand back with a new identity. In the naive shape, where the
   * cleanup clears the timer and a guard stops it being rescheduled, anything
   * re-running inside the delay drops the toast entirely: never shown and never
   * marked, which reads as the feature not existing until the next cold start.
   *
   * So the timer is booked once, survives every re-run, and is cleared only on
   * unmount. The callback closes over a `t` and a `router` from one render, which
   * over 1.2 seconds cannot differ in any way that matters.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offered = useRef(false)

  useEffect(() => {
    if (!userId || offered.current || timer.current) return
    if (tutorialOffered(userId)) return

    timer.current = setTimeout(() => {
      offered.current = true
      markTutorialOffered(userId)
      toast.show({
        title: t('onboarding:tutorial.offerTitle'),
        description: t('onboarding:tutorial.offerBody'),
        icon: { set: 'system', name: 'lightbulb' },
        duration: DURATION_MS,
        action: {
          label: t('onboarding:tutorial.offerAction'),
          onPress: () => router.push('/tutorial'),
        },
      })
    }, DELAY_MS)
  }, [userId, toast, router, t])

  // Unmount only. A pending timer holding a `toast.show` after this screen has
  // gone would fire the offer over whatever replaced it. Nulled as well as
  // cleared, so a mount that is torn down and rebuilt on the same fiber — which
  // is what Fast Refresh and StrictMode both do — books a new one rather than
  // seeing a spent handle and deciding the offer was already scheduled.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    },
    [],
  )
}
