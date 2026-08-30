import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The settings pages, behind a session.
 *
 * The same guard `reviews/_layout.tsx` and `recipe/_layout.tsx` carry: every
 * screen below reaches `useUserId`, which throws with nobody signed in. Reached
 * from the Me tab that is never true, but these are real routes with real URLs,
 * so a deep link, a restored navigation state or a Fast Refresh lands here cold
 * and the app came up as a red error screen.
 *
 * A wait rather than a redirect while `loading`: "we do not know yet" is not
 * "signed out", and redirecting through it would bounce a signed-in user to the
 * welcome screen for the length of one keychain read.
 *
 * Nesting changes nothing about presentation; every settings page is an ordinary
 * push.
 */
export default function SettingsLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/welcome" />

  return <Stack screenOptions={{ headerShown: false }} />
}
