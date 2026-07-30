import * as AppleAuthentication from 'expo-apple-authentication'
import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

import { env, isConfigured } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * Signing in. There are no passwords anywhere in here.
 *
 * Three ways in, in the order they matter on a phone:
 *
 * - **Apple** is the native flow. It authenticates against the bundle id
 *   alone, which is why no Services ID or six-monthly key rotation is needed;
 *   the identity token goes straight to Supabase, which verifies it against
 *   Apple's keys.
 * - **Google** is written but gated: its client ids are still placeholders, so
 *   the button is hidden rather than offered and broken.
 * - **Email** sends a link. Nothing to choose, nothing to remember, nothing to
 *   reset, and no second field to mistype — the failure mode a password has on
 *   a phone keyboard is a support ticket, and the recovery flow for it is
 *   another email anyway. So the email IS the credential.
 *
 * One consequence worth naming: there is no sign-up call. `signInWithOtp` with
 * `shouldCreateUser` makes the account when the address is new and signs in when
 * it is not, so the two directions differ only in what the screen says.
 *
 * None of these create the profile — `on_auth_user_created` does, inside the
 * same transaction as the account, so a signed-in user always has rows to read.
 */

/** Where Supabase sends the browser once it has verified a login link. */
export function loginLinkRedirect(): string {
  return Linking.createURL('/auth/callback')
}

/**
 * Mails a login link, creating the account if the address is new.
 *
 * The project's redirect allow-list has to contain the app's scheme or Supabase
 * refuses the `emailRedirectTo` and falls back to `site_url`, which on a phone is
 * a web address nobody can act on.
 */
export async function sendLoginLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: loginLinkRedirect() },
  })
  if (error) throw error
}

/**
 * Turns a login link back into a session.
 *
 * The link in the mail goes to Supabase, which verifies the token and redirects
 * to the app's own scheme with the result on the end of it. Where exactly depends
 * on the flow the project is on, and that is a project setting rather than
 * something this code picks: implicit puts a pair of tokens in the fragment,
 * PKCE puts one code in the query string. Both are read.
 *
 * Returns false for a link carrying no session at all, because every other deep
 * link into the app arrives here too.
 */
export async function completeLoginFromUrl(url: string): Promise<boolean> {
  const params = paramsIn(url)

  // Supabase reports an expired or already-used link this way rather than by
  // refusing the redirect, so it has to be read before the tokens.
  const failure = params.get('error_description') ?? params.get('error')
  if (failure) throw new Error(failure.replace(/\+/g, ' '))

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
    return true
  }

  const code = params.get('code')
  if (!code) return false

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw error
  return true
}

/**
 * Every parameter in a deep link, from wherever it is hiding.
 *
 * Three places, and all three are real. The query string and the fragment,
 * because which one carries the session depends on the project's flow. And
 * inside a nested `url` parameter, because that is the shape `Linking.createURL`
 * produces under a development client — the real link is wrapped in one pointing
 * at the dev launcher, and without unwrapping it a login link can only be tested
 * in a release build.
 */
function paramsIn(url: string, depth = 0): URLSearchParams {
  const merged = new URLSearchParams()
  const [beforeFragment = '', fragment = ''] = url.split('#')

  for (const part of [beforeFragment.split('?')[1] ?? '', fragment]) {
    for (const [key, value] of new URLSearchParams(part)) merged.set(key, value)
  }

  const nested = merged.get('url')
  if (nested && depth === 0) {
    for (const [key, value] of paramsIn(nested, depth + 1)) merged.set(key, value)
  }

  return merged
}

/**
 * Whether this build can actually complete an Apple sign-in.
 *
 * `Platform.OS === 'ios'` was not enough, and the gap is not hypothetical: a
 * local simulator build (`pnpm ios`, APP_VARIANT=simulator) deliberately drops
 * the `com.apple.developer.applesignin` entitlement so it can compile without a
 * signing identity — see apps/mobile/app.config.ts. On that build the button
 * rendered, and tapping it failed inside Apple's own sheet with an error the
 * user could do nothing about.
 *
 * `isAvailableAsync` answers the OS-capability half. The entitlement half only
 * surfaces when the request is made, which is why `signInWithApple` also
 * translates that failure instead of letting the native message through.
 */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  return AppleAuthentication.isAvailableAsync()
}

/** Thrown when the build has no Apple Sign-In entitlement to use. */
export class AppleSignInUnavailable extends Error {
  constructor() {
    super('Apple sign-in is not available in this build. Use email instead.')
    this.name = 'AppleSignInUnavailable'
  }
}

export class SignInCancelled extends Error {
  constructor() {
    super('Sign in cancelled')
    this.name = 'SignInCancelled'
  }
}

export async function signInWithApple(): Promise<void> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })

    if (!credential.identityToken) throw new Error('Apple did not return an identity token')

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })
    if (error) throw error

    /**
     * Apple sends the name on the FIRST sign-in only, and never again. The
     * signup trigger reads it out of the token's metadata, which does not
     * carry it, so if we do not write it here it is gone for good — the
     * onboarding name step is the only other chance.
     */
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim()

    if (fullName) {
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ display_name: fullName })
          .eq('id', data.user.id)
          .is('display_name', null)
      }
    }
  } catch (error) {
    // The user closing the sheet is not an error to report; every other
    // failure is.
    const code = (error as { code?: string }).code
    if (code === 'ERR_REQUEST_CANCELED') {
      throw new SignInCancelled()
    }
    // A build with no entitlement fails here rather than at `isAvailableAsync`,
    // with a message written for a developer ("The operation couldn't be
    // completed. com.apple.AuthenticationServices.AuthorizationError 1000").
    // Say the useful thing instead: use email.
    if (code === 'ERR_REQUEST_UNKNOWN' || code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      throw new AppleSignInUnavailable()
    }
    throw error
  }
}

/**
 * Whether Google sign-in can work at all.
 *
 * The gate is the same one `startup.ts` uses for the other SDKs: a key still
 * set to the placeholder means the account was never provisioned, and showing
 * a button that cannot succeed is worse than showing one fewer option.
 */
export function googleSignInAvailable(): boolean {
  return (
    isConfigured(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) &&
    isConfigured(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
  )
}

export async function signInWithGoogle(): Promise<void> {
  if (!googleSignInAvailable()) {
    throw new Error('Google sign-in is not configured')
  }

  // Imported lazily: the module throws at import time on a build with no
  // google-services file, which is every build until the console side exists.
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin')

  GoogleSignin.configure({
    webClientId: env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  })

  await GoogleSignin.hasPlayServices()
  const response = await GoogleSignin.signIn()
  const idToken = response.data?.idToken
  if (!idToken) throw new SignInCancelled()

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
