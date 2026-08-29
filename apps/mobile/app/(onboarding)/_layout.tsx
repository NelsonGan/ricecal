import { Stack } from 'expo-router'

/**
 * The onboarding flow, and nothing here has an edge swipe.
 *
 * The gesture was already off for the second half: everything from the flush
 * onwards replaces its predecessor, so the top of the stack under "Connect Apple
 * Health" is a question from before the account existed, and a swipe walked a
 * minute-old account back into "Where did you hear about us?".
 *
 * The questions kept it, on the reasoning that walking an answer back is the
 * point of a questionnaire, which missed that the flow crosses out of this group
 * and back: the account screen is in `(auth)`, and the flush replaces it, so the
 * stack a swipe unwinds is not the one the user walked.
 *
 * So onboarding moves forwards, and backwards only where a chevron says so.
 * `(auth)` and `(tabs)` are pinned the same way in the root stack.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="about" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="source" />
      <Stack.Screen name="calculating" />
      <Stack.Screen name="target" />
      <Stack.Screen name="finish" />
      <Stack.Screen name="health" />
      <Stack.Screen name="notifications" />
    </Stack>
  )
}
