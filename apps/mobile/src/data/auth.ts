import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'

import { env, isConfigured } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * Signing in.
 *
 * Three providers, in the order they matter on a phone:
 *
 * - **Apple** is the native flow. It authenticates against the bundle id
 *   alone, which is why no Services ID or six-monthly key rotation is needed;
 *   the identity token goes straight to Supabase, which verifies it against
 *   Apple's keys.
 * - **Email** is the fallback that always works and the only one that works on
 *   Android today.
 * - **Google** is written but gated: its client ids are still placeholders, so
 *   the button is hidden rather than offered and broken.
 *
 * None of these create the profile — `on_auth_user_created` does, inside the
 * same transaction as the account, so a signed-in user always has rows to read.
 */

export type SignUpResult =
  | { status: 'signed-in' }
  /** The project requires a confirmation click before a session exists. */
  | { status: 'check-your-email'; email: string }

export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error) throw error

  // A signup with confirmations on returns a user and no session. That is not
  // a failure, and treating it as one is how an app ends up telling people
  // their correct password is wrong.
  return data.session ? { status: 'signed-in' } : { status: 'check-your-email', email }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
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

/** Sends a password reset mail. The link opens the app through the scheme. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'ricecal://reset-password',
  })
  if (error) throw error
}
