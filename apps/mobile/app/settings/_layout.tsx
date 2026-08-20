import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The settings pages, behind a session.
 *
 * The same guard `reviews/_layout.tsx` and `recipe/_layout.tsx` carry, and it is
 * here for the same reason: every screen below reaches `useUserId`, which THROWS
 * by design when there is nobody signed in. Reached from the Me tab that is
 * never true — the tabs have a guard of their own — but these are real routes
 * with real URLs, so a deep link, a restored navigation state or a Fast Refresh
 * lands here cold and the app came up as a red error screen. `/settings/
 * subscription` is the one that matters most: it is where somebody goes to find
 * out what they have paid for.
 *
 * A WAIT rather than a redirect while `loading`, which is the distinction
 * `app/index.tsx` draws: "we do not know yet" is not "signed out", and
 * redirecting through it would bounce a signed-in user to the welcome screen for
 * the length of one keychain read.
 *
 * Nothing about presentation changes by nesting these — every settings page is
 * an ordinary push and takes the stack's default.
 */
export default function SettingsLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/welcome" />

  return <Stack screenOptions={{ headerShown: false }} />
}
