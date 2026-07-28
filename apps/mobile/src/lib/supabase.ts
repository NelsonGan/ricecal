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
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
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
