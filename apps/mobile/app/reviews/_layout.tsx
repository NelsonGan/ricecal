import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The reviews, behind a session.
 *
 * The same guard the Activity detail screens have, and it is here for the same
 * two reasons: every screen below reaches `useUserId`, which THROWS by design
 * when there is no session, so a deep link straight to `ricecal://reviews` or a
 * Fast Refresh mid-session would be a red error screen rather than a redirect.
 *
 * The list and one review share this group rather than sitting in `reviews/`
 * and `review/` the way the recipes do. The split there is a TAB and a page;
 * these are both pages, one of which is only ever reached from the other, and
 * two groups would mean two copies of this guard.
 */
export default function ReviewsLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* A story covers the screen and is left through its own cross.
          `fullScreenModal` rather than a push for the gesture: a pushed screen
          keeps the interactive pop, and an edge swipe on a story is a swipe
          BACK A STEP as far as the user is concerned. One of the two has to go,
          and it is not the step. */}
      <Stack.Screen
        name="[id]"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
    </Stack>
  )
}
