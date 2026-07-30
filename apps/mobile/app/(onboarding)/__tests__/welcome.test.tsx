import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import Welcome from '../welcome'

/**
 * The fork at the top of the flow.
 *
 * "Get started" goes into the questions with no account and no session, which is
 * the change worth pinning: it used to send an anonymous visitor to a screen whose
 * every hook called `useUserId`, and that throws rather than failing quietly.
 * "I already have an account" skips the questions and says which side of the
 * account screen to open on.
 */

const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  )
}

const render = (ui: ReactElement) => rntlRender(ui, { wrapper: Providers })
const user = userEvent.setup()

beforeEach(() => {
  jest.clearAllMocks()
})

it('starts the questions without asking for an account', async () => {
  await render(<Welcome />)
  await user.press(screen.getByText('Get started'))

  expect(mockPush).toHaveBeenCalledWith('/goal')
})

it('sends a returning user to the sign-in side of the account screen', async () => {
  await render(<Welcome />)
  await user.press(screen.getByText('I already have an account'))

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sign-in',
    params: { mode: 'sign-in' },
  })
})
