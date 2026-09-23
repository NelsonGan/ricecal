import { Redirect } from 'expo-router'

// Older deep links still land in the account editor after the separate screen moved.
export default function EditProfileRedirect() {
  return <Redirect href="/settings/account" />
}
