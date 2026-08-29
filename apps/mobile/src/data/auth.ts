import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'

import { forgetPerson, type SignInMethod, track } from '@/lib/analytics'
import { env, isConfigured } from '@/lib/env'
import { appScheme } from '@/lib/scheme'
import { supabase } from '@/lib/supabase'

/**
 * Signing in.
 *
 * - **Apple** authenticates against the bundle id alone, so no Services ID and
 *   no six-monthly key rotation. The identity token goes straight to Supabase.
 * - **Google** is written but gated: its client ids are still placeholders, so
 *   the button is hidden rather than offered and broken.
 * - **Email**, which is a password or a code in the post.
 *
 * The mail leads with a six digit code, because a link is spent by whatever
 * reads the mail first (a corporate link scanner) and only works on the phone
 * the app is on.
 *
 * Everything reaching Supabase's mailer or password endpoints takes a
 * `captchaToken`, `undefined` on a build with no Turnstile key, so turning the
 * gate on is a configuration change.
 *
 * None of these create the profile. `on_auth_user_created` does, in the same
 * transaction as the account.
 */

/**
 * Where Supabase sends the browser once it has verified a login link.
 *
 * Built by hand rather than with `Linking.createURL`, which appends the Metro
 * dev-server host: `ricecal://localhost:8081/auth/callback` on a simulator
 * against `ricecal:///auth/callback` in a release. The URL in the mail has to be
 * identical everywhere. The scheme comes from `lib/scheme.ts`.
 */
export function loginLinkRedirect(): string {
  return `${appScheme()}://auth/callback`
}

/**
 * Where a password-reset link comes back to. Both links end in a session, but
 * only this one knows the person is in the middle of choosing a new password:
 * land them on `/today` and the reset is over before they typed anything.
 *
 * The path is the whole signal, read by `completeLoginFromUrl` and by
 * `app/auth/[action].tsx`.
 */
export function passwordResetRedirect(): string {
  return `${appScheme()}://auth/reset`
}

/**
 * What went wrong, in terms a screen can write a sentence about. Supabase's own
 * messages are written for a server log and were being shown verbatim. Every
 * call in this file throws one of these instead, keeping the original on
 * `cause` for Sentry.
 */
export type AuthProblemReason =
  /** The password does not match the address, or there is no such account. */
  | 'invalid_credentials'
  /** Right password, but the address was never confirmed. Recoverable: resend. */
  | 'email_not_confirmed'
  /** Signing up at an address that already has an account. */
  | 'account_exists'
  /**
   * The six digits were wrong, or belonged to an earlier mail, or expired. One
   * reason for all three, because the server answers 403 `otp_expired` to all
   * three: saying "it merely expired" would confirm to a stranger that the
   * address has an account.
   */
  | 'code_invalid'
  /** Shorter than the project's minimum, or otherwise refused. */
  | 'weak_password'
  /** The new password is the old one, which Supabase refuses on a reset. */
  | 'same_password'
  /** One mail a minute, and this was the second. Carries the wait. */
  | 'rate_limited'
  /** The captcha gate is on and this request arrived without a usable token. */
  | 'captcha'
  /** No connection, or the request never landed. */
  | 'offline'
  | 'unknown'

export class AuthProblem extends Error {
  constructor(
    readonly reason: AuthProblemReason,
    /** Seconds until the same request would be accepted. `rate_limited` only. */
    readonly retryAfter?: number,
    cause?: unknown,
  ) {
    super(reason)
    this.name = 'AuthProblem'
    this.cause = cause
  }
}

/**
 * How many seconds Supabase says to wait. There is no header and no field for
 * it: the number is in the sentence ("you can only request this after 47
 * seconds"), so this is a regex or it is a guess that shows a countdown ending
 * before the server agrees.
 */
function retryAfterIn(message: string): number | undefined {
  const seconds = message.match(/after (\d+) seconds?/i)?.[1]
  return seconds ? Number(seconds) : undefined
}

