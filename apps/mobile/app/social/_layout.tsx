import { Redirect, Stack } from 'expo-router'
import { useSession } from '@/data'

export default function SocialLayout() {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <Redirect href="/welcome" />
  return <Stack screenOptions={{ headerShown: false }} />
}
