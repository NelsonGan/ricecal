import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import SignInScreen from '../sign-in'

/**
 * The confirmation field is the only reason this suite exists.
 *
 * A mistyped password on sign-UP is invisible — both fields are masked, the
 * signup succeeds, and the user discovers it on the next launch with no way
 * back but a reset mail. So the two behaviours worth pinning are that a
 * mismatch never reaches the network, and that sign-IN is not made to answer
 * the same question twice.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

// Both providers are reported unavailable so the screen renders the email form
// alone — the buttons are ProviderButton's business, not this suite's.
jest.mock('@/data/auth', () => ({
  appleSignInAvailable: jest.fn(),
  googleSignInAvailable: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
  signUpWithEmail: jest.fn(),
  SignInCancelled: class SignInCancelled extends Error {},
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
  // After `clearAllMocks` every implementation is gone, and a mock that returns
  // `undefined` where the screen awaits a promise fails somewhere unrelated.
  auth.appleSignInAvailable.mockResolvedValue(false)
  auth.googleSignInAvailable.mockReturnValue(false)
  auth.signInWithEmail.mockResolvedValue(undefined)
  auth.signUpWithEmail.mockResolvedValue({ status: 'signed-in' })
})

describe('sign-up', () => {
  it('asks for the password twice', async () => {
    await render(<SignInScreen />)
    expect(screen.getByLabelText('CONFIRM PASSWORD')).toBeOnTheScreen()
  })

  it('refuses to submit when the two passwords differ', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await fill('PASSWORD', 'nasilemak123')
    await fill('CONFIRM PASSWORD', 'nasilemak124')
    await user.press(screen.getByText('Create account'))

    expect(auth.signUpWithEmail).not.toHaveBeenCalled()
    expect(screen.getByText('Those two passwords do not match.')).toBeOnTheScreen()
  })

  it('refuses to submit when the confirmation is left empty', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await fill('PASSWORD', 'nasilemak123')
    await user.press(screen.getByText('Create account'))

    expect(auth.signUpWithEmail).not.toHaveBeenCalled()
    expect(screen.getByText('Type your password again.')).toBeOnTheScreen()
  })

  it('signs up when they match', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await fill('PASSWORD', 'nasilemak123')
    await fill('CONFIRM PASSWORD', 'nasilemak123')
    await user.press(screen.getByText('Create account'))

    expect(auth.signUpWithEmail).toHaveBeenCalledWith('aisyah@example.com', 'nasilemak123')
  })
})

describe('sign-in', () => {
  const switchToSignIn = async () => {
    await user.press(screen.getByText('I already have an account'))
  }

  it('does not ask for a confirmation', async () => {
    await render(<SignInScreen />)
    await switchToSignIn()
    expect(screen.queryByLabelText('CONFIRM PASSWORD')).toBeNull()
  })

  /**
   * The regression this guards: gating `valid` on a confirmation that is no
   * longer on screen would make sign-in unreachable.
   */
  it('signs in with only the one password', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await fill('PASSWORD', 'nasilemak123')
    await switchToSignIn()
    await user.press(screen.getByText('Sign in'))

    expect(auth.signInWithEmail).toHaveBeenCalledWith('aisyah@example.com', 'nasilemak123')
  })
})
