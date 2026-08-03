import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The Activity detail screens, behind a session.
 *
 * The same guard the tab group has, and it is here for the same two reasons
 * plus one this group made unmissable.
 *
 * Every screen below reaches `useUserId`, which THROWS by design when there is
 * no session — that is what stops a query being made with the wrong identity.
 * A screen that calls it without a session first is therefore a red error
 * screen, not a redirect. Two ways to get there:
 *
 *   * A deep link. `ricecal://activity/steps` opens the route directly, and the
 *     guard at `/` never runs.
 *   * A Fast Refresh. `SessionProvider` re-initialises with `loading: true` and
 *     no session, and any mounted screen re-renders into that gap. This one is
 *     development-only and it is how the hole was found: editing any of these
 *     files while looking at the screen it draws crashed it every time.
 *
 * `loading` returns null rather than redirecting, because a redirect during the
 * moment the session is being read would bounce a signed-in user to sign-in and
 * back on every launch.
 */
export default function ActivityLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return <Stack screenOptions={{ headerShown: false }} />
}
