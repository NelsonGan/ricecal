import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import { supabase } from '@/lib/supabase'

/**
 * This phone's Expo push token, held by the server so a group nudge or invite
 * can reach it. Only registered once notifications are allowed: asking is done
 * where it means something, on creating or joining a group, never at launch.
 *
 * The last token handed over, and to whom, is kept so a launch with nothing new
 * makes no request. Keyed by account as well as token, because the server moves
 * a token to whoever registered it last: after another account used this phone,
 * the first one has to claim it back.
 */
const storage = createMMKV({ id: 'ricecal-push' })
const REGISTERED = 'registered'

export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
    if (!projectId) return
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    if (!token || storage.getString(REGISTERED) === `${userId} ${token}`) return
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    })
    if (!error) storage.set(REGISTERED, `${userId} ${token}`)
  } catch {
    // A simulator without push, or no network: the next launch tries again.
  }
}

/**
 * Called before signing out, while the session can still say whose token it
 * is, so a phone nobody is signed into stops receiving that account's nudges.
 * Best effort: a failure leaves the token to the next account that registers it.
 */
export async function forgetPushToken(): Promise<void> {
  const registered = storage.getString(REGISTERED)
  if (!registered) return
  try {
    // Bounded, so a bad connection cannot hold up signing out.
    await Promise.race([
      supabase.rpc('unregister_push_token', { p_token: registered.split(' ')[1] ?? '' }),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ])
  } catch {
    // Signing out goes ahead either way; the next account to register the
    // token takes it over.
  }
  storage.remove(REGISTERED)
}

export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (userId) void registerPushToken(userId)
  }, [userId])
}
