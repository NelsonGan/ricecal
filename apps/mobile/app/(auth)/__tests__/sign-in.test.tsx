import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import SignInScreen from '../sign-in'

/**
 * This screen asks for an address and NOTHING ELSE, and this suite is what says
 * so.
 *
 * It used to mail a link from here. Now it hands the address to `password.tsx`,
 * where the person says whether they want a password or a code, and the
 * behaviours worth pinning are what that split has to preserve: nothing is sent
 * to an address that cannot receive it, no mail goes out on the way past, the
 * flow's position travels with it, and the heading follows the direction the
 * caller asked for.
 */

// `mock`-prefixed so the factories below may close over them: everything else is
// out of scope by the time jest hoists the calls.
const mockParams: { mode?: string; step?: string; total?: string } = {}
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

// Both providers are reported unavailable so the screen renders the email form
// alone — the buttons are ProviderButton's business, not this suite's.
jest.mock('@/data/auth', () => ({
  appleSignInAvailable: jest.fn(),
  googleSignInAvailable: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithGoogle: jest.fn(),
  sendLoginLink: jest.fn(),
  asAuthProblem: (error: unknown) => ({ reason: 'unknown', cause: error }),
  SignInCancelled: class SignInCancelled extends Error {},
}))

const auth = jest.mocked(
  require('@/data/auth') as typeof import('@/data/auth') & { sendLoginLink: jest.Mock },
)

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

const submit = async () => {
  await user.press(screen.getByText('Continue with email'))
}

beforeEach(() => {
  jest.clearAllMocks()
  delete mockParams.mode
  delete mockParams.step
  delete mockParams.total
  // After `clearAllMocks` every implementation is gone, and a mock returning
  // `undefined` where the screen awaits a promise fails somewhere unrelated.
  auth.appleSignInAvailable.mockResolvedValue(false)
  auth.googleSignInAvailable.mockReturnValue(false)
})

describe('the email route', () => {
  it('asks for nothing but an address', async () => {
    await render(<SignInScreen />)

    expect(screen.getByLabelText('EMAIL')).toBeOnTheScreen()
    expect(screen.queryByLabelText('PASSWORD')).toBeNull()
    expect(screen.queryByLabelText('CONFIRM PASSWORD')).toBeNull()
  })

  it('hands the address to the password screen', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/password',
      params: { email: 'aisyah@example.com', mode: 'sign-in' },
    })
  })

  /**
   * The send limit is one mail a minute per address, so a code posted on the
   * way past is one taken out of the real request a few seconds later — and
   * everybody who came here to type a password they remember perfectly well
   * would get one.
   */
  it('mails nothing on the way past', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(auth.sendLoginLink).not.toHaveBeenCalled()
  })

  it('refuses an address that cannot receive anything', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@')
    await submit()

    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByText('That does not look like an email address.')).toBeOnTheScreen()
  })
})

/**
 * Welcome has a button for each direction, so it says which one it meant.
 * "I already have an account" under a "Save your progress" heading reads as a tap
 * that was ignored.
 */
describe('the mode parameter', () => {
  it('greets a returning user by default', async () => {
    await render(<SignInScreen />)
    expect(screen.getByText('Welcome back')).toBeOnTheScreen()
  })

  it('talks about saving progress at the end of onboarding', async () => {
    mockParams.mode = 'sign-up'
    await render(<SignInScreen />)
    expect(screen.getByText('Save your progress')).toBeOnTheScreen()
  })

  it('tells the password screen which side to open on', async () => {
    mockParams.mode = 'sign-up'
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ mode: 'sign-up' }) }),
    )
  })
})

/**
 * This screen belongs to two flows, and only one of them has a length.
 *
 * Mid-onboarding it is one numbered step of eight, and dropping the bar for
 * exactly the screen that asks for an email is where a flow stops reading as a
 * flow — "how much more of this is there" is the question being weighed at that
 * moment, and the answer was on every screen but this one. Reached on its own by
 * a returning user, there is no flow to draw.
 */
describe('the onboarding progress bar', () => {
  const bar = () => screen.queryByLabelText(/Step \d+ of \d+/)

  it('stays away when nobody said where we are', async () => {
    await render(<SignInScreen />)
    expect(bar()).toBeNull()
  })

  it('carries the flow through when onboarding sent us here', async () => {
    mockParams.mode = 'sign-up'
    mockParams.step = '6'
    mockParams.total = '8'
    await render(<SignInScreen />)

    expect(screen.getByLabelText('Step 6 of 8')).toBeOnTheScreen()
  })

  /**
   * And onward. The password screen and the code screen are the same flow, so a
   * bar that stopped at the address would read as the flow having ended one
   * question before it does.
   */
  it('passes the position on to the password screen', async () => {
    mockParams.mode = 'sign-up'
    mockParams.step = '6'
    mockParams.total = '8'
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ step: '6', total: '8' }) }),
    )
  })

  it('ignores a position that is not one', async () => {
    // A deep link is not obliged to make sense, and a bar drawn from NaN is a
    // row of marks with no filled ones under a heading about signing in.
    mockParams.step = 'later'
    mockParams.total = '9'
    await render(<SignInScreen />)

    expect(bar()).toBeNull()
  })
})
