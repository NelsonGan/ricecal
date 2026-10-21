import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'

/**
 * Hands this phone's Expo push token to the server, so a nudge or an invite can
 * reach it. Only when notifications are already allowed: asking is done where it
 * means something, on creating or joining a group, and never at launch.
 *
 * Registration is cheap and idempotent (an upsert on the token), so it runs on
 * every launch rather than tracking whether the token changed.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
    if (!projectId) return
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    if (!token) return
    await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    })
  } catch {
    // A simulator without push, or no network: the next launch tries again.
  }
}

export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (userId) void registerPushToken()
  }, [userId])
}
