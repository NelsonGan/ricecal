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

/** Back if there is a history, otherwise to `fallback`. */
export function useBack(fallback: Href): () => void {
  const router = useRouter()

  return useCallback(() => {
    if (router.canGoBack()) {
      router.back()
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
