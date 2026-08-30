import { type Href, useRouter } from 'expo-router'
import { useCallback } from 'react'

/**
 * Navigation helpers that survive an empty history.
 *
 * `router.back()` only works when something pushed the current screen. Three
 * routes into this app do not: a deep link (`ricecal://settings/goals`), a
 * `replace` that dropped the history behind it, and the first screen after
 * onboarding. Calling `back()` there logs "The action 'GO_BACK' was not handled
 * by any navigator" and leaves the user stuck on a screen whose back button
 * does nothing.
 *
 * So every dismissal names where it goes when there is no history. The
 * fallback is the screen that would have been underneath — the parent in the
 * information hierarchy, not a guess.
 */

/**
 * Pop the stack if something is on it, otherwise go to `fallback`.
 *
 * `dismiss`, not `back`. GO_BACK is offered to every navigator in the focused
 * chain, so on an empty stack the tab navigator answers it by changing tab, and
 * `canGoBack()` says yes for the same reason, so `fallback` never runs.
 *
 * Which tab it walked to was the surprise: Expo Router sorts a navigator's
 * screens by the length of their route names and the tab router goes to the
 * first, so `me` won and every stray GO_BACK landed on the profile.
 * `unstable_settings` in `(tabs)/_layout.tsx` now pins that order, and POP is a
 * stack's action that nothing else handles.
 */
export function useBack(fallback: Href): () => void {
  const router = useRouter()

  return useCallback(() => {
    if (router.canDismiss()) {
      router.dismiss()
      return
    }
    router.replace(fallback)
  }, [router, fallback])
}

/**
 * Close every stacked modal and land on `fallback`.
 *
 * What the logging flow needs at the end: the picker, the camera and the food
 * detail can be two or three modals deep, and the user should come back to the
 * day, not to the sheet they opened three steps ago.
 *
 * `dismissAll` throws the same GO_BACK complaint when nothing is presented, so
 * the guard is not optional — the camera is reachable by deep link with no
 * modal stack at all.
 */
export function useDismissTo(fallback: Href): () => void {
  const router = useRouter()

  return useCallback(() => {
    if (router.canDismiss()) {
      router.dismissAll()
      // `dismissAll` unwinds the modals but leaves whichever tab was showing.
      // Navigating after it puts the user on the one this flow belongs to.
      router.navigate(fallback)
      return
    }
    router.replace(fallback)
  }, [router, fallback])
}

/**
 * Land on the app, with nothing left behind it.
 *
 * A `replace` alone swaps one entry and leaves whatever it was standing on, so
 * the way in stays under the app for the rest of the session. Every route in
 * crosses the welcome screen or the questions, so Today came up standing on
 * "Get started" with a live session: a stray pop put a signed-in person on the
 * sign-up screen, where "Get started" walked them back into onboarding they had
 * already finished.
 *
 * `dismissAll` unwinds to the bottom of the root stack, `replace` takes that
 * last entry's place. Both queue in one flush, so no frame of the welcome
 * screen shows in between. The guard is not optional: `dismissAll` throws when
 * there is nothing to unwind, which is the ordinary cold launch.
 */
export function useEnterApp(): (href?: Href) => void {
  const router = useRouter()

  return useCallback(
    (href: Href = '/today') => {
      if (router.canDismiss()) router.dismissAll()
      router.replace(href)
    },
    [router],
  )
}
