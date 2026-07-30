import { Redirect } from 'expo-router'
import { View } from 'react-native'

import { useProfile, useSession } from '@/data'
import { isComplete, useOnboardingDraft } from '@/features/onboarding'
import { Spinner } from '@/ui'

/**
 * The entry point decides between onboarding, the account step and the app.
 *
 * The order of these questions is the flow, and the flow changed: the questions
 * come before the account now, so "no session" no longer means "sign in". A
 * visitor answers seven screens first and is asked for an email at the end, which
 * makes the local draft — not the session — the thing that says how far they got.
 *
 * - **Looking.** The keychain read and the profile fetch both take a moment, and
 *   redirecting during either flashes the wrong screen at a returning user. A
 *   spinner is the honest answer to "we do not know yet".
 * - **No session, no answers.** Start at the beginning.
 * - **No session, answers ready.** They reached the end and stopped before
 *   signing in, so put them back on the screen that asks rather than making them
 *   tap through seven they have already answered.
 * - **Session, no `onboarded_at`, answers ready.** Signing in is what created
 *   this session, at the end of the flow. Flush.
 * - **Session, no `onboarded_at`, no answers.** An account that never finished, on
 *   a phone with no draft. Ask the questions.
 * - **Session and `onboarded_at`.** The app.
 *
 * A redirect rather than a screen, so there is never a back stack entry pointing
 * at nothing.
 */
export default function Index() {
  const { session, loading } = useSession()
  const { data: profile, isPending } = useProfile()
  const { draft } = useOnboardingDraft()
  const answered = isComplete(draft)

  if (loading) return <Loading />

  if (!session) return <Redirect href={answered ? '/target' : '/welcome'} />

  // The profile query only runs once there is a session, so this wait is the
  // one round trip between launching and knowing where the user belongs.
  if (isPending) return <Loading />
  if (!profile?.onboarded_at) return <Redirect href={answered ? '/finish' : '/goal'} />

  return <Redirect href="/today" />
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}
