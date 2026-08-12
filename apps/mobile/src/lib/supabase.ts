import 'react-native-url-polyfill/auto'

import { createClient, type Session } from '@supabase/supabase-js'
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

/**
 * The session as it last went past this adapter, serialised.
 *
 * `getSession()` answers `null` once the access token has expired and the
 * refresh could not be SENT, which is every offline relaunch more than an hour
 * after the last one. Supabase is right not to hand back a credential it could
 * not renew, and it deliberately leaves the session on disk for the next
 * attempt — what it cannot do is tell this app apart from a signed-out one. The
 * router read that null as "no account" and sent a returning user to the
 * welcome screen with their whole cached diary sitting behind it.
 *
 * Remembering it here rather than reading the keychain a second time is what
 * keeps this honest. Every read, write and delete supabase performs goes
 * through this adapter, and a session the SERVER has revoked is a non-retryable
 * refresh failure, which supabase answers by deleting the session — through
 * `removeItem` below, before anything could read it back.
 */
let seenSession: string | null = null

/**
 * Records the session on its way past and hands the value back unchanged.
 *
 * Keyed rather than recording everything: supabase keeps a PKCE code verifier
 * under a neighbouring key, and it is a bare string that would parse as no
 * session at all and overwrite this one.
 */
function remember(key: string, value: string | null): string | null {
  if (key.endsWith('-auth-token')) seenSession = value
  return value
}

/**
 * Who was signed in, according to storage alone.
 *
 * For deciding WHERE A LAUNCH BELONGS and nothing else. The access token in it
 * may well be expired — that is the situation it exists for — so it is never a
 * credential, and nothing sends it anywhere. Requests are `offlineFirst` and
 * pause rather than run while there is no connection, and the moment one
 * returns supabase refreshes the token and announces the real session.
 */
export function storedSession(): Session | null {
  if (!seenSession) return null
  try {
    const parsed = JSON.parse(seenSession) as Partial<Session> | null
    // Shape-checked because this bypasses supabase's own validation: a
    // half-written or older-format blob must read as "nobody", not crash the
    // one screen that decides where every launch goes.
    return typeof parsed?.access_token === 'string' && typeof parsed.user?.id === 'string'
      ? (parsed as Session)
      : null
  } catch {
    return null
  }
}

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
    if (keychainUnavailable) return remember(key, memoryStore.get(key) ?? null)
    try {
      const value = await SecureStore.getItemAsync(key)
      readFailures.delete(key)
      return remember(key, value)
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
      remember(key, value)
      return
    }
    try {
      await SecureStore.setItemAsync(key, value, {
        // A refresh token has to be readable when Supabase's timer fires, which
        // can be while the phone is locked. The default (WHEN_UNLOCKED) fails
        // there; this stays readable from the first unlock after a reboot.
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      })
      // Only once it is actually stored. A write that rethrows below has put
      // the session nowhere, and remembering it anyway would have
      // `storedSession` reporting an account this phone cannot produce on the
      // next launch.
      remember(key, value)
    } catch (error) {
      if (!isMissingEntitlement(error)) throw error
      keychainUnavailable = true
      memoryStore.set(key, value)
      remember(key, value)
      console.warn(
        '[auth] no keychain in this build, keeping the session in memory only. ' +
          'It will not survive a restart: this build cannot reach the keychain.',
        error,
      )
    }
  },

  removeItem: async (key: string) => {
    remember(key, null)
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
