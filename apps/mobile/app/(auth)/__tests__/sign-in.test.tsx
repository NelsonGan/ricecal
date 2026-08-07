import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import SignInScreen from '../sign-in'

/**
 * There are no passwords here any more, and this suite is what says so.
 *
 * The behaviours worth pinning after that change: nothing is mailed to an address
 * that cannot receive it, the screen says the link is on its way (the session
 * arrives through the link, so without that the tap looks like it did nothing),
 * and the heading follows the direction the caller asked for.
 */

// `mock`-prefixed so the factories below may close over them: everything else is
// out of scope by the time jest hoists the calls.
const mockParams: { mode?: string; step?: string; total?: string } = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

const submit = async () => {
  await user.press(screen.getByText('Email me a link'))
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
  auth.sendLoginLink.mockResolvedValue(undefined)
})

describe('the login link', () => {
  it('asks for nothing but an address', async () => {
    await render(<SignInScreen />)

    expect(screen.getByLabelText('EMAIL')).toBeOnTheScreen()
    expect(screen.queryByLabelText('PASSWORD')).toBeNull()
    expect(screen.queryByLabelText('CONFIRM PASSWORD')).toBeNull()
  })

  it('sends one', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(auth.sendLoginLink).toHaveBeenCalledWith('aisyah@example.com')
  })

  /**
   * The session arrives through the link rather than through the call, so a
   * screen that looks unchanged after a successful send reads as a dead button.
   */
  it('says where it went', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(await screen.findByText(/aisyah@example.com/)).toBeOnTheScreen()
  })

  it('stops talking about the last link once the address changes', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()
    expect(await screen.findByText(/aisyah@example.com/)).toBeOnTheScreen()

    await fill('EMAIL', '.my')
    expect(screen.queryByText(/Link sent/)).toBeNull()
  })

  it('refuses an address that cannot receive it', async () => {
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@')
    await submit()

    expect(auth.sendLoginLink).not.toHaveBeenCalled()
    expect(screen.getByText('That does not look like an email address.')).toBeOnTheScreen()
  })

  it('reports a failure to send', async () => {
    auth.sendLoginLink.mockRejectedValue(new Error('Email rate limit exceeded'))
    await render(<SignInScreen />)

    await fill('EMAIL', 'aisyah@example.com')
    await submit()

    expect(await screen.findByText('Email rate limit exceeded')).toBeOnTheScreen()
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
})

/**
 * This screen belongs to two flows, and only one of them has a length.
 *
 * Mid-onboarding it is step seven of nine, and dropping the bar for exactly the
 * screen that asks for an email is where a flow stops reading as a flow — "how
 * much more of this is there" is the question being weighed at that moment, and
 * the answer was on every screen but this one. Reached on its own by a returning
 * user, there is no flow to draw.
 */
describe('the onboarding progress bar', () => {
  const bar = () => screen.queryByLabelText(/Step \d+ of \d+/)

  it('stays away when nobody said where we are', async () => {
    await render(<SignInScreen />)
    expect(bar()).toBeNull()
  })

  it('carries the flow through when onboarding sent us here', async () => {
    mockParams.mode = 'sign-up'
    mockParams.step = '7'
    mockParams.total = '9'
    await render(<SignInScreen />)

    expect(screen.getByLabelText('Step 7 of 9')).toBeOnTheScreen()
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
