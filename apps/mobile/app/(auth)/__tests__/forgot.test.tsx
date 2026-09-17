import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import ForgotScreen from '../forgot'

const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ email: 'aisyah@example.com' }),
}))

jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

class MockAuthProblem extends Error {
  constructor(
    readonly reason: string,
    readonly retryAfter?: number,
    readonly emailMayHaveBeenSent = false,
  ) {
    super(reason)
    this.name = 'AuthProblem'
  }
}

jest.mock('@/data/auth', () => ({
  asAuthProblem: (error: unknown) =>
    error instanceof MockAuthProblem ? error : new MockAuthProblem('unknown'),
  sendPasswordReset: jest.fn(),
}))

jest.mock('@/features/auth', () => ({
  useAuthMessage: () => (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong.',
  useCaptchaToken: () => async () => undefined,
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

beforeEach(() => {
  jest.clearAllMocks()
  auth.sendPasswordReset.mockResolvedValue(undefined)
})

it('opens the code screen after posting a password reset', async () => {
  await render(<ForgotScreen />)

  await user.press(screen.getByText('Email me a reset code'))

  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/(auth)/new-password',
    params: { email: 'aisyah@example.com' },
  })
})

it('still opens the code screen when the reset mail may already have arrived', async () => {
  auth.sendPasswordReset.mockRejectedValue(new MockAuthProblem('rate_limited', 60, true))
  await render(<ForgotScreen />)

  await user.press(screen.getByText('Email me a reset code'))

  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/(auth)/new-password',
    params: { email: 'aisyah@example.com' },
  })
})

it('stays put when an IP-wide limit means no reset mail was sent', async () => {
  auth.sendPasswordReset.mockRejectedValue(new MockAuthProblem('rate_limited', 60))
  await render(<ForgotScreen />)

  await user.press(screen.getByText('Email me a reset code'))

  expect(mockReplace).not.toHaveBeenCalled()
})
