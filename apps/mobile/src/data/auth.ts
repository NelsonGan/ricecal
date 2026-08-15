import * as AppleAuthentication from 'expo-apple-authentication'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { type SignInMethod, track } from '@/lib/analytics'
import { env, isConfigured } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * Signing in.
 *
 * Three ways in, in the order they matter on a phone:
 *
 * - **Apple** is the native flow. It authenticates against the bundle id
 *   alone, which is why no Services ID or six-monthly key rotation is needed;
 *   the identity token goes straight to Supabase, which verifies it against
 *   Apple's keys.
 * - **Google** is written but gated: its client ids are still placeholders, so
 *   the button is hidden rather than offered and broken.
 * - **Email**, which is now two things rather than one: a password, or a code
 *   in the post.
 *
 * THE EMAIL PATH USED TO BE A LINK AND NOTHING ELSE, and the argument for that
 * was good as far as it went: nothing to remember, nothing to reset, no second
 * field to mistype. What it did not survive is the rest of the world. A link is
 * consumed by whatever reads the mail first, which for anybody on a corporate
 * address is their employer's link scanner, so the mail arrives already spent
 * and the app says it expired. And a link only works when the mail is opened on
 * the phone the app is on, which is not where most people read mail.
 *
 * So the mail now carries a SIX DIGIT CODE, in the subject line as well as the
 * body, and the app has a screen that takes it. The link is still there and
 * still works; it is the second offer rather than the only one. Nothing can
 * consume a code by reading a mailbox.
 *
 * And a password is offered because the alternative to remembering one turned
 * out to be waiting for an email EVERY TIME, which is the worse deal for
 * somebody opening a diary daily. It is optional in the strict sense: an
 * account made with a code has no password until it sets one, and one made with
 * a password can still ask for a code.
 *
 * Everything that reaches Supabase's mailer or its password endpoints takes a
 * `captchaToken`, which is `undefined` on a build with no Turnstile key. See
 * `features/auth/turnstile.tsx` — the argument exists at every call site so
 * that turning the gate on is a configuration change rather than a code change.
 *
 * None of these create the profile — `on_auth_user_created` does, inside the
 * same transaction as the account, so a signed-in user always has rows to read.
 */

/**
 * Where Supabase sends the browser once it has verified a login link.
 *
 * Built by hand rather than with `Linking.createURL`, which is the obvious choice
 * and the wrong one. `createURL` appends the Metro dev-server host to the
 * authority in a development build, so it returns
 * `ricecal://localhost:8081/auth/callback` on a simulator and
 * `ricecal:///auth/callback` in a release — a link that reads as broken when it
 * arrives, and a redirect that has to be allow-listed twice.
 *
 * Expo says as much in `createURL`'s own docs: for authorization callbacks, use a
 * build and provide the scheme. This is a fixed string for the same reason the
 * allow-list needs one — the URL in the mail must be identical everywhere, since
 * it is a stranger's mail client that opens it, and nothing there knows which
 * build sent it.
 *
 * The scheme is read off the resolved config rather than written here, because
 * the development build is a separate app with its own (`ricecal-dev`) — two apps
 * registering `ricecal://` on one phone is undefined behaviour, and the loser is
 * whichever one the login link was meant for. `Constants.expoConfig` is the same
 * object app.config.ts returned, and native registers the scheme at build time
 * from it, so the two cannot drift without a rebuild. The fallback is for the
 * test environment, where there is no embedded manifest to read.
 */
function scheme(): string {
  const declared = Constants.expoConfig?.scheme
  return (Array.isArray(declared) ? declared[0] : declared) ?? 'ricecal'
}

export function loginLinkRedirect(): string {
  return `${scheme()}://auth/callback`
}

/**
 * Where a password-reset link comes back to, and why it is not the one above.
 *
 * Both end in a session, so either path COULD land on the callback. What only
 * this one knows is that the person who opened it is in the middle of choosing
 * a new password: land them on `/today` with a session and the reset is over
 * before they typed anything, and the password they were resetting is still the
 * one they could not remember. The path is the whole signal — see
 * `completeLoginFromUrl`, which reads it.
 */
export function passwordResetRedirect(): string {
  return `${scheme()}://auth/reset`
}

/**
 * WHAT WENT WRONG, in terms a screen can write a sentence about.
 *
 * Supabase's own messages are written for whoever is reading a server log:
 * "Invalid login credentials", "For security purposes, you can only request
 * this after 47 seconds", "Email link is invalid or has expired". They were
 * being shown to users verbatim, which was survivable while the only failure
 * was a stale link and is not now that there are passwords, codes, resends and
 * a rate limit in the way.
 *
 * So every call in this file throws one of these instead, and the screens
 * translate the `reason`. The original is kept on `cause` for Sentry, because
 * a reason of `unknown` with nothing under it is a bug report nobody can act
 * on.
 */
