import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import PasswordScreen from '../password'

/**
 * The password screen, and the reason it has a test is that NOTHING ON IT IS A
 * DEAD END.
 *
 * That is the whole design, and it is the part a refactor loses quietly: every
 * failure here has a way forward on the same screen, so what is worth pinning
 * is the branches rather than the happy path. An address that already has an
 * account offers sign-in without ever saying the account is there. An account
 * that never confirmed gets a fresh code posted rather than an error. And the
 * mailed code is always on offer, which is what makes a password optional in
 * this app rather than a wall.
 */

const mockParams: { email?: string; mode?: string; step?: string; total?: string } = {}
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => ['(auth)', 'password'],
}))

jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

class MockAuthProblem extends Error {
  constructor(
    readonly reason: string,
    readonly retryAfter?: number,
  ) {
    super(reason)
    this.name = 'AuthProblem'
  }
}

jest.mock('@/data/auth', () => ({
  AuthProblem: MockAuthProblem,
  asAuthProblem: (error: unknown) =>
    error instanceof MockAuthProblem ? error : new MockAuthProblem('unknown'),
  signUpWithPassword: jest.fn(),
  signInWithPassword: jest.fn(),
  sendPasswordReset: jest.fn(),
  sendLoginLink: jest.fn(),
  resendConfirmation: jest.fn(),
}))

const auth = jest.mocked(require('@/data/auth') as typeof import('@/data/auth'))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

const fill = async (label: string, value: string) => {
  await user.type(screen.getByLabelText(label), value)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.email = 'aisyah@example.com'
  mockParams.mode = 'sign-up'
  delete mockParams.step
  delete mockParams.total

  auth.signUpWithPassword.mockResolvedValue('confirm')
  auth.signInWithPassword.mockResolvedValue(undefined)
  auth.sendPasswordReset.mockResolvedValue(undefined)
  auth.sendLoginLink.mockResolvedValue(undefined)
  auth.resendConfirmation.mockResolvedValue(undefined)
})

describe('creating an account', () => {
  it('wants the password twice', async () => {
    await render(<PasswordScreen />)

    expect(screen.getByLabelText('PASSWORD')).toBeOnTheScreen()
    expect(screen.getByLabelText('CONFIRM PASSWORD')).toBeOnTheScreen()
  })

  it('refuses two that do not match, without asking the server', async () => {
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await fill('CONFIRM PASSWORD', 'longenougi')
    await user.press(screen.getByText('Create account'))

    expect(auth.signUpWithPassword).not.toHaveBeenCalled()
    expect(screen.getByText('The two passwords do not match.')).toBeOnTheScreen()
  })

  /**
   * Eight is `password_min_length` on the project. Checked here as well because
   * a rejection that costs a round trip to learn reads as a broken button on a
   * slow connection.
   */
  it('refuses a short one before sending it', async () => {
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'short')
    await fill('CONFIRM PASSWORD', 'short')
    await user.press(screen.getByText('Create account'))

    expect(auth.signUpWithPassword).not.toHaveBeenCalled()
    expect(screen.getByText('Use at least 8 characters.')).toBeOnTheScreen()
  })

  it('sends the person to the code screen when a code is owed', async () => {
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await fill('CONFIRM PASSWORD', 'longenough')
    await user.press(screen.getByText('Create account'))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { email: 'aisyah@example.com', purpose: 'signup' },
    })
  })

  it('goes nowhere when the project handed back a session', async () => {
    auth.signUpWithPassword.mockResolvedValue('signed-in')
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await fill('CONFIRM PASSWORD', 'longenough')
    await user.press(screen.getByText('Create account'))

    // The guard in `_layout` moves the user. Pushing here as well would race it.
    expect(mockPush).not.toHaveBeenCalled()
  })

  /**
   * It offers sign-in and it does NOT say the account is there. Supabase
   * deliberately refuses to answer that question so a signup form cannot be
   * used to find out who has this app, and a screen that said it out loud would
   * give away exactly what the server withheld.
   */
  it('offers sign-in when the address already has an account, without saying so', async () => {
    auth.signUpWithPassword.mockRejectedValue(new MockAuthProblem('account_exists'))
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await fill('CONFIRM PASSWORD', 'longenough')
    await user.press(screen.getByText('Create account'))

    expect(await screen.findByText('Enter your password')).toBeOnTheScreen()
    expect(screen.queryByLabelText('CONFIRM PASSWORD')).toBeNull()
    expect(
      screen.getByText(
        'If there is already an account at this address, sign in below or ask for a code.',
      ),
    ).toBeOnTheScreen()
  })
})

