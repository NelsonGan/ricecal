import {
  AuthProblem,
  asAuthProblem,
  signInWithPassword,
  signUpWithPassword,
  verifyEmailCode,
} from '../auth'

/**
 * The password half of `data/auth.ts`.
 *
 * Three things here are worth a test and the rest is a thin wrapper. Whether a
 * repeat signup is recognised, since Supabase deliberately answers it as a
 * success. What each of its errors is turned into, since the screens write
 * their sentences off the reason and nothing else. And that a captcha token
 * reaches the call, since a build with the gate on and a token going nowhere
 * fails for everybody at once and looks like an outage.
 */

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      verifyOtp: jest.fn(),
      getSession: jest.fn(),
    },
  },
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'ricecal' } },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: {
    auth: {
      signUp: jest.Mock
      signInWithPassword: jest.Mock
      verifyOtp: jest.Mock
      getSession: jest.Mock
    }
  }
}

/** What supabase-js hands back for a brand new, unconfirmed account. */
const freshUser = { id: 'user-1', identities: [{ id: 'identity-1' }], created_at: '2026-08-15' }

beforeEach(() => {
  jest.clearAllMocks()
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  supabase.auth.signUp.mockResolvedValue({ data: { user: freshUser, session: null }, error: null })
  supabase.auth.signInWithPassword.mockResolvedValue({
    data: { user: freshUser, session: { access_token: 'a' } },
    error: null,
  })
  supabase.auth.verifyOtp.mockResolvedValue({ data: { user: freshUser, session: {} }, error: null })
})

describe('signing up', () => {
  it('reports that a code is owed when there is no session', async () => {
    await expect(signUpWithPassword('aisyah@example.com', 'longenough')).resolves.toBe('confirm')
  })

  it('reports a session when the project confirms addresses for us', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: freshUser, session: { access_token: 'a' } },
      error: null,
    })

    await expect(signUpWithPassword('aisyah@example.com', 'longenough')).resolves.toBe('signed-in')
  })

  /**
   * THE ONLY TELL SUPABASE GIVES.
   *
   * Answering "that email is taken" would turn a signup form into an oracle for
   * who uses this app, so with confirmations on it returns an ordinary-looking
   * success with an empty `identities` array and sends nothing. Read naively,
   * that is a user marched to a code screen to wait for a mail that will never
   * come.
   */
  it('recognises an address that already has an account', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { ...freshUser, identities: [] }, session: null },
      error: null,
    })

    await expect(signUpWithPassword('aisyah@example.com', 'longenough')).rejects.toMatchObject({
      reason: 'account_exists',
    })
  })

  it('sends the captcha token it was given', async () => {
    await signUpWithPassword('aisyah@example.com', 'longenough', 'turnstile-token')

    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ captchaToken: 'turnstile-token' }),
      }),
    )
  })

  it('trims the address, because a keyboard adds a space after one', async () => {
    await signUpWithPassword('  aisyah@example.com ', 'longenough')

    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'aisyah@example.com' }),
    )
  })
})

describe('signing in', () => {
  it('passes the captcha token under options, where supabase-js looks for it', async () => {
    await signInWithPassword('aisyah@example.com', 'longenough', 'turnstile-token')

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'aisyah@example.com',
      password: 'longenough',
      options: { captchaToken: 'turnstile-token' },
    })
  })

  it('turns a refusal into a reason rather than a server sentence', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: Object.assign(new Error('Invalid login credentials'), {
        code: 'invalid_credentials',
      }),
    })

    await expect(signInWithPassword('aisyah@example.com', 'wrong')).rejects.toMatchObject({
      name: 'AuthProblem',
      reason: 'invalid_credentials',
    })
  })
})

describe('verifying a code', () => {
  /**
   * Each purpose is a different column on `auth.users` holding a different
   * token. Asking about the wrong one answers "invalid" for a code that is
   * perfectly good, which is indistinguishable from a typo.
   */
  it('asks about the token the code actually is', async () => {
    await verifyEmailCode('aisyah@example.com', '123456', 'recovery')

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'recovery' }),
    )
  })

  /** A code read off a notification banner is pasted, and the paste brings spaces. */
  it('strips whitespace out of a pasted code', async () => {
    await verifyEmailCode('aisyah@example.com', '123 456', 'email')

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ token: '123456' }),
    )
  })
})

describe('reading what Supabase said', () => {
  it('keeps an AuthProblem as it is rather than wrapping it twice', () => {
    const original = new AuthProblem('captcha')
    expect(asAuthProblem(original)).toBe(original)
  })

  it('prefers the code, which is stable, to the message, which is not', () => {
    const error = Object.assign(new Error('Signups not allowed for otp'), {
      code: 'otp_expired',
    })
    expect(asAuthProblem(error).reason).toBe('code_invalid')
  })

  /**
   * Checked against the deployed project: a code that is simply WRONG comes
   * back 403 `otp_expired`, "Token has expired or is invalid". So there is no
   * honest `code_expired` to report, and copy that named one would tell
   * somebody who mistyped to go and wait for another mail.
   */
  it('reads a wrong code and an old one as the same thing, because the server does', () => {
    const wrong = Object.assign(new Error('Token has expired or is invalid'), {
      code: 'otp_expired',
      status: 403,
    })
    expect(asAuthProblem(wrong).reason).toBe('code_invalid')
  })

  /**
   * The wait is only ever in the prose. Without it the copy has to say "wait a
   * moment", which is advice somebody has already taken by the time they read
   * it.
   */
  it('reads the wait out of a rate-limit sentence', () => {
    const error = Object.assign(
      new Error('For security purposes, you can only request this after 47 seconds.'),
      { code: 'over_email_send_rate_limit' },
    )

    const problem = asAuthProblem(error)
    expect(problem.reason).toBe('rate_limited')
    expect(problem.retryAfter).toBe(47)
  })

  it('reads a 429 with no code at all as a rate limit', () => {
    const error = Object.assign(new Error('Too many requests'), { status: 429 })
    expect(asAuthProblem(error).reason).toBe('rate_limited')
  })

  /**
   * An expired code and a wrong one arrive as one message from an endpoint that
   * will not say which — deliberately, since "it merely expired" confirms the
   * address has an account.
   */
  it('reads an expired-or-invalid link as one thing', () => {
    expect(asAuthProblem(new Error('Token has expired or is invalid')).reason).toBe('code_invalid')
  })

  /** The signal on a phone, and the one reason that must never read as `unknown`. */
  it('recognises a dropped connection', () => {
    expect(asAuthProblem(new TypeError('Network request failed')).reason).toBe('offline')
  })

  it('keeps the original underneath, so Sentry has something to read', () => {
    const original = new Error('something nobody has seen before')
    expect(asAuthProblem(original).cause).toBe(original)
  })
})
