import { Redirect, Stack, useGlobalSearchParams, usePathname } from 'expo-router'
import { View } from 'react-native'

import { useSession } from '@/data'
import { holdPendingImport } from '@/features/recipes/pendingImport'
import { Spinner } from '@/ui'

/**
 * The one guard the recipe routes need, in one place.
 *
 * Every other page is reached from inside the tabs, where a session is a given.
 * Recipes are not: a shared recipe is a link, opened cold from a message on a
 * phone that has just launched, which lands the router here before the keychain
 * read that restores the session has finished.
 *
 * `useUserId` throws by design with no session, so without this a shared recipe
 * opened as a red error screen. The fix has to be a wait rather than a redirect:
 * `loading` means "we do not know yet", and redirecting through it sends a
 * signed-in user to the welcome screen for the length of one keychain read.
 *
 * A layout rather than a copy of the check in each route. The list needs none of
 * this, being a tab, and the tabs have a guard of their own.
 */
export default function RecipeLayout() {
  const { session, loading } = useSession()
  const pathname = usePathname()
  const { url } = useGlobalSearchParams<{ url?: string }>()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Spinner />
      </View>
    )
  }

  // A link opened by somebody with no account at all. The welcome screen is
  // where they belong; the recipe is behind it.
  if (!session) {
    // A video shared to the app before signing in is imported once the user
    // is, rather than lost at the welcome screen. See `pendingImport`.
    if (pathname === '/recipe/import' && typeof url === 'string') holdPendingImport(url)
    return <Redirect href="/welcome" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
