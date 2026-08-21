import { Stack } from 'expo-router'

/**
 * The onboarding flow.
 *
 * NOTHING HERE HAS AN EDGE SWIPE, and that is the whole shape of it.
 *
 * The gesture was off for the second half already, for a concrete reason:
 * everything from the flush onwards REPLACES its predecessor, so the top of the
 * stack under "Connect Apple Health" is still a question from before the account
 * existed. A swipe there walked a minute-old account back into "Where did you
 * hear about us?", and one on the tour walked them into "Save your progress"
 * while already signed in.
 *
 * The questions kept it, on the reasoning that walking an answer back is the
 * point of a questionnaire. What that missed is that the flow crosses out of
 * this group and back — the account screen is in `(auth)`, and the flush
 * replaces it — so the stack a swipe unwinds is not the one the user walked. The
 * complaint was exactly that: sign in, and a swipe from the next screen lands
 * somewhere that "looks weird".
 *
 * So the rule is one rule now. Onboarding moves forwards, and backwards only
 * where a chevron says so — `StepHeader` draws it, and each screen decides where
 * it goes, which is a decision the gesture could never make. `(auth)` and
 * `(tabs)` are pinned the same way in the root stack.
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