export type AuthProblemReason =
  /** The password does not match the address, or there is no such account. */
  | 'invalid_credentials'
  /** Right password, but the address was never confirmed. Recoverable: resend. */
  | 'email_not_confirmed'
  /** Signing up at an address that already has an account. */
  | 'account_exists'
  /**
   * The six digits were wrong, or belonged to an earlier mail, or expired.
   *
   * ONE REASON FOR ALL THREE, because the server gives one answer for all
   * three: a wrong code and an expired one both come back 403 `otp_expired`,
   * "Token has expired or is invalid". That is deliberate on Supabase's part —
   * "it merely expired" would confirm to a stranger that the address has an
   * account — so a reason called `code_expired` could only ever be a guess
   * dressed as a fact, and its copy would tell somebody who mistyped to go and
   * wait for a new mail.
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
 * How many seconds Supabase says to wait, out of a message written in prose.
 *
 * There is no header and no field for it: the number lives in the sentence
 * ("you can only request this after 47 seconds"), so this is a regex over a
 * message or it is a fixed guess that is wrong in both directions. A guess of
 * 60 shows a countdown that ends before the server agrees, and the resend fails
 * again in front of somebody who waited exactly as long as they were told.
 */
function retryAfterIn(message: string): number | undefined {
  const seconds = message.match(/after (\d+) seconds?/i)?.[1]
  return seconds ? Number(seconds) : undefined
}

/**
 * Whether this is already one of ours.
 *
 * BRANDED RATHER THAN `instanceof`, and that is not fussiness. `AuthProblem`
 * extends `Error`, Babel rewrites a native subclass through `_wrapNativeSuper`,
 * and the identity of the class then depends on which copy of this module the
 * thrower and the checker each got — which is one copy in the app and can be
 * two under Jest the moment anything mocks `data/auth`. The failure is silent
 * and it is the worst kind: every branch falls through to `unknown`, so the
 * screens go on working and say "something went wrong" for errors they have
 * exact sentences for.
 */
function isAuthProblem(error: unknown): error is AuthProblem {
  const candidate = error as { name?: string; reason?: unknown } | null
  return candidate?.name === 'AuthProblem' && typeof candidate.reason === 'string'
}

/**
 * Supabase's answer, read once, in one place.
 *
 * Matched on `code` where there is one — it is stable, and the messages are
 * not — with the message as the fallback for the older errors that carry no
 * code and for the rate limit, whose wait is only ever in the prose.
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
    // Returned for a code that is WRONG as well as one that is old. See the
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
  // An expired code and a wrong one arrive as the same error from an endpoint
  // that will not say which — deliberately, since telling an attacker that the
  // code merely expired confirms the address has an account. `code_invalid`
  // covers both, and its copy says so.
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
 * Returns the whole `{ data, error }` rather than just the data, because every
 * supabase-js auth method answers with a DISCRIMINATED UNION — the success arm
 * has a `User`, the failure arm has `null` in the same place — and a generic
 * that tries to name the data alone cannot unify the two. Handing back the
 * result keeps the inference trivial and costs the caller one destructure.
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
 * The mail carries both halves. `emailRedirectTo` is what makes the LINK in it
 * open this build rather than a web page: the project's redirect allow-list has
 * to contain the app's scheme or Supabase drops the parameter and substitutes
 * `site_url` — which is why the hosted project's empty allow-list and its
 * `http://localhost:3000` site URL were one bug rather than two, and why
 * `pnpm auth:config` now owns both.
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
  // The mail path is the one sign-in with a gap in the middle of it — the link
  // is opened in another app, minutes later, on a device that may not be this
  // one. Recording the request separately from `Signed In` is what turns that
  // gap into a number: how many people ask for a link and never come back.
  track('Login Link Requested', {})
}

/**
 * What happened when an account was asked for.
 *
 * `confirm` is the ordinary answer on this project, because email confirmations
 * are on: the account exists, nobody is signed in, and a code is in the post.
 * `signed-in` is what a stack with confirmations off returns, and the screens
 * handle it rather than assuming — the two differ by one project setting and
 * the flow must not break the day somebody flips it.
 */
export type SignUpOutcome = 'signed-in' | 'confirm'

