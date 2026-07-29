import { Redirect } from 'expo-router'

import { useAppState } from '@/mock'

/**
 * The entry point decides between onboarding and the app.
 *
 * A redirect rather than a screen so there is never a blank frame, and never a
 * back stack entry pointing at nothing.
 */
export default function Index() {
  const onboarded = useAppState((state) => state.onboarded)
  return <Redirect href={onboarded ? '/today' : '/welcome'} />
}
