import { completeLoginFromUrl, loginLinkRedirect, passwordResetRedirect } from '../auth'

/**
 * Reading a session back out of a login link.
 *
 * Worth its own suite because the code is not in one predictable place: PKCE puts
 * it in the query, and a development client wraps the whole link inside a `url`
 * parameter of its own. Getting that wrong looks identical from the outside — the
 * user taps the link in the mail and the app opens signed out. The suite also
 * pins the security half: a link carrying a ready-made token pair is IGNORED, not
 * turned into a session, so a forwarded or forged link cannot log the app in.
 */

// Imported at the top of the module under test, and it reaches for a native view
// manager the moment it loads. Nothing here signs in with Apple.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}))

jest.mock('expo-linking', () => ({ createURL: (path: string) => `ricecal://${path}` }))

// Stands in for the embedded manifest. Mutable because the whole point of reading
// the scheme from it is that the development build carries a different one.
const expoConfig: { scheme?: string | string[] } = { scheme: 'ricecal' }
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return { expoConfig }
  },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: { auth: { setSession: jest.Mock; exchangeCodeForSession: jest.Mock } }
}

beforeEach(() => {
  jest.clearAllMocks()
  expoConfig.scheme = 'ricecal'
  supabase.auth.setSession.mockResolvedValue({ data: {}, error: null })
  supabase.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
})

/**
 * The redirect has to name the build that asked for it. Both apps can be
 * installed at once, so a link back to `ricecal://` from the development build
 * opens the store build — signed in as nobody, on the wrong data.
 */
it('sends the login link back to the scheme this build registered', () => {
  expect(loginLinkRedirect()).toBe('ricecal://auth/callback')

  expoConfig.scheme = 'ricecal-dev'
  expect(loginLinkRedirect()).toBe('ricecal-dev://auth/callback')
})

it('falls back to the release scheme when there is no manifest to read', () => {
  expoConfig.scheme = undefined
  expect(loginLinkRedirect()).toBe('ricecal://auth/callback')
})

/**
 * The security assertion the whole PKCE switch exists for. A link carrying a
 * ready-to-use token pair — the implicit flow's shape, and the shape an attacker
 * can mint from their own account — must NOT become a session. Read as a login,
 * one such link mailed to a victim signs their app into the attacker's account.
 * With no code to exchange, this is just an unrecognised deep link.
 */
it('ignores a token pair in the fragment', async () => {
  const done = await completeLoginFromUrl(
    'ricecal://auth/callback#access_token=abc&refresh_token=def&token_type=bearer',
  )

  expect(done).toBe('none')
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled()
})

it('ignores a token pair in the query string too', async () => {
  const done = await completeLoginFromUrl(
    'ricecal://auth/callback?access_token=abc&refresh_token=def',
  )

  expect(done).toBe('none')
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
})

it('exchanges a PKCE code when that is what arrives', async () => {
  const done = await completeLoginFromUrl('ricecal://auth/callback?code=one-time-code')

  expect(done).toBe('signed-in')
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code')
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
})

/**
 * The shape `Linking.createURL` produces under a development client: the real
 * link is wrapped in one pointing at the dev launcher. Without unwrapping it, a
 * login link can only be tested in a release build.
 */
it('finds the code inside a development client wrapper', async () => {
  const inner = encodeURIComponent('http://127.0.0.1:8081/?code=one-time-code')
  await completeLoginFromUrl(`exp+ricecal://expo-development-client/?url=${inner}`)

  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code')
})

/**
 * An expired link is reported in the URL rather than by refusing the redirect, so
 * it has to be read before the tokens or it looks like a link carrying nothing.
 */
it('reports an expired link', async () => {
  await expect(
    completeLoginFromUrl(
      'ricecal://auth/callback#error=access_denied&error_description=Email+link+is+invalid+or+has+expired',
    ),
  ).rejects.toMatchObject({ reason: 'code_invalid' })

  expect(supabase.auth.setSession).not.toHaveBeenCalled()
})

it('ignores a deep link that is not a login at all', async () => {
  const done = await completeLoginFromUrl('ricecal://log/food/123')

  expect(done).toBe('none')
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled()
})

it('passes a code-exchange failure on', async () => {
  supabase.auth.exchangeCodeForSession.mockResolvedValue({
    data: {},
    error: new Error('Invalid token'),
  })

  await expect(
    completeLoginFromUrl('ricecal://auth/callback?code=one-time-code'),
  ).rejects.toMatchObject({ name: 'AuthProblem', reason: 'unknown' })
})

/**
 * A RESET LINK IS NOT A SIGN-IN, and the whole of the difference is here.
 *
 * Both produce a session, so read as a sign-in the reset lands the user on
 * Today with everything working and the password they came to change still in
 * force. PKCE carries no `type` on the redirect, so `sendPasswordReset` asks to
 * come back to a path of its own and the path is what tells them apart.
 */
it('knows a password reset from a sign-in, by its path', async () => {
  const outcome = await completeLoginFromUrl('ricecal://auth/reset?code=one-time-code')

  expect(outcome).toBe('recovery')
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code')
})

/**
 * The reset redirect has to name this build too, for the reason the callback
 * does: both apps can be installed at once.
 */
it('sends a reset back to a path of its own', () => {
  expect(passwordResetRedirect()).toBe('ricecal://auth/reset')

  expoConfig.scheme = 'ricecal-dev'
  expect(passwordResetRedirect()).toBe('ricecal-dev://auth/reset')
})
