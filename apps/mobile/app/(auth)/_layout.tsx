import { Redirect, Stack, useSegments } from 'expo-router'

import { useSession } from '@/data'
import { CaptchaProvider } from '@/features/auth'

/**
 * The sign-in stack, and the guard that closes it. A session appears while this
 * stack is on screen, since signing in is what creates one, and the index route
 * only decides where a signed-in user belongs on mount, so without this the user
 * keeps looking at the form they just submitted.
 *
 * Redirecting to `/` rather than `/today` keeps that decision in one place.
 *
 * One screen is exempt. Choosing a new password begins by verifying a recovery
 * code, which is what creates the session licensing the change, so guarded like
 * everything else the reset carries the user off to Today with the old password
 * still in force. `new-password` navigates itself once the password is saved.
 *
 * Read off the segments rather than held in state: which screen is showing is a
 * fact the router already has.
 */
export default function AuthLayout() {
  const { session, loading } = useSession()
  const segments = useSegments()

  const settingPassword = segments[segments.length - 1] === 'new-password'

  if (!loading && session && !settingPassword) return <Redirect href="/" />

  return (
    // Around the stack rather than at the app root: the captcha is a WebView
    // fetching a script from Cloudflare, and every launch paying for that would
    // be a launch paying for a screen most of them never see.
    <CaptchaProvider>
      {/* No edge swipe, matching `(onboarding)`. This stack is one screen of
          that flow wearing a different group, and the chevron in its own header
          is the way back — see the note in `(onboarding)/_layout.tsx`. */}
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
    </CaptchaProvider>
  )
}
