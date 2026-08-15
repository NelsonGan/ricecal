import * as Linking from 'expo-linking'
import { useEffect, useRef } from 'react'

import { completeLoginFromUrl } from '@/data/auth'
import { useToast } from '@/ui'
import { useAuthMessage } from './useAuthMessage'

/**
 * Watches for the login link coming back into the app.
 *
 * Renders nothing; it is here for the side effect. A link can land at any moment
 * — the app cold-starting from the mail, or coming forward from the background
 * while the user is looking at any screen at all — so listening has to happen
 * above the navigator rather than on the screen that sent the mail. There is not
 * necessarily a screen: the mail may well be opened days later.
 *
 * It has to sit under `ToastProvider`, because the one thing it has to be able to
 * do is say that a link had expired. `SessionProvider` is above the toast, which
 * is why this is not folded into it — and it does not need to be, since
 * `onAuthStateChange` picks the new session up on its own.
 */
export function LoginLinkHandler() {
  // `useLinkingURL`, not the deprecated `useURL`: it returns the initial URL
  // immediately on reload, which is the cold-start-from-the-mail case and the
  // most common way a login link arrives.
  const url = Linking.useLinkingURL()
  const toast = useToast()
  const message = useAuthMessage()

  // Every URL is handled once. `useURL` holds its value, so a re-render for any
  // other reason would otherwise redeem the same link again — and a PKCE code is
  // spent on first use, so the second attempt fails and reports an error about a
  // sign-in that actually worked.
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!url || handled.current === url) return
    handled.current = url

    /**
     * REDEEMS THE LINK AND NAVIGATES NOWHERE, deliberately.
     *
     * This component renders outside the navigator — it has to, because a link
     * can arrive with no screen on screen — so an imperative navigation from
     * here races the root layout on a cold start from the mail, which is
     * expo-router's "attempted to navigate before mounting the Root Layout".
     * Where each kind of link belongs is decided by the route it lands on
     * (`app/auth/[action].tsx`), which by definition cannot run before the
     * navigator exists.
     */
    completeLoginFromUrl(url).catch((error: unknown) => {
      toast.show({ title: message(error), tone: 'error' })
    })
  }, [url, toast, message])

  return null
}
