import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
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
  const router = useRouter()
  const message = useAuthMessage()

  // Every URL is handled once. `useURL` holds its value, so a re-render for any
  // other reason would otherwise redeem the same link again — and a PKCE code is
  // spent on first use, so the second attempt fails and reports an error about a
  // sign-in that actually worked.
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!url || handled.current === url) return
    handled.current = url

    completeLoginFromUrl(url)
      .then((outcome) => {
        // A RESET LINK IS NOT A SIGN-IN, even though it produces a session. It
        // is the middle of choosing a new password, and left to the ordinary
        // guard it lands the user on Today with the password they could not
        // remember still in force. `replace`, because there is nothing behind a
        // link opened cold to go back to.
        if (outcome === 'recovery') router.replace('/(auth)/new-password')
      })
      .catch((error: unknown) => {
        toast.show({ title: message(error), tone: 'error' })
      })
  }, [url, toast, router, message])

  return null
}
