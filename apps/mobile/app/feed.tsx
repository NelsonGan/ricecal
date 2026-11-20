import { Redirect } from 'expo-router'

/** Feed was a tab until it joined Groups on Social; an old link lands there. */
export default function FeedRedirect() {
  return <Redirect href="/social" />
}
