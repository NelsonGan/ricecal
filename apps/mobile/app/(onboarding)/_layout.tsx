import { Stack } from 'expo-router'

/**
 * The onboarding flow.
 *
 * A plain stack so every answer stays on the back stack and the user can walk
 * backwards without losing what they picked — the answers live in the store,
 * not in each screen.
 */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
