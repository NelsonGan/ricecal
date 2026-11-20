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

/**
 * The sample day's ring, as the number in it. Skia's jest setup does not mock
 * `PathBuilder`, which `CalorieRing` calls during render.
 */
jest.mock('@/ui/CalorieRing', () => {
  const { Text: RNText } = require('react-native')
  return {
    CalorieRing: ({ centerLabel }: { centerLabel: string }) => <RNText>{centerLabel}</RNText>,
  }
})

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

it('starts the flow without asking for an account', async () => {
  await render(<Welcome />)
  await user.press(screen.getByText('Get started'))

  // The showcase of a scan comes before the first question.
  expect(mockPush).toHaveBeenCalledWith('/how')
})

it('sends a returning user to the sign-in side of the account screen', async () => {
  await render(<Welcome />)
  await user.press(screen.getByText('I already have an account'))

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sign-in',
    params: { mode: 'sign-in' },
  })
})

it('shows what the app is for: a meal on today and what is left', async () => {
  await render(<Welcome />)

  expect(screen.getByText('Nasi lemak ayam')).toBeTruthy()
  // 1,880 less the 644 plate and the 120 drink.
  expect(screen.getByText('1,116')).toBeTruthy()
})
