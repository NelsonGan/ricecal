import 'react-native-url-polyfill/auto'

import { createClient, type Session } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

import type { Database } from './database.types'
import { env } from './env'
import { sessionIsGone, tokenWasRefused } from './revocation'

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
 * The key the session is filed under, as far as this adapter needs to know.
 *
 * Matched by suffix rather than spelled out: supabase builds it from the project
 * ref in the URL, and keeps a PKCE code verifier under a neighbouring key that
 * is a bare string — one that would parse as no session at all and overwrite
 * this one.
 */
const isSessionKey = (key: string) => key.endsWith('-auth-token')

/**
 * Resolves the first time storage answers about the session, whatever it said.
 *
 * Supabase's own startup is not this quick, and cannot be. `_recoverAndRefresh`
 * reads this key and then, if the access token is within 90 seconds of expiring,
 * spends up to `AUTO_REFRESH_TICK_DURATION_MS` retrying a refresh with
 * exponential backoff before `getSession()` answers anybody — and offline every
 * one of those attempts waits on a request that will not arrive. An hour after
 * the last launch, which is the life of an access token, that is EVERY launch.
 *
 * The read is the part that says where the launch belongs, and it has already
 * happened by then. See `SessionProvider`, which routes off it and lets the real
 * answer correct it whenever it comes.
 */
let announceRead: () => void = () => {}
const storageRead = new Promise<void>((resolve) => {
  announceRead = resolve
})

/**
 * Who was signed in according to storage, once storage has been asked.
 *
 * Never resolves if nothing ever reads the key — which cannot happen through
 * supabase's own init, and is why the caller races this against `getSession()`
 * rather than waiting on it alone.
 */
export async function whenStoredSession(): Promise<Session | null> {
  await storageRead
  return storedSession()
}

/**
 * Records the session on its way past and hands the value back unchanged.
 */
function remember(key: string, value: string | null): string | null {
  if (isSessionKey(key)) {
    seenSession = value
    announceRead()
  }
  return value
}

/**
 * Who was signed in, according to storage alone.
 *
 * For deciding WHERE A LAUNCH BELONGS and nothing else. The access token in it
 * may well be expired — that is the situation it exists for — so it is never a
 * credential, and nothing sends it anywhere. Requests pause rather than run
 * while there is no connection, and the moment one returns supabase refreshes
 * the token and announces the real session.
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
      // Storage has answered, in the only terms this adapter has: there is no
      // session to be had. Said out loud rather than through `remember`, which
      // would also forget a session an earlier read had succeeded in getting —
      // a locked device during a background tick is not a sign-out.
      if (isSessionKey(key)) announceRead()
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
    // Every request the client makes goes through here, which is what makes one
    // watch cover PostgREST, storage and all eight edge functions. Declared
    // below, after the client it reads: a function declaration is hoisted, and
    // the guard is easier to follow next to the rest of the revocation handling
    // than wedged in above the thing it guards.
    global: { fetch: guardedFetch },
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // No URL to detect a session in — this is a native app, not a browser.
      detectSessionInUrl: false,
      // PKCE, NOT the library's implicit default. A magic link or a reset then
      // comes back as a one-time `?code=` that only means anything with the
      // verifier THIS install generated and stored, so a link carrying a
      // session cannot be replayed onto another device. The implicit flow puts
      // a usable token pair straight in the URL fragment, and any `ricecal://`
      // link carrying one would sign the app in — a stranger's crafted link
      // becomes a login. `completeLoginFromUrl` accepts only the code for the
      // same reason.
      flowType: 'pkce',
    },
  },
)

/**
 * WHEN THE SERVER STOPS RECOGNISING THIS SESSION.
 *
 * A session can end on the server while this phone still holds a perfectly
 * good-looking access token: signing out every device, an account deleted, a
 * session revoked in the dashboard, GoTrue timing one out. The token stays
 * validly SIGNED until it expires, so the two halves of the project disagree
 * about it for up to an hour:
 *
 * - PostgREST and the catalogue Worker check the signature and nothing else, so
 *   the diary goes on loading and the app looks signed in.
 * - Every edge function calls `auth.getUser()`, which asks GoTrue, which answers
 *   `session_not_found`. The function returns 401 and the action fails.
 *
 * So scanning, refining, recipes, suggestions, photos and barcodes all stop
 * working while the app insists there is an account. Nothing used to notice:
 * `refusalFrom` reads 402 and 429 and passes a 401 straight through to a generic
 * "that did not work".
 *
 * AND AUTH-JS WILL NOT CATCH IT EITHER, by design. `_callRefreshToken` keeps the
 * session when a refresh fails while the access token is still valid, on the
 * reasoning that "destroying it now would log out a user whose access token
 * works". That is right for a refresh that failed because the network dropped
 * and wrong for one the server refused: here the token works for exactly the
 * consumers that never ask GoTrue, which is not the same as working.
 *
 * Hence the probe below. A 401 is the symptom; a refused refresh is the proof.
 */

