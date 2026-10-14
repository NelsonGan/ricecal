import { Redirect, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { useSession } from '@/data'
import { isFreshRecovery } from '@/data/recovery'
import { Spinner } from '@/ui'

/**
 * Where a link in an email lands.
 *
 * `ricecal://auth/callback` and `ricecal://auth/reset` are paths, and the router
 * matches paths against files. There was no file, so tapping the button in a
 * login mail opened the app on "Page not found" while `LoginLinkHandler` was
 * signing the person in perfectly well behind it.
 *
 * So this exists to be matched. It redeems nothing: the URL is handled above the
 * navigator, because a link can arrive when there is not necessarily a screen.
 * All this does is wait for the session that handler is fetching, then send the
 * person where the link meant them to go.
 *
 * The recovery redirect lives here rather than in `LoginLinkHandler`, which
 * renders outside the navigator: an imperative `router.replace` from there races
 * the root layout on a cold start from the mail. A `<Redirect>` in a route cannot
 * happen before the route is mounted.
 *
 * `[action]` rather than two files because the two differ only in where they go.
 */
export default function AuthLanding() {
  const { action } = useLocalSearchParams<{ action?: string }>()
  const { session, loading } = useSession()

  /**
   * The dead-link case, which has no signal of its own.
   *
   * An expired or already-used link produces a toast and no session, and
   * without this the app sits on a spinner for ever under a message about
   * something having gone wrong. Long enough that a slow exchange is not cut
   * off, short enough that nobody is left looking at it.
   */
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  // `/` rather than `/today`: index is the one place that knows whether this
  // person has finished onboarding, and a dead link belongs back at welcome.
  if (waited) return <Redirect href="/" />

  /*
   * A reset waits for the session the link produces, not merely for a session.
   * A phone already signed in has one before the exchange finishes, and acting
   * on it sent a real reset link to Today. Without a recovery session it never
   * goes to `new-password` at all: a signed-in phone could open
   * `ricecal://auth/reset` with no code and be handed a form that sets a
   * password unasked (see `isFreshRecovery`). Nothing arriving means the timer
   * above sends it to `/`.
   */
  if (action === 'reset') {
    if (!loading && isFreshRecovery(session)) return <Redirect href="/(auth)/new-password" />
  } else if (!loading && session) {
    /**
     * A RESET IS NOT A SIGN-IN, even though it produced a session, which is why
     * it has its own branch above. Sent to `/`, the person lands on Today with
     * everything working and the password they came to change still in force.
     */
    return <Redirect href="/" />
  }

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
