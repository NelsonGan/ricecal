import { render as rntlRender, screen, userEvent } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import Tutorial from '../tutorial'

/**
 * The tour, and the two ways out of it.
 *
 * The cards themselves are copy, and copy is not what this pins. What it pins is
 * that the tour ENDS: four cards, a forward button whose label changes on the
 * last one, and a skip that works from anywhere before it. A tour with a
 * miscounted last card is a flow with no exit, and it is the last screen between
 * a new account and the diary they signed up for.
 *
 * Every exit `replace`s. The questions are still on the stack underneath —
 * everything after the flush replaced its predecessor rather than pushing — so
 * pushing Today over them leaves an edge swipe that walks back into onboarding.
 */

const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
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

it('walks all four cards and ends on the diary', async () => {
  await render(<Tutorial />)

  expect(screen.getByText('How RiceCal reads a meal')).toBeTruthy()

  await user.press(screen.getByText('What happens next?'))
  expect(screen.getByText('We match it, then weigh it')).toBeTruthy()

  await user.press(screen.getByText('How to snap a good one'))
  expect(screen.getByText('Sharpen a photo')).toBeTruthy()

  await user.press(screen.getByText('One more thing'))
  expect(screen.getByText('Nothing is locked in')).toBeTruthy()

  // Nothing left to advance to: the forward button is the way out now.
  expect(screen.queryByText('Skip the tour')).toBeNull()

  await user.press(screen.getByText('Log my first meal'))
  expect(mockReplace).toHaveBeenCalledWith('/paywall/intro')
})

it('lets the tour be skipped from the first card', async () => {
  await render(<Tutorial />)

  await user.press(screen.getByText('Skip the tour'))

  expect(mockReplace).toHaveBeenCalledWith('/paywall/intro')
})

// Both exits land on the paywall now. The tour used to fork — one button to
// Today, the other to a read-only preview of it — and the paywall sits between
// the tour and the app whichever was pressed, with its own "Maybe later"
// leading to the real Today.
it('leaves for the paywall however the last card is answered', async () => {
  await render(<Tutorial />)

  await user.press(screen.getByText('What happens next?'))
  await user.press(screen.getByText('How to snap a good one'))
  await user.press(screen.getByText('One more thing'))
  await user.press(screen.getByText('Explore first'))

  expect(mockReplace).toHaveBeenCalledWith('/paywall/intro')
})
