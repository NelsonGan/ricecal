import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

import { useProfile, useSession } from '@/data'
import { signOut } from '@/data/auth'
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
 * - **No session.** Start at the beginning, every time. It used to resume at the
 *   target screen when a draft was complete, on the theory that somebody who had
 *   answered everything should not tap through it again — but a draft outlives the
 *   account it was flushed for, so signing out and relaunching landed on "that is
 *   about four meals" with no way back to the top. Answers are still on disk, so
 *   walking the questions again is a few taps with every choice already made.
 * - **A session whose account is gone.** Sign out, which turns the next render
 *   into the case above. See below.
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
  const { data: profile, isPending, isSuccess } = useProfile()
  const { draft } = useOnboardingDraft()
  const answered = isComplete(draft)

  /**
   * A token in the keychain outlives the account it was issued for.
   *
   * Deleting a user — in the dashboard, or through the account screen once that
   * exists — reaches Postgres and nothing else, so the phone still holds a
   * signed access token that PostgREST goes on accepting until it expires. Every
   * read then returns nothing and every write matches no row: the router read
   * that as "signed in, never onboarded" and walked a returning user into the
   * questions, which ended on "we could not save your answers" because the row
   * the flush updates was deleted with the account.
   *
   * A SUCCESSFUL select with NO ROW is what says so, and it is unambiguous:
   * `on_auth_user_created` writes the profile in the same transaction as the
   * account, so a live session always has one. Anything else — offline, a
   * refused request, a token being refreshed — fails the query rather than
   * answering it, and leaves this false.
   */
  const abandoned = Boolean(session) && isSuccess && !profile

  useEffect(() => {
    // Supabase drops the local session even when the server refuses the
    // sign-out, which is what a token for a deleted user gets, so this clears
    // the keychain rather than reporting that there was nothing left to revoke.
    if (abandoned) signOut().catch(() => {})
  }, [abandoned])

  if (loading) return <Loading />

  if (!session) return <Redirect href="/welcome" />

  // The profile query only runs once there is a session, so this wait is the
  // one round trip between launching and knowing where the user belongs.
  if (isPending) return <Loading />

  // Held here until the sign-out lands, rather than redirected on: the
  // onboarding screens need no session, so falling through would drop the user
  // into the middle of the flow and skip the welcome screen entirely.
  if (abandoned) return <Loading />

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