/**
 * Creates an account with a password.
 *
 * THE HARD PART IS THE ADDRESS THAT ALREADY HAS AN ACCOUNT, and Supabase will
 * not say so. Answering "that email is taken" turns a signup form into an
 * oracle for whether a given person uses this app, so with confirmations on it
 * returns a perfectly ordinary-looking success: a user object, no session, and
 * `identities: []`. No mail is sent. Read naively that is indistinguishable
 * from a fresh signup, and the user is marched to a code screen to wait for a
 * mail that will never arrive.
 *
 * The empty identities array is the documented tell, and it is the only one.
 * What the screen does with it is the honest half: it does not announce that
 * the account exists either, it offers to sign in or to mail a code, both of
 * which are safe to offer to a stranger and both of which get the real owner
 * where they were going.
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

/** Signs in with a password. Throws `email_not_confirmed` if the code is owed. */
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
 * Mails a password reset.
 *
 * Never says whether the address has an account, and neither does the screen
 * that calls it: Supabase answers the same way either way, and a screen that
 * reported "no account with that address" would give away the one thing this
 * endpoint is careful not to.
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
 * different token: `signInWithOtp` on an unconfirmed account signs them in
 * without ever confirming the address, which leaves the row in a state the
 * password path then refuses.
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
 * What a mailed code is FOR, which decides how Supabase verifies it.
 *
 * Not cosmetic. Each of these is a different column on `auth.users` holding a
 * different token, and asking about the wrong one answers "invalid" for a code
 * that is perfectly good:
 *
 * - `signup` confirms the address on an account just created with a password.
 * - `email` is the passwordless code, and covers BOTH halves of what
 *   `signInWithOtp` does — a new address gets the signup token, a known one
 *   gets the magic-link token, and the caller cannot tell which because
 *   `shouldCreateUser` deliberately does not report it. This is the one type
 *   that reads either, which was checked against the deployed project rather
 *   than assumed: a brand new address stores its code in `confirmation_token`
 *   with `recovery_token` empty, and verifying it as `email` both returns a
 *   session and sets `email_confirmed_at`.
 * - `recovery` is the password reset, and the session it returns is the licence
 *   to call `updatePassword`.
 */
export type CodePurpose = 'signup' | 'email' | 'recovery'

/**
 * Turns six digits into a session.
 *
 * This is the path the emails now lead with, and the reason is in
 * `apps/supabase/templates/README.md`: a link is spent by whatever fetches it
 * first, and on a corporate address that is the employer's scanner rather than
 * the person. A code cannot be consumed by something reading the mail, and it
 * works when the mail was opened on a different device from the app.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: CodePurpose,
): Promise<void> {
  await attempt(() =>
    supabase.auth.verifyOtp({
      email: email.trim(),
      // Whitespace, because a code read off a banner is pasted as often as it
      // is typed and the clipboard brings the spaces with it.
      token: code.replace(/\s/g, ''),
      type: purpose,
    }),
  )

  // A recovery code is not a sign-in worth reporting: the person is halfway
  // through changing a password and is about to be asked for the new one. The
  // event that matters there is the password write, not this.
  if (purpose !== 'recovery') await announceSignIn('email')
}

/**
 * Sets the password on the account this session belongs to.
 *
 * Used from two places and it is the same call in both: the end of a reset,
 * where the session came from a recovery code, and a signed-in user changing
 * their password. Supabase refuses a password identical to the current one,
 * which arrives as `same_password` and is worth its own sentence — on a reset
 * it means they have remembered the old one, which is a different situation
 * from having typed something too short.
 */
export async function updatePassword(password: string): Promise<void> {
  await attempt(() => supabase.auth.updateUser({ password }))
}

/**
 * How fresh an account has to be for this sign-in to have CREATED it.
 *
 * There is no sign-up call to hang the distinction off — `signInWithOtp` and
 * `signInWithIdToken` both make the account when the identity is new and sign
 * in when it is not — so the only evidence available is the age of the row.
 * A minute is far longer than any of these three flows takes and far shorter
 * than any plausible second sign-in, so the two cases cannot overlap.
 */
const NEW_ACCOUNT_WINDOW_MS = 60_000

/**
 * Record a sign-in that actually happened.
 *
 * Deliberately NOT in the session provider, which is where `identify` lives.
 * That one fires on every launch with a restored session — supabase announces
 * `SIGNED_IN` whenever it finds a usable token in the keychain — so counting it
 * as a sign-in would report a returning user's every cold start as an
 * acquisition. These three call sites are the moments a person signed in.
 */
