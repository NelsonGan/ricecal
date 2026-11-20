import { Redirect } from 'expo-router'

/** Groups was a tab until it joined the feed on Social; an old link lands there. */
export default function GroupsRedirect() {
  return <Redirect href="/social" />
}
