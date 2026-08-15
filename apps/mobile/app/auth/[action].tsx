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
 * So this exists to be matched. It does no work: the URL is handled above the
 * navigator, because a link can arrive at any moment and there is not
 * necessarily a screen. All this does is wait, and then get out of the way.
 *
 * `[action]` rather than two files because the two differ only in when they
 * leave, and the difference is one line.
 */
export default function AuthLanding() {
  const { action } = useLocalSearchParams<{ action?: string }>()
  const { session, loading } = useSession()

  /**
   * A RESET DOES NOT LEAVE ON ITS OWN.
   *
   * Exchanging a recovery link creates a session, same as any other link, so
   * redirecting on one would race `LoginLinkHandler` to the door and win —
   * landing somebody on Today with the password they came to change still in
   * force. The handler sends them to `new-password`; this screen only has to
   * not move first.
   */
  const isReset = action === 'reset'

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
  // person has finished onboarding, and a dead link belongs at welcome.
  if (waited) return <Redirect href="/" />
  if (!isReset && !loading && session) return <Redirect href="/" />

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
