import { type Href, type NativeStackNavigationProp, useNavigation, useRouter } from 'expo-router'
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
 * This has to be one root reset rather than `dismissAll` followed by `replace`.
 * Expo Router queues both calls, and the pop-to-top can finish after the
 * replacement. At the end of onboarding that put Today on the stack and then
 * popped it straight back off, revealing the target question under the
 * paywall. One reset has no intermediate history for another action to expose.
 *
 * Since SDK 58 the router ignores a partial reset ("RESET … was not handled by
 * any navigator"), so signing in left the user on a spinner. It wants a
 * complete state: the root stack's own key, route names and key sequence, with
 * `stale: false`. Only those are copied, not the whole state, so nothing that
 * names the routes being dropped (the stack's `history`) comes along. The new
 * route may go without a key; the router mints one.
 */
export function useEnterApp(): () => void {
  const navigation = useNavigation<NativeStackNavigationProp<{ '(tabs)': undefined }>>('/')

  return useCallback(() => {
    const root = navigation.getState()
    navigation.reset({
      key: root.key,
      type: root.type,
      routeNames: root.routeNames,
      routeKeySeq: root.routeKeySeq,
      index: 0,
      routes: [{ name: '(tabs)' }],
      stale: false,
    } as typeof root)
  }, [navigation])
}

/** What `showTabUnder` reads of a navigator, so it takes any screen's `navigation`. */
type NavigatorLike = {
  getState():
    | {
        routes: {
          name: string
          state?: { key?: string; index?: number; routes: { name: string }[] }
        }[]
      }
    | undefined
  getParent(): NavigatorLike | undefined
  dispatch(action: { type: string; payload: { name: string }; target: string }): void
}

/**
 * Switch the tab bar to `tab` without leaving the screen on top of it.
 *
 * For a screen pushed over the tabs from outside them (a notification), so
 * that its back lands where it belongs. `navigate('/groups')` first and then
 * the push drew three screens in a row; this changes the tab underneath once
 * the push is over, where nobody sees it. A jump aimed at the tab navigator
 * itself, since navigating to the tab would pop everything above it.
 */
export function showTabUnder(navigation: NavigatorLike, tab: string): void {
  for (let nav: NavigatorLike | undefined = navigation; nav; nav = nav.getParent()) {
    const tabs = nav.getState()?.routes.find((route) => route.name === '(tabs)')?.state
    if (!tabs) continue
    if (tabs.key && tabs.routes[tabs.index ?? 0]?.name !== tab) {
      nav.dispatch({ type: 'JUMP_TO', payload: { name: tab }, target: tabs.key })
    }
    return
  }
}
