import { Redirect, Stack, useSegments } from 'expo-router'

import { useSession } from '@/data'
import { CaptchaProvider } from '@/features/auth'

/**
 * The sign-in stack, and the guard that closes it.
 *
 * A session can appear while this stack is on screen — that is the normal case,
 * since signing in is what creates one. The index route decides where a
 * signed-in user belongs, but it only decides once, on mount, so without this
 * the user stays looking at the form they have just successfully submitted.
 *
 * Redirecting to `/` rather than to `/today` keeps that decision in one place:
 * index is what knows whether onboarding is finished.
 *
 * ONE SCREEN IS EXEMPT, and it has to be. Choosing a new password begins by
 * verifying a recovery code, and verifying a recovery code IS what creates the
 * session that licenses the change. Guarded like everything else, the reset
 * carries the user off to Today the instant it starts working, leaving the
 * password they could not remember still in force. So while `new-password` is
 * the screen on top, a session is not a reason to leave; that screen navigates
 * itself when the new password has actually been saved.
 *
 * Read off the segments rather than held in state on purpose: "which screen is
 * showing" is a fact the router already has, and a second copy of it in a
 * context is a second thing that can be wrong.
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
