import { Redirect } from 'expo-router'
import type { ReactNode } from 'react'

import { useSession } from '@/data'

/** A cold deep link must wait for the keychain before mounting account queries. */
export function SessionGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <Redirect href="/welcome" />
  return children
}