/**
 * Whether this is already one of ours. Branded rather than `instanceof`: Babel
 * rewrites a native subclass through `_wrapNativeSuper`, so the class identity
 * depends on which copy of this module the thrower and the checker got, which
 * is two under Jest the moment anything mocks `data/auth`. The failure is
 * silent, since every branch then falls through to `unknown`.
 */
function isAuthProblem(error: unknown): error is AuthProblem {
  const candidate = error as { name?: string; reason?: unknown } | null
  return candidate?.name === 'AuthProblem' && typeof candidate.reason === 'string'
}

/**
 * Supabase's answer, read once, in one place.
 *
 * Matched on `code` where there is one, since it is stable and the messages are
 * not. The message is the fallback for older errors that carry no code, and for
 * the rate limit, whose wait is only ever in the prose.
 */
export function asAuthProblem(error: unknown): AuthProblem {
  if (isAuthProblem(error)) return error

  const code = (error as { code?: string } | null)?.code
  const status = (error as { status?: number } | null)?.status
  const message = error instanceof Error ? error.message : String(error)

  const problem = (reason: AuthProblemReason, retryAfter?: number) =>
    new AuthProblem(reason, retryAfter, error)

  switch (code) {
    case 'invalid_credentials':
      return problem('invalid_credentials')
    case 'email_not_confirmed':
      return problem('email_not_confirmed')
    case 'user_already_exists':
    case 'email_exists':
      return problem('account_exists')
    // Returned for a code that is wrong as well as one that is old. See the
    // note on `code_invalid`.
    case 'otp_expired':
      return problem('code_invalid')
    case 'weak_password':
      return problem('weak_password')
    case 'same_password':
      return problem('same_password')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return problem('rate_limited', retryAfterIn(message))
    case 'captcha_failed':
      return problem('captcha')
  }

  // A 429 with no code is still a rate limit, and its wait is in the sentence.
  if (status === 429 || /you can only request this after/i.test(message)) {
    return problem('rate_limited', retryAfterIn(message))
  }
  // Belt and braces: `AuthError.code` is populated by every supabase-js this
  // project has shipped, but these are the two failures a person actually hits
  // and reporting either as `unknown` loses the sentence that says what to do.
  if (/invalid login credentials/i.test(message)) return problem('invalid_credentials')
  if (/email not confirmed/i.test(message)) return problem('email_not_confirmed')
  // An expired code and a wrong one arrive as the same error, since saying
  // which would confirm the address has an account.
  if (/token has expired or is invalid|invalid or has expired/i.test(message)) {
    return problem('code_invalid')
  }
  if (/captcha/i.test(message)) return problem('captcha')
  // `fetch` failing outright, which on a phone is almost always the signal.
  if (/network request failed|failed to fetch/i.test(message)) return problem('offline')

  return problem('unknown')
}

/**
 * Runs a Supabase call and rethrows whatever it says as an `AuthProblem`.
 *
 * Returns the whole `{ data, error }` rather than the data alone: every
 * supabase-js auth method answers with a discriminated union whose failure arm
 * has `null` where the success arm has a `User`, and a generic naming the data
 * cannot unify the two.
 */
async function attempt<R extends { error: unknown }>(work: () => Promise<R>): Promise<R> {
  let result: R
  try {
    result = await work()
  } catch (thrown) {
    // supabase-js rejects rather than resolving for a transport failure, which
    // is the offline case and the one this file must not report as `unknown`.
    throw asAuthProblem(thrown)
  }
  if (result.error) throw asAuthProblem(result.error)
  return result
}

/**
 * Mails a sign-in code, creating the account if the address is new.
 *
 * The mail carries a code and a link. `emailRedirectTo` is what makes the link
 * open this build: the project's redirect allow-list has to contain the app's
 * scheme, or Supabase drops the parameter and substitutes `site_url`.
 * `pnpm auth:config` owns both.
 */
