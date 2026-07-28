import 'react-native-url-polyfill/auto'

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

import { env } from './env'

/**
 * SecureStore, not AsyncStorage. What is stored here is a refresh token — on
 * iOS it belongs in the Keychain, on Android in EncryptedSharedPreferences.
 *
 * SecureStore rejects values over 2048 bytes. Supabase sessions are comfortably
 * under that today; if a future token grows past it, the write throws rather
 * than silently truncating, which is the failure mode we want.
 */
const SecureStoreAdapter = {
  /**
   * Reads never throw.
   *
   * Supabase calls this on startup and on every `autoRefreshToken` tick. A
   * keychain read can fail for reasons that are not bugs — a locked device
   * during a background refresh, a restored backup, a simulator build with no
   * entitlements — and letting those reject produces a stream of unhandled
   * promise rejections and a failed refresh loop.
   *
   * "Could not read the token" and "there is no token" are the same thing to a
   * caller: the user signs in again. So report the second.
   */
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key)
    } catch (error) {
      console.warn(`[auth] keychain read failed for "${key}", treating as signed out`, error)
      return null
    }
  },

  /**
   * Writes and deletes DO throw. A token that could not be stored means the
   * next launch silently signs the user out, and a token that could not be
   * deleted outlives a sign-out — both are things the caller has to know about.
   */
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      // A refresh token has to be readable when Supabase's timer fires, which
      // can be while the phone is locked. The default (WHEN_UNLOCKED) fails
      // there; this stays readable from the first unlock after a reboot.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),

  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // No URL to detect a session in — this is a native app, not a browser.
      detectSessionInUrl: false,
    },
  },
)
