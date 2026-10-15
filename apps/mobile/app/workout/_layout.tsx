import { Redirect, Stack } from 'expo-router'

import { useSession } from '@/data'

/**
 * The workout screens, behind a session, for the reason `activity/_layout.tsx`
 * gives: every screen below reads `useUserId`, which throws without one.
 *
 * Singular `workout` while the tab is `workouts`, because a tab route and a
 * folder of the same name are the same URL to the router.
 *
 * The logger slides up rather than across: training is a mode the app is in,
 * not a page in a path, and minimising it takes it back down to the bar over
 * the tabs. A card that slides, not a modal: the logger pushes the exercise
 * library and an exercise's page on top of itself, and on iOS a card pushed
 * after a modal in the same native stack is presented UNDER it, so the tap
 * did nothing anybody could see.
 */
export default function WorkoutLayout() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="active"
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
    </Stack>
  )
}
