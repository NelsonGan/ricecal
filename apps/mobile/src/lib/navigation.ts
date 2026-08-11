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
 * `dismiss`, NOT `back`, and the difference is the whole point. `back()` sends
 * GO_BACK, which every navigator in the focused chain gets a chance to claim —
 * so once the stack is empty the TAB navigator answers it, and answering it
 * means changing tab. Worse, `canGoBack()` asks the same chain, so it says yes
 * on a tab with nothing pushed and the `fallback` below never runs: a dismissal
 * that should have landed on the screen this one names walked to a tab instead.
 *
 * Which tab is the part nobody would guess. Expo Router sorts the screens of a
 * navigator by the LENGTH of their route names, and the tab router's default
 * back behaviour is "go to the first route" — so `me`, at two characters, is
 * the first tab as far as the router is concerned, and every stray GO_BACK in
 * the app landed on the profile. `unstable_settings` in `(tabs)/_layout.tsx`
 * now pins that order, and this pops rather than going back, so a dismissal
 * that arrives twice cannot reach the tabs at all: POP is a stack's action and
 * nothing else handles it.
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