export async function sendLoginLink(email: string, captchaToken?: string): Promise<void> {
  await attempt(() =>
    supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: loginLinkRedirect(),
        captchaToken,
      },
    }),
  )
  // The mail path is the one sign-in with a gap in the middle. Recording the
  // request separately from `Signed In` turns that gap into a number: how many
  // people ask for a link and never come back.
  track('Login Link Requested', {})
}

/**
 * What happened when an account was asked for. `confirm` is the ordinary answer
 * here, because email confirmations are on. `signed-in` is what a stack with
 * them off returns, handled rather than assumed away: the two differ by one
 * project setting.
 */
export type SignUpOutcome = 'signed-in' | 'confirm'

/**
 * Creates an account with a password.
 *
 * The hard part is the address that already has one, which Supabase will not
 * admit to: "that email is taken" would turn the form into an oracle for
 * whether somebody uses this app. With confirmations on it returns a
 * ordinary-looking success with `identities: []` and sends no mail, which read
 * naively marches the user to a code screen to wait for a mail that never
 * arrives.
 *
 * The empty identities array is the documented tell and the only one. The screen
 * does not announce the account either: it offers to sign in or to mail a code,
 * both of which are safe to offer a stranger.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<SignUpOutcome> {
  const { data } = await attempt(() =>
    supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: loginLinkRedirect(), captchaToken },
    }),
  )

  if (data.user && data.user.identities?.length === 0) {
    throw new AuthProblem('account_exists')
  }

  if (data.session) {
    await announceSignIn('password')
    return 'signed-in'
  }
  return 'confirm'
}

/**
 * Signs in with a password. Throws `email_not_confirmed` if the code is owed.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<void> {
  await attempt(() =>
    supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken },
    }),
  )
  await announceSignIn('password')
}

/**
 * Mails a password reset. Never says whether the address has an account, and
 * neither does the screen: Supabase answers the same way either way, and
 * reporting otherwise gives away the one thing it is careful not to.
 */
export async function sendPasswordReset(email: string, captchaToken?: string): Promise<void> {
  await attempt(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirect(),
      captchaToken,
    })
    return { data: null, error }
  })
  track('Password Reset Requested', {})
}

/**
 * Sends the confirmation mail again, for an account that never confirmed.
 *
 * Separate from `sendLoginLink` because it is a different template and a
 * different token. `signInWithOtp` on an unconfirmed account signs them in
 * without confirming the address, which leaves the row in a state the password
 * path then refuses.
 */
export async function resendConfirmation(email: string, captchaToken?: string): Promise<void> {
  await attempt(async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: loginLinkRedirect(), captchaToken },
    })
    return { data: null, error }
  })
}

/**
 * What a mailed code is for, which decides how Supabase verifies it. Each is a
 * different column on `auth.users` holding a different token, so asking about
 * the wrong one answers "invalid" for a perfectly good code.
 *
 * - `signup` confirms the address on an account just created with a password.
 * - `email` is the passwordless code, and reads either token: `signInWithOtp`
 *   gives a new address the signup token and a known one the magic-link token,
 *   without reporting which. Checked against the deployed project rather than
 *   assumed.
 * - `recovery` is the password reset, and the session it returns is the licence
 *   to call `updatePassword`.
 */
export type CodePurpose = 'signup' | 'email' | 'recovery'

/**
 * Turns six digits into a session, which is the path the emails lead with. A
 * link is spent by whatever fetches it first; a code cannot be consumed by
 * something reading the mail, and it works when the mail was opened on another
 * device.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: CodePurpose,
): Promise<void> {
  await attempt(() =>
    supabase.auth.verifyOtp({
      email: email.trim(),
      // A code read off a banner is pasted as often as typed, and the
      // clipboard brings the spaces with it.
      token: code.replace(/\s/g, ''),
      type: purpose,
    }),
  )

  // A recovery code is not a sign-in worth reporting: the person is halfway
  // through changing a password.
  if (purpose !== 'recovery') await announceSignIn('email')
}

/**
 * Sets the password on the account this session belongs to. The same call for
 * the end of a reset and for a signed-in user changing theirs. Supabase refuses
 * a password identical to the current one, which arrives as `same_password` and
 * on a reset means they have remembered the old one.
 */
