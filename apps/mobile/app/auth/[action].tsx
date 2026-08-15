import { Redirect, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { useSession } from '@/data'
import { Spinner } from '@/ui'

/**
 * WHERE A LINK IN AN EMAIL ACTUALLY LANDS.
 *
 * `ricecal://auth/callback` and `ricecal://auth/reset` are paths, and the
 * router matches paths against files. There was no file, so tapping the button
 * in a login mail opened the app on "Page not found" with a button offering to
 * take you to Today — while, out of sight, `LoginLinkHandler` was signing the
 * person in perfectly well. The link worked and looked broken, which is the
 * worst of both.
 *
 * So this exists to be matched. It redeems nothing: the URL is handled above the
 * navigator, because a link can arrive at any moment and there is not
 * necessarily a screen. All this does is wait for the session that handler is
 * fetching, and then send the person where the link meant them to go.
 *
 * IT IS ALSO WHERE THE RECOVERY REDIRECT LIVES, and that is a mounting rule
 * rather than a preference. `LoginLinkHandler` renders outside the navigator, so
 * an imperative `router.replace` from it races the root layout on a cold start
 * from the mail — expo-router's "attempted to navigate before mounting the Root
 * Layout" is exactly that race. A `<Redirect>` in a route cannot happen before
 * the route is mounted, because being mounted is what renders it.
 *
 * `[action]` rather than two files because the two differ only in where they
 * go, and the difference is one line.
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

  if (!loading && session) {
    /**
     * A RESET IS NOT A SIGN-IN, even though it produced a session. It is the
     * middle of choosing a new password, and sent to `/` the person lands on
     * Today with everything working and the password they came to change still
     * in force.
     */
    return <Redirect href={action === 'reset' ? '/(auth)/new-password' : '/'} />
  }

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
