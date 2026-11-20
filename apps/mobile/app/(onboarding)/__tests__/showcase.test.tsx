import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import HowStep from '../how'
import SocialStep from '../social'
import WorkoutsStep from '../workouts'

/**
 * The three showcase steps answer nothing, so the only thing each can get wrong
 * is where Continue goes. Each one was inserted into a chain of `push` calls,
 * and a step that still pointed at its old successor skipped a screen without
 * anything failing.
 */

const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
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

it.each([
  ['how', <HowStep key="how" />, '/(onboarding)/setup'],
  ['workouts', <WorkoutsStep key="workouts" />, '/(onboarding)/social'],
  ['social', <SocialStep key="social" />, '/(onboarding)/source'],
])('%s continues to the next step', async (_name, ui, next) => {
  await render(ui)
  await user.press(screen.getByText('Continue'))

  expect(mockPush).toHaveBeenCalledWith(next)
})

it('shows a real scan on the first step', async () => {
  await render(<HowStep />)

  expect(screen.getByText('Snap it. We count it.')).toBeTruthy()
  expect(screen.getByText('Nasi lemak ayam')).toBeTruthy()
})