export async function updatePassword(password: string): Promise<void> {
  await attempt(() => supabase.auth.updateUser({ password }))
}

/**
 * How fresh an account has to be for this sign-in to have created it. There is
 * no sign-up call to hang the distinction off, since `signInWithOtp` and
 * `signInWithIdToken` both create when the identity is new, so the only evidence
 * is the age of the row. A minute cannot overlap the two cases.
 */
const NEW_ACCOUNT_WINDOW_MS = 60_000

/**
 * Record a sign-in that actually happened. Deliberately not in the session
 * provider, where `identify` lives: Supabase announces `SIGNED_IN` whenever it
 * finds a usable token in the keychain, so counting that would report every
 * cold start as an acquisition.
 */
async function announceSignIn(method: SignInMethod): Promise<void> {
  /**
   * Wrapped, unlike every other `track`, because this one reads the session
   * first and sits on the success path of all three sign-ins. A rejection here
   * would come out of `completeLoginFromUrl`, which the link handler reads as
   * "that link had expired".
   */
  try {
    const { data } = await supabase.auth.getSession()
    const createdAt = data.session?.user.created_at
    const age = createdAt ? Date.now() - Date.parse(createdAt) : Number.NaN
    track('Signed In', {
      method,
      is_new_account: Number.isFinite(age) && age < NEW_ACCOUNT_WINDOW_MS,
    })
  } catch {
    // Better an unattributed sign-in than a sign-in reported as broken.
    track('Signed In', { method, is_new_account: false })
  }
}

/**
 * What a deep link turned out to be. Both `recovery` and `signed-in` end in a
 * session, but counting a reset as a sign-in would report an acquisition every
 * time somebody forgot a password.
 *
 * Where the person lands is the route's business (`app/auth/[action].tsx`):
 * this is called from outside the navigator, and a redirect chosen here would
 * race the root layout on a cold start from the mail.
 */
export type LinkOutcome = 'none' | 'signed-in' | 'recovery'

/**
 * Turns a login link back into a session.
 *
 * The link goes to Supabase, which verifies it and redirects to the app's
 * scheme with a one-time `?code=`. Under PKCE the trade only succeeds with the
 * verifier this install generated, so a code lifted from a mail or a link
 * forwarded to another device is inert.
 *
 * A token pair in the URL is deliberately ignored. This once called `setSession`
 * with whatever was in the fragment, which made any `ricecal://` link a login:
 * an attacker mails a link carrying their own tokens, and the victim's next
 * meals and weigh-ins land in rows the attacker reads back.
 *
 * Returns `none` for a link carrying no session, since every other deep link
 * arrives here too.
 */
export async function completeLoginFromUrl(url: string): Promise<LinkOutcome> {
  const params = paramsIn(url)

  // Supabase reports an expired or already-used link this way rather than by
  // refusing the redirect, so it has to be read before the code.
  const failure = params.get('error_description') ?? params.get('error')
  if (failure) throw asAuthProblem(new Error(failure.replace(/\+/g, ' ')))

  /**
   * Whether this link was a password reset, told by its path. Both kinds come
   * back as a code that ends in a session, so only the redirect
   * `sendPasswordReset` chose can tell them apart. Read as a sign-in, a reset
   * carries the user off to Today with the old password still in force.
   */
  const recovery = /\/auth\/reset\b/.test(url)
  const outcome: LinkOutcome = recovery ? 'recovery' : 'signed-in'

  const code = params.get('code')
  if (!code) return 'none'

  await attempt(() => supabase.auth.exchangeCodeForSession(code))
  if (!recovery) await announceSignIn('email')
  return outcome
}

