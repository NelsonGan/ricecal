import { Redirect } from 'expo-router'

/**
 * Where "My foods" used to live, before it became the Recipes tab. Kept as a
 * redirect because a notification, a widget or an old deep link may still name
 * it, and a dead route is a red screen.
 */
export default function FoodsRedirect() {
  return <Redirect href="/recipes" />
}
