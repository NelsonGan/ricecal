import { Redirect, Stack } from 'expo-router'
import { View } from 'react-native'

import { useSession } from '@/data'
import { Spinner } from '@/ui'

/**
 * The one guard the recipe routes need, in one place.
 *
 * Every other page in this app is reached from inside the tabs, where the guard
 * in `(tabs)/_layout.tsx` has already run and a session is a given. Recipes are
 * not: a shared recipe is a LINK, and a link is opened cold — from a message,
 * on a phone that has just launched — which lands the router here before the
 * keychain read that restores the session has finished.
 *
 * `useUserId` throws by design when there is no session, so without this the
 * app opened a shared recipe as a red error screen. And the fix has to be a
 * WAIT rather than a redirect: `loading` means "we do not know yet", and
 * redirecting during it sends a signed-in user to the welcome screen for the
 * length of one keychain read. That is the same distinction `app/index.tsx`
 * draws, and the same spinner.
 *
 * A layout rather than a copy of the check in each route: it is one rule about
 * a group, and a third recipe page added later inherits it. The LIST needs none
 * of this — it is a tab, and the tabs have a guard of their own.
 */
export default function RecipeLayout() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Spinner />
      </View>
    )
  }

  // A link opened by somebody with no account at all. The welcome screen is
  // where they belong; the recipe is behind it.
  if (!session) return <Redirect href="/welcome" />

  return <Stack screenOptions={{ headerShown: false }} />
}
