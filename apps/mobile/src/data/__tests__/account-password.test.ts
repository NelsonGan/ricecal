import {
  changeAccountPassword,
  hasAccountPassword,
  resetAccountPassword,
  sendAccountPasswordCode,
} from '../account-password'

const mockRpc = jest.fn()
const mockGetUser = jest.fn()
const mockGetSession = jest.fn()
const mockUpdate = jest.fn()
const mockSignIn = jest.fn()
const mockSignOut = jest.fn()
const mockCreate = jest.fn()
const mockVerify = jest.fn()
const mockSendReset = jest.fn()
jest.mock('@/lib/env', () => ({
  env: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.test',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public',
  },
}))
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreate(...args),
}))
jest.mock('../auth', () => ({
  AuthProblem: class extends Error {
    reason: string
    constructor(reason: string) {
      super(reason)
      this.reason = reason
    }
  },
  asAuthProblem: (error: unknown) => error,
  sendPasswordReset: (...args: unknown[]) => mockSendReset(...args),
}))

beforeEach(() => {
  jest.resetAllMocks()
  mockRpc.mockResolvedValue({ data: true, error: null })
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'owner', email: 'owner@example.test' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null })
  mockUpdate.mockResolvedValue({ error: null })
  mockSignIn.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mockSignOut.mockResolvedValue({ error: null })
  mockVerify.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mockSendReset.mockResolvedValue(undefined)
  mockCreate.mockReturnValue({
    auth: { signInWithPassword: mockSignIn, verifyOtp: mockVerify, signOut: mockSignOut },
  })
})

it('reads an authoritative boolean and refuses unavailable password status', async () => {
  expect(await hasAccountPassword()).toBe(true)
  mockRpc.mockResolvedValue({ data: null, error: new Error('offline') })
  await expect(changeAccountPassword('new-password')).rejects.toThrow('offline')
  expect(mockUpdate).not.toHaveBeenCalled()
})

it('sets a first password without signing in again', async () => {
  mockRpc.mockResolvedValue({ data: false, error: null })
  await changeAccountPassword('first-password')
  expect(mockCreate).not.toHaveBeenCalled()
  expect(mockUpdate).toHaveBeenCalledWith({ password: 'first-password' })
})

it('rechecks password status before saving and refuses a missing current password', async () => {
  await expect(changeAccountPassword('new-password')).rejects.toMatchObject({
    reason: 'invalid_credentials',
  })
  expect(mockUpdate).not.toHaveBeenCalled()
})

it('rejects the wrong current password without changing anything', async () => {
  mockSignIn.mockResolvedValue({ data: { user: null }, error: new Error('invalid_credentials') })
  await expect(changeAccountPassword('new-password', 'wrong', 'captcha')).rejects.toThrow(
    'invalid_credentials',
  )
  expect(mockUpdate).not.toHaveBeenCalled()
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
})

it('verifies in a nonpersistent client, cleans up its session, then updates the app account', async () => {
  await changeAccountPassword('new-password', 'old-password', 'captcha')
  expect(mockCreate).toHaveBeenCalledWith('https://example.test', 'public', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  expect(mockSignIn).toHaveBeenCalledWith({
    email: 'owner@example.test',
    password: 'old-password',
    options: { captchaToken: 'captcha' },
  })
  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(mockUpdate).toHaveBeenCalledWith({
    password: 'new-password',
    current_password: 'old-password',
  })
  expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
    mockUpdate.mock.invocationCallOrder[0],
  )
})

it('never updates an account if the active user changes during verification', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } }, error: null })
  await expect(changeAccountPassword('new-password', 'old-password')).rejects.toThrow()
  expect(mockUpdate).not.toHaveBeenCalled()
})

describe('with a mailed code instead of the current password', () => {
  // An account made from an email code has a password Supabase set and nobody
  // was shown, so this is the only way its owner can change it while signed in.

  it("mails the code to the account's own address", async () => {
    await sendAccountPasswordCode('captcha')
    expect(mockSendReset).toHaveBeenCalledWith('owner@example.test', 'captcha')
  })

  it('spends the code on an isolated client, then updates the app account', async () => {
    await resetAccountPassword('new-password', '123 456')
    expect(mockCreate).toHaveBeenCalledWith('https://example.test', 'public', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    expect(mockVerify).toHaveBeenCalledWith({
      email: 'owner@example.test',
      token: '123456',
      type: 'recovery',
    })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    // On the app's own session, which a password change is the one to keep, and
    // with no current password, which this owner does not have.
    expect(mockUpdate).toHaveBeenCalledWith({ password: 'new-password' })
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdate.mock.invocationCallOrder[0],
    )
  })

  it('changes nothing for a wrong code', async () => {
    mockVerify.mockResolvedValue({ data: { user: null }, error: new Error('otp_expired') })
    await expect(resetAccountPassword('new-password', '000000')).rejects.toThrow('otp_expired')
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('changes nothing when the code signs in a different account', async () => {
    mockVerify.mockResolvedValue({ data: { user: { id: 'other' } }, error: null })
    await expect(resetAccountPassword('new-password', '123456')).rejects.toMatchObject({
      reason: 'code_invalid',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('never updates an account if the active user changes during verification', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } }, error: null })
    await expect(resetAccountPassword('new-password', '123456')).rejects.toThrow()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

it('sends nothing and changes nothing for an account with no address', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner', email: undefined } }, error: null })
  await expect(sendAccountPasswordCode('captcha')).rejects.toMatchObject({ reason: 'unknown' })
  await expect(resetAccountPassword('new-password', '123456')).rejects.toMatchObject({
    reason: 'unknown',
  })
  expect(mockSendReset).not.toHaveBeenCalled()
  expect(mockVerify).not.toHaveBeenCalled()
  expect(mockUpdate).not.toHaveBeenCalled()
})
