import { completeLoginFromUrl, loginLinkRedirect } from '../auth'

/**
 * Reading a session back out of a login link.
 *
 * Worth its own suite because the tokens are not in one predictable place. Which
 * half of the URL carries them depends on the project's auth flow — implicit puts
 * a pair in the fragment, PKCE puts a code in the query — and a development
 * client wraps the whole link inside a `url` parameter of its own. Getting any of
 * those wrong looks identical from the outside: the user taps the link in the mail
 * and the app opens signed out.
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

it('takes the token pair from the fragment', async () => {
  const done = await completeLoginFromUrl(
    'ricecal://auth/callback#access_token=abc&refresh_token=def&token_type=bearer',
  )

  expect(done).toBe(true)
  expect(supabase.auth.setSession).toHaveBeenCalledWith({
    access_token: 'abc',
    refresh_token: 'def',
  })
})

it('takes them from the query string too', async () => {
  await completeLoginFromUrl('ricecal://auth/callback?access_token=abc&refresh_token=def')

  expect(supabase.auth.setSession).toHaveBeenCalledWith({
    access_token: 'abc',
    refresh_token: 'def',
  })
})

/**
 * The shape `Linking.createURL` produces under a development client: the real
 * link is wrapped in one pointing at the dev launcher. Without unwrapping it, a
 * login link can only be tested in a release build.
 */
it('finds them inside a development client wrapper', async () => {
  const inner = encodeURIComponent('http://127.0.0.1:8081/#access_token=abc&refresh_token=def')
  await completeLoginFromUrl(`exp+ricecal://expo-development-client/?url=${inner}`)

  expect(supabase.auth.setSession).toHaveBeenCalledWith({
    access_token: 'abc',
    refresh_token: 'def',
  })
})

it('exchanges a PKCE code when that is what arrives', async () => {
  const done = await completeLoginFromUrl('ricecal://auth/callback?code=one-time-code')

  expect(done).toBe(true)
  expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code')
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
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
  ).rejects.toThrow('Email link is invalid or has expired')

  expect(supabase.auth.setSession).not.toHaveBeenCalled()
})

it('ignores a deep link that is not a login at all', async () => {
  const done = await completeLoginFromUrl('ricecal://log/food/123')

  expect(done).toBe(false)
  expect(supabase.auth.setSession).not.toHaveBeenCalled()
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled()
})

it('passes a setSession failure on', async () => {
  supabase.auth.setSession.mockResolvedValue({ data: {}, error: new Error('Invalid token') })

  await expect(
    completeLoginFromUrl('ricecal://auth/callback#access_token=abc&refresh_token=def'),
  ).rejects.toThrow('Invalid token')
})