async function announceSignIn(method: SignInMethod): Promise<void> {
  /**
   * WRAPPED, and this is the one place in the tracking plan where it matters.
   *
   * Every other `track` is a call into a module that cannot throw. This one
   * reads the session first, to find out whether the account was just created,
   * and it sits on the success path of all three sign-ins — so a rejection here
   * would come out of `completeLoginFromUrl`, which the link handler reads as
   * "that link had expired". A property on a report is not worth a sign-in that
   * says it failed after it worked.
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
 * What a deep link turned out to be.
 *
 * `recovery` is not a flavour of `signed-in`, and the difference is the whole
 * reason this returns three things rather than a boolean. Both end in a
 * session; only one of them means the person is still halfway through changing
 * a password. Treated as an ordinary sign-in, the reset link drops them on
 * Today with everything working, and the password they could not remember is
 * still the password.
 */
export type LinkOutcome = 'none' | 'signed-in' | 'recovery'

/**
 * Turns a login link back into a session.
 *
 * The link in the mail goes to Supabase, which verifies the token and redirects
 * to the app's own scheme with the result on the end of it. Where exactly depends
 * on the flow the project is on, and that is a project setting rather than
 * something this code picks: implicit puts a pair of tokens in the fragment,
 * PKCE puts one code in the query string. Both are read.
 *
 * Returns `none` for a link carrying no session at all, because every other deep
 * link into the app arrives here too.
 */
export async function completeLoginFromUrl(url: string): Promise<LinkOutcome> {
  const params = paramsIn(url)

  // Supabase reports an expired or already-used link this way rather than by
  // refusing the redirect, so it has to be read before the tokens.
  const failure = params.get('error_description') ?? params.get('error')
  if (failure) throw asAuthProblem(new Error(failure.replace(/\+/g, ' ')))

  /**
   * Whether this link was a password reset, asked TWO ways because neither is
   * reliable on its own.
   *
   * Supabase puts `type=recovery` on the redirect in the implicit flow and
   * nothing at all in PKCE, where the type is inside the code it exchanges. So
   * the path carries it too: `sendPasswordReset` asks to come back to
   * `ricecal://auth/reset` rather than `/auth/callback`, and that is ours to
   * choose and cannot be dropped by a flow change.
   */
  const recovery = params.get('type') === 'recovery' || /\/auth\/reset\b/.test(url)
  const outcome: LinkOutcome = recovery ? 'recovery' : 'signed-in'

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    await attempt(() =>
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
    )
    if (!recovery) await announceSignIn('email')
    return outcome
  }

  const code = params.get('code')
  if (!code) return 'none'

  await attempt(() => supabase.auth.exchangeCodeForSession(code))
  if (!recovery) await announceSignIn('email')
  return outcome
}

/**
 * Every parameter in a deep link, from wherever it is hiding.
 *
 * The query string and the fragment both, because which one carries the session
 * depends on the project's flow rather than on anything this code picks: implicit
 * puts a token pair in the fragment, PKCE a code in the query.
 *
 * And one level inside a `url` parameter, because a launcher can hand the app a
 * wrapper pointing at itself with the real link nested in it — the Expo dev
 * launcher does exactly that. Our own redirect is a plain `ricecal://` URL and
 * never arrives wrapped, so this is belt and braces; it costs four lines and
 * turns "the link silently does nothing" into a working sign-in.
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
      // Tracked, unlike most cancellations, because backing out of Apple's own
      // sheet is the single biggest drop in this funnel and it is invisible
      // everywhere else: nothing is thrown to Sentry and nothing reaches the
      // database.
      track('Sign In Failed', { method: 'apple', reason: 'cancelled' })
      throw new SignInCancelled()
    }
    // A build with no entitlement fails here rather than at `isAvailableAsync`,
    // with a message written for a developer ("The operation couldn't be
    // completed. com.apple.AuthenticationServices.AuthorizationError 1000").
    // Say the useful thing instead: use email.
    if (code === 'ERR_REQUEST_UNKNOWN' || code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      track('Sign In Failed', { method: 'apple', reason: 'unavailable' })
      throw new AppleSignInUnavailable()
    }
    track('Sign In Failed', { method: 'apple', reason: 'error' })
    throw error
  }

  // OUTSIDE the try, so the two events cannot both fire for one attempt. The
  // catch above turns anything thrown in there into a `Sign In Failed`, and it
  // covers the profile write as well as the sign-in itself — so a success
  // announced from inside it would be a sign-in reported as both.
  await announceSignIn('apple')
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
  // tick later — so this event is still filed against the account it is about.
  track('Signed Out', {})
}
