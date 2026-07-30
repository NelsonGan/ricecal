import 'react-native-url-polyfill/auto'

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

import type { Database } from './database.types'
import { env } from './env'

/**
 * SecureStore, not AsyncStorage. What is stored here is a refresh token — on
 * iOS it belongs in the Keychain, on Android in EncryptedSharedPreferences.
 *
 * SecureStore rejects values over 2048 bytes. Supabase sessions are comfortably
 * under that today; if a future token grows past it, the write throws rather
 * than silently truncating, which is the failure mode we want.
 */
/**
 * Keys whose last read failed, so a keychain that is unavailable for a while
 * warns once rather than on every `autoRefreshToken` tick. Cleared on the next
 * successful read, so a later failure is reported again.
 */
const readFailures = new Set<string>()

/**
 * Where a session goes when the keychain refuses it.
 *
 * A local simulator build is signed ad-hoc with an empty entitlements
 * dictionary, so every SecureStore write fails with "a required entitlement
 * isn't present" — an ad-hoc-signed local build embeds an empty entitlements
 * dictionary, so the keychain is unreachable. That is a fact about the build, not a
 * runtime failure, and it is the build every developer runs: without a
 * fallback, signing in on a simulator cannot work at all.
 *
 * In memory, so it dies with the process. A session that survived a restart
 * without ever reaching the keychain would be the dangerous version of this.
 */
const memoryStore = new Map<string, string>()
let keychainUnavailable = false

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
    if (keychainUnavailable) return memoryStore.get(key) ?? null
    try {
      const value = await SecureStore.getItemAsync(key)
      readFailures.delete(key)
      return value
    } catch (error) {
      if (!readFailures.has(key)) {
        readFailures.add(key)
        console.warn(`[auth] keychain read failed for "${key}", treating as signed out`, error)
      }
      return null
    }
  },

  /**
   * Writes and deletes still fail loudly on a build that has a keychain — a
   * token that could not be stored means the next launch silently signs the
   * user out, and one that could not be deleted outlives a sign-out.
   *
   * The one case that is not a failure is a build with no keychain at all. It
   * is detected here, on the first write, because that is the first moment it
   * can be: a read from an empty keychain and a read from an unreachable one
   * look identical.
   */
  setItem: async (key: string, value: string) => {
    if (keychainUnavailable) {
      memoryStore.set(key, value)
      return
    }
    try {
      await SecureStore.setItemAsync(key, value, {
        // A refresh token has to be readable when Supabase's timer fires, which
        // can be while the phone is locked. The default (WHEN_UNLOCKED) fails
        // there; this stays readable from the first unlock after a reboot.
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      })
    } catch (error) {
      if (!isMissingEntitlement(error)) throw error
      keychainUnavailable = true
      memoryStore.set(key, value)
      console.warn(
        '[auth] no keychain in this build, keeping the session in memory only. ' +
          'It will not survive a restart: this build cannot reach the keychain.',
        error,
      )
    }
  },

  removeItem: async (key: string) => {
    memoryStore.delete(key)
    if (keychainUnavailable) return
    await SecureStore.deleteItemAsync(key)
  },
}

/**
 * The specific failure a build with no entitlements produces. Anything else is
 * a real problem and is rethrown.
 */
function isMissingEntitlement(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /entitlement/i.test(message)
}

/**
 * Typed against the generated `Database`, so `.from('food_logs')` knows its own
 * columns and a misspelled one is a compile error rather than a runtime `null`.
 * Regenerate with `pnpm db:types` after any migration.
 */
export const supabase = createClient<Database>(
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
