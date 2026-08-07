import { Stack } from 'expo-router'

/**
 * The onboarding flow.
 *
 * A plain stack so every answer stays on the back stack and the user can walk
 * backwards without losing what they picked — the answers live in the store,
 * not in each screen.
 *
 * THE SECOND HALF IS ONE-WAY
 *
 * Everything from the flush onwards replaces the screen before it, so the top of
 * the stack after the account is still whatever was underneath the target
 * screen — a question, or the sign-in screen. An edge swipe on "Connect Apple
 * Health" therefore walked a user who had just created an account back into
 * "Where did you hear about us?", and one on the tour walked them into "Save
 * your progress" while already signed in.
 *
 * Turning the gesture off on those four is the fix, and it is the same reason
 * `(tabs)` has it off in the root stack: they are places the flow has moved ON
 * from, not places you went and can leave. Everything before the flush keeps it,
 * because walking an answer back is the whole point of the questions.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="about" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="food-style" />
      <Stack.Screen name="source" />
      <Stack.Screen name="calculating" />
      <Stack.Screen name="target" />
      <Stack.Screen name="finish" options={{ gestureEnabled: false }} />
      <Stack.Screen name="health" options={{ gestureEnabled: false }} />
      <Stack.Screen name="notifications" options={{ gestureEnabled: false }} />
      <Stack.Screen name="tutorial" options={{ gestureEnabled: false }} />
      <Stack.Screen name="trial" options={{ gestureEnabled: false }} />
      <Stack.Screen name="preview" options={{ gestureEnabled: false }} />
    </Stack>
  )
}
