import { Redirect } from 'expo-router'

/** Custom tabs only register their triggers, so this legacy link belongs at the root. */
export default function RecipesRedirect() {
  return <Redirect href="/settings/foods" />
}
