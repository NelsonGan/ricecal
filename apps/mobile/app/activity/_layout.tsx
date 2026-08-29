import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The Activity detail screens, behind a session.
 *
 * Every screen below reaches `useUserId`, which throws by design when there is no
 * session, so reaching one without a session is a red error screen rather than a
 * redirect. Two ways to get there: a deep link, which opens the route directly
 * and never runs the guard at `/`; and a Fast Refresh, where `SessionProvider`
 * re-initialises with no session and any mounted screen re-renders into the gap.
 *
 * `loading` returns null rather than redirecting, because a redirect while the
 * session is being read would bounce a signed-in user to sign-in and back on
 * every launch.
 */
export default function ActivityLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return <Stack screenOptions={{ headerShown: false }} />
}
