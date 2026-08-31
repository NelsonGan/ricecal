import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useProfile, useSession } from '@/data'
import { signOut } from '@/data/auth'
import { isComplete, ONBOARDING_STEPS, useOnboardingDraft } from '@/features/onboarding'
import { useEnterApp } from '@/lib/navigation'
import { EmptyState, Spinner } from '@/ui'

/**
 * The entry point decides between onboarding, the account step and the app. The
 * questions come before the account, so "no session" no longer means "sign in":
 * the local draft rather than the session says how far a visitor got.
 *
 * - Looking. The keychain read and the profile fetch both take a moment, and
 *   redirecting during either flashes the wrong screen at a returning user.
 * - No session. Start at the beginning every time. Resuming at the target screen
 *   looked right until a draft outlived the account it was flushed for, and
 *   signing out landed on "that is about four meals" with no way back to the top.
 * - A session whose account is gone. Sign out, which turns the next render into
 *   the case above.
 * - Session, no `onboarded_at`, answers ready. Signing in created this session at
 *   the end of the flow, so flush.
 * - Session, no `onboarded_at`, no answers. Ask the questions.
 * - Session and `onboarded_at`. The app.
 *
 * A redirect rather than a screen, so there is never a back stack entry pointing
 * at nothing.
 */
export default function Index() {
  const { session, loading } = useSession()
  const { data: profile, isPending, isPaused, isSuccess } = useProfile()
  const { draft } = useOnboardingDraft()
  const answered = isComplete(draft)

  /**
   * A token in the keychain outlives the account it was issued for. Deleting a
   * user reaches Postgres and nothing else, so the phone still holds a signed
   * access token PostgREST accepts until it expires: every read returns nothing,
   * which the router read as "signed in, never onboarded".
   *
   * A successful select with no row is what says so, and it is unambiguous:
   * `on_auth_user_created` writes the profile in the same transaction as the
   * account, so a live session always has one. Anything else fails the query
   * rather than answering it.
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
  //
  // Unless there is no connection to make it over, and no answer saved from a
  // previous launch to use instead. Such a query is PAUSED rather than sent,
  // and a paused query is pending for as long as the phone is offline — so a
  // spinner here is one that will still be turning tomorrow. It
  // needs no retry: react-query resumes the moment a connection returns, and
  // this screen redirects itself.
  if (isPending) return isPaused ? <Offline /> : <Loading />

  // Held here until the sign-out lands, rather than redirected on: the
  // onboarding screens need no session, so falling through would drop the user
  // into the middle of the flow and skip the welcome screen entirely.
  if (abandoned) return <Loading />

  /**
   * A read that failed says nothing about where this user belongs. The line above
   * was drawn for `signOut` alone, and everything past this point reads `profile`
   * as though the answer had arrived, so a request that dropped took the same
   * branch as a genuine `onboarded_at: null`.
   *
   * The same wait as the paused case: react-query refetches on reconnect and on
   * the next foreground, and the redirect happens then.
   */
  if (!isSuccess) return <Offline />

  /**
   * `setup` rather than `about`, and the difference is a loop.
   *
   * This pointed at the first QUESTION, which was `about` until the language
   * and units screen was put in front of it. Signing in before answering
   * anything then landed on step two: nothing ever asked for `units`, so
   * `isComplete` stayed false, and the flush at the end of the flow bounced
   * straight back here. Somebody who chose "I already have an account" and
   * signed up through it could not finish onboarding at all.
   *
   * The start of the flow is `ONBOARDING_STEPS[0]`, which is what `welcome`'s
   * own button has always pushed. Read off the list rather than spelled out, so
   * a screen put in front of `setup` moves this redirect with it instead of
   * opening the same gap again.
   */
  if (!profile?.onboarded_at)
    return <Redirect href={answered ? '/finish' : `/${ONBOARDING_STEPS[0]}`} />

  return <EnterApp />
}

/**
 * Into the app, and not merely on top of it.
 *
 * A `Redirect` would do here on a cold launch, where this route is all there is
 * to replace. It is wrong on the other way in: signing in pushes `(auth)` OVER
 * the welcome screen, the layout there sends the new session back to this route,
 * and a replace then swaps THIS entry and leaves "Get started" underneath the
 * diary. See `useEnterApp` for what that cost.
 */
function EnterApp() {
  const enterApp = useEnterApp()

  useEffect(() => {
    enterApp()
  }, [enterApp])

  return <Loading />
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner />
    </View>
  )
}

/**
 * Not a `Screen`: this route is a redirect and has no chrome of its own, and
 * borrowing a title bar would give the user a back chevron to nowhere.
 */
function Offline() {
  const { t } = useTranslation('common')

  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <EmptyState
        title={t('offline.title')}
        description={t('offline.body')}
        icon={{ set: 'ui', name: 'offline' }}
      />
    </View>
  )
}
