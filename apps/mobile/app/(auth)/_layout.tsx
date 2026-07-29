import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

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
 */
export default function AuthLayout() {
  const { session, loading } = useSession()

  if (!loading && session) return <Redirect href="/" />

  return <Stack screenOptions={{ headerShown: false }} />
}
