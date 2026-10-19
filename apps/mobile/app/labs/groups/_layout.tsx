import { Redirect, Stack } from 'expo-router'

/**
 * The groups prototypes are a design tool, not a feature: made-up people on
 * made-up data, for feeling four directions out before any of them is built.
 * A store build sends the deep link home rather than showing strangers' meals.
 */
export default function GroupsLabLayout() {
  if (!__DEV__) return <Redirect href="/" />
  return <Stack screenOptions={{ headerShown: false }} />
}
