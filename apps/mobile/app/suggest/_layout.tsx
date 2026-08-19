import { Redirect, Stack } from 'expo-router'
import { View } from 'react-native'

import { useSession } from '@/data'
import { Spinner } from '@/ui'

/**
 * The same guard the recipe routes carry, for the same reason.
 *
 * A suggestion is reached from Today, where the tabs' own guard has already run
 * and a session is a given — so this should never fire in ordinary use. What it
 * is for is the cold mount: the router RESTORES its route, so a page that was
 * open when the app was killed comes back before the keychain read that
 * restores the session has finished, and every query on the screen behind this
 * calls `useUserId`, which throws by design when there is nobody signed in. The
 * result is a red error screen on launch, which is exactly how `/paywall`
 * behaves and is worth not repeating.
 *
 * A WAIT rather than a redirect, because `loading` means "we do not know yet"
 * and sending a signed-in user to the welcome screen for the length of a
 * keychain read is the same mistake `app/index.tsx` is careful not to make.
 *
 * There is nothing to restore beyond the route itself: the picks live in
 * memory, so a launch that lands here lands on "that suggestion has gone",
 * which is the truth.
 */
export default function SuggestLayout() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Spinner />
      </View>
    )
  }

  if (!session) return <Redirect href="/welcome" />

  return <Stack screenOptions={{ headerShown: false }} />
}