/**
 * Who wants telling that the session ended without the user asking.
 *
 * An event rather than a call into the UI, because this file is imported by a
 * background task and a widget sync as well as by the app, and neither of those
 * has a toast to show. `SessionEndedNotice` subscribes for the one that does.
 */
const sessionEndedListeners = new Set<() => void>()

export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener)
  return () => {
    sessionEndedListeners.delete(listener)
  }
}

/**
 * One probe at a time.
 *
 * A screen fires several requests at once, so a revoked session produces a
 * handful of 401s within a frame or two of each other and each of them would
 * otherwise start its own refresh. auth-js coalesces concurrent refreshes and
 * caches a recent failure, so the extra ones are cheap rather than harmful, but
 * a single flight also means the sign-out and its announcement happen once.
 */
let probe: Promise<void> | null = null

/**
 * Ends the session locally if, and only if, the server has ended it.
 *
 * `refreshSession()` is the question, because the refresh token is the only
 * credential that can be checked without guessing: hand it over and the server
 * either mints a new pair, in which case the 401 was a stale token and this is
 * already fixed, or refuses it, in which case there is nothing left to be signed
 * in with.
 *
 * `scope: 'local'` for the sign-out. There is no session on the server to
 * revoke, and a global sign-out would be asking to end other devices' sessions,
 * which is not what happened and not ours to do. This forgets our copy.
 *
 * Never throws. It is called from inside a fetch, whose caller is expecting a
 * response and has its own error to handle.
 */
async function endSessionIfGone(): Promise<void> {
  // Nothing to end, so nothing to announce. This is also the guard that stops a
  // signed-out app announcing a sign-out on every request: `removeItem` clears
  // what `storedSession` reads, so the second 401 after a sign-out is a no-op.
  if (!storedSession()) return

  probe ??= (async () => {
    try {
      const { error } = await supabase.auth.refreshSession()
      if (!sessionIsGone(error)) return
      await supabase.auth.signOut({ scope: 'local' })
      for (const listener of sessionEndedListeners) listener()
    } catch (error) {
      console.warn('[auth] could not check whether the session is still good', error)
    } finally {
      probe = null
    }
  })()

  return probe
}

/**
 * The client's fetch, with a 401 watched for on the way past.
 *
 * The response is handed back untouched and the probe is not awaited: whatever
 * asked is still owed its answer, and the request that noticed has already
 * failed. What it gets from this is the NEXT one, and the sign-out.
 */
async function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (tokenWasRefused(requestUrl(input), response.status)) void endSessionIfGone()
  return response
}

/**
 * The URL out of whichever of the three shapes `fetch` accepts.
 *
 * Structural rather than `instanceof Request`, for the same reason the errors in
 * `revocation.ts` are: the constructor a polyfill installs is not necessarily
 * the one a value was made with. `String()` covers `URL`, whose `toString` is
 * its href.
 */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  const url = (input as { url?: unknown }).url
  return typeof url === 'string' ? url : String(input)
}