describe('signing in', () => {
  beforeEach(() => {
    mockParams.mode = 'sign-in'
  })

  it('wants the password once', async () => {
    await render(<PasswordScreen />)

    expect(screen.getByLabelText('PASSWORD')).toBeOnTheScreen()
    expect(screen.queryByLabelText('CONFIRM PASSWORD')).toBeNull()
  })

  /**
   * The account is real and one mail away from working, so this is not a
   * failure to report and walk away from.
   */
  it('posts a fresh code for an account that never confirmed', async () => {
    auth.signInWithPassword.mockRejectedValue(new MockAuthProblem('email_not_confirmed'))
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await user.press(screen.getByText('Sign in'))

    expect(auth.resendConfirmation).toHaveBeenCalledWith('aisyah@example.com', undefined)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { email: 'aisyah@example.com', purpose: 'signup' },
    })
  })

  /**
   * Its own screen, not the code screen. Verifying a recovery code creates the
   * session, and the guard would carry the user off to Today before they had
   * chosen anything.
   */
  it('sends a reset to the screen that sets the new password', async () => {
    await render(<PasswordScreen />)

    await user.press(screen.getByText('Forgot your password?'))

    expect(auth.sendPasswordReset).toHaveBeenCalledWith('aisyah@example.com', undefined)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/new-password',
      params: { email: 'aisyah@example.com' },
    })
  })

  it('reports a wrong password in words the person can act on', async () => {
    auth.signInWithPassword.mockRejectedValue(new MockAuthProblem('invalid_credentials'))
    await render(<PasswordScreen />)

    await fill('PASSWORD', 'longenough')
    await user.press(screen.getByText('Sign in'))

    expect(
      await screen.findByText(
        'That email and password do not match. Try again, or ask for a code.',
      ),
    ).toBeOnTheScreen()
  })
})

/**
 * The way in that always works, whether or not this account has a password.
 * Offered on both sides, because somebody who cannot remember whether they set
 * one needs a route that does not depend on the answer.
 */
describe('the mailed code', () => {
  it('is offered when creating an account', async () => {
    await render(<PasswordScreen />)

    await user.press(screen.getByText('Email me a code instead'))

    expect(auth.sendLoginLink).toHaveBeenCalledWith('aisyah@example.com', undefined)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { email: 'aisyah@example.com', purpose: 'email' },
    })
  })

  it('is offered when signing in', async () => {
    mockParams.mode = 'sign-in'
    await render(<PasswordScreen />)

    expect(screen.getByText('Email me a code instead')).toBeOnTheScreen()
  })
})

/**
 * A reset for an account that does not exist yet sends a mail saying nothing,
 * and reads as the app having lost track of where it is.
 */
it('does not offer a reset on the sign-up side', async () => {
  await render(<PasswordScreen />)
  expect(screen.queryByText('Forgot your password?')).toBeNull()
})

it('carries the onboarding position onward', async () => {
  mockParams.step = '6'
  mockParams.total = '8'
  await render(<PasswordScreen />)

  await fill('PASSWORD', 'longenough')
  await fill('CONFIRM PASSWORD', 'longenough')
  await user.press(screen.getByText('Create account'))

  expect(mockPush).toHaveBeenCalledWith(
    expect.objectContaining({ params: expect.objectContaining({ step: '6', total: '8' }) }),
  )
})
