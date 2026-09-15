import { completeGoogleSignIn } from '../auth'

/**
 * The two Google tokens travel together.
 *
 * Google's identity token carries an `at_hash`, so Supabase needs the access
 * token to verify that the two belong to the same sign-in. GoTrue still allowed
 * the identity token alone when this was added, but logged a warning for every
 * login and announced that the access token would become mandatory.
 */

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

const mockGoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(),
  signIn: jest.fn(),
  getTokens: jest.fn(),
}

jest.mock('@/lib/env', () => ({
  env: {
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client-id',
  },
  isConfigured: (value: string) => Boolean(value),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'ricecal' } },
}))

jest.mock('@/lib/analytics', () => ({
  forgetPerson: jest.fn(),
  track: jest.fn(),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
      getSession: jest.fn(),
    },
  },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: {
    auth: {
      signInWithIdToken: jest.Mock
      getSession: jest.Mock
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGoogleSignin.hasPlayServices.mockResolvedValue(true)
  mockGoogleSignin.signIn.mockResolvedValue({
    type: 'success',
    data: { idToken: 'sign-in-id-token' },
  })
  mockGoogleSignin.getTokens.mockResolvedValue({
    idToken: 'current-id-token',
    accessToken: 'google-access-token',
  })
  supabase.auth.signInWithIdToken.mockResolvedValue({ data: {}, error: null })
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
})

it('gives Supabase the access token that verifies the identity token', async () => {
  await completeGoogleSignIn(mockGoogleSignin)

  expect(mockGoogleSignin.getTokens).toHaveBeenCalledTimes(1)
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
    provider: 'google',
    token: 'current-id-token',
    access_token: 'google-access-token',
  })
})