/**
 * Every parameter in a deep link, from wherever it is hiding: the query string
 * and the fragment, since PKCE puts the `code` in the query and an error in
 * either.
 *
 * Also one level inside a `url` parameter, because the Expo dev launcher hands
 * the app a wrapper with the real link nested in it. Our own redirect never
 * arrives wrapped, so this is belt and braces.
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
 * `Platform.OS === 'ios'` was not enough: a simulator build drops the
 * `com.apple.developer.applesignin` entitlement so it can compile without a
 * signing identity, and the button then failed inside Apple's own sheet.
 *
 * `isAvailableAsync` answers the OS half. The entitlement half only surfaces
 * when the request is made, which is why `signInWithApple` translates that
 * failure too.
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

    // Apple sends the name on the first sign-in only. The signup trigger reads
    // the token's metadata, which does not carry it, so not writing it here
    // loses it for good; the onboarding name step is the only other chance.
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
    // The user closing the sheet is not an error to report; every other failure is.
    const code = (error as { code?: string }).code
    if (code === 'ERR_REQUEST_CANCELED') {
      // Tracked, unlike most cancellations: backing out of Apple's sheet is the
      // biggest drop in this funnel and is invisible everywhere else.
      track('Sign In Failed', { method: 'apple', reason: 'cancelled' })
      throw new SignInCancelled()
    }
    // A build with no entitlement fails here rather than at `isAvailableAsync`,
    // with a message written for a developer. Say the useful thing: use email.
    if (code === 'ERR_REQUEST_UNKNOWN' || code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      track('Sign In Failed', { method: 'apple', reason: 'unavailable' })
      throw new AppleSignInUnavailable()
    }
    track('Sign In Failed', { method: 'apple', reason: 'error' })
    throw error
  }

  // Outside the try, so the two events cannot both fire for one attempt: the
  // catch covers the profile write as well as the sign-in.
  await announceSignIn('apple')
}

/**
 * Whether Google sign-in can work at all. The same gate `startup.ts` uses for
 * the other SDKs: a placeholder key means the account was never provisioned,
 * and a button that cannot succeed is worse than one fewer option.
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
  if (!idToken) {
    track('Sign In Failed', { method: 'google', reason: 'cancelled' })
    throw new SignInCancelled()
  }

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
  if (error) {
    track('Sign In Failed', { method: 'google', reason: 'error' })
    throw error
  }
  await announceSignIn('google')
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  // Before the provider's own `reset`, which the `SIGNED_OUT` event triggers a
  // tick later, so this event is still filed against the account it is about.
  track('Signed Out', {})
}

/**
 * Delete the account, and everything attached to it.
 *
 * App Review guideline 5.1.1(v): an app that creates accounts must let somebody
 * delete one from inside it. The `delete-account` function sweeps the user's
 * photographs out of R2 and deletes the `auth.users` row, which every table
 * cascades off. This is what the phone does afterwards.
 *
 * The sign-out has to be local: the user the token names no longer exists, so a
 * global sign-out asks GoTrue to end the sessions of a user it cannot find and
 * answers an error onto a screen whose work succeeded.
 *
 * `SIGNED_OUT` does the rest in `SessionProvider`: the query cache, the pictures
 * on disk, the pending snaps, RevenueCat's identity and Mixpanel's.
 *
 * Order matters twice. The event and the profile delete go before the sign-out,
 * because both are filed against whoever the SDK thinks it is holding. All of it
 * goes after the server has answered, because until then nothing is deleted.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
    'delete-account',
    { body: { confirm: true } },
  )
  // `invoke` reports a non-2xx as an error with an unread body, so the
  // transport failure and a 200 that says no are checked separately.
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'delete-account refused')

  track('Account Deleted', {})
  forgetPerson()
  await supabase.auth.signOut({ scope: 'local' })
}
