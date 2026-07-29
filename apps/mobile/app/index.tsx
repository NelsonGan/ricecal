import { Redirect } from 'expo-router'
import { View } from 'react-native'

import { useProfile, useSession } from '@/data'
import { Spinner } from '@/ui'

/**
 * The entry point decides between sign-in, onboarding and the app.
 *
 * Three states, in order, and each has to be distinguishable from the one
 * before it:
 *
 * - **Looking.** The keychain read and the profile fetch both take a moment,
 *   and redirecting during either flashes the wrong screen at a returning
 *   user. A spinner is the honest answer to "we do not know yet".
 * - **No session.** Sign in.
 * - **Session, no `onboarded_at`.** Finish onboarding. It is a timestamp
 *   rather than a boolean precisely so this decision has something to read.
 *
 * A redirect rather than a screen, so there is never a back stack entry
 * pointing at nothing.
 */
export default function Index() {
  const { session, loading } = useSession()
  const { data: profile, isPending } = useProfile()

  if (loading) return <Loading />
  if (!session) return <Redirect href="/sign-in" />

  // The profile query only runs once there is a session, so this wait is the
  // one round trip between launching and knowing where the user belongs.
  if (isPending) return <Loading />
  if (!profile?.onboarded_at) return <Redirect href="/goal" />

  return <Redirect href="/today" />
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
