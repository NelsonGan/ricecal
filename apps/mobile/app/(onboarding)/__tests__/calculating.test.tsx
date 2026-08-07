import { render as rntlRender, screen, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import Calculating from '../calculating'

/**
 * The beat between the last question and the number.
 *
 * Two things matter and neither is the animation. It must ADVANCE — a screen
 * whose only exit is a timer is a dead end if that timer is ever dropped in a
 * cleanup — and it must advance by REPLACING, because a screen that moves on by
 * itself is one you cannot walk back through: the chevron from the target screen
 * belongs on the last question.
 *
 * Driven through `waitFor` rather than by advancing the clock by hand. The
 * screen books ONE timer at a time and schedules the next from an effect, so the
 * timer for the second line does not exist until React has committed the first —
 * and a single `advanceTimersByTime` past the whole tally fires only the timer
 * that had already been booked when the clock moved. `waitFor` walks fake timers
 * forward in intervals and flushes React between them, which is exactly the
 * alternation the screen needs.
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

/** Comfortably past three ticks and the settle, in fake time. */
const PAST_THE_TALLY = { timeout: 8000, interval: 100 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

it('says what the number is made of', async () => {
  await render(<Calculating />)

  expect(screen.getByText('Building your plan')).toBeTruthy()
  expect(screen.getByText('Daily calorie goal')).toBeTruthy()
  expect(screen.getByText('Carbs, protein and fat split')).toBeTruthy()
  expect(screen.getByText('Local food matches')).toBeTruthy()
})

it('replaces itself with the target once the tally lands', async () => {
  await render(<Calculating />)

  expect(mockReplace).not.toHaveBeenCalled()

  await waitFor(
    () => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/target'),
    PAST_THE_TALLY,
  )
})

it('drops its timer when it goes away', async () => {
  const view = await render(<Calculating />)
  // Awaited: unmounting opens an act scope of its own, and moving the clock
  // while it is still open interleaves two of them.
  await view.unmount()

  jest.advanceTimersByTime(10_000)

  // A navigation fired from an unmounted screen would move whatever screen is on
  // top of the stack instead — the target screen, straight back to itself.
  expect(mockReplace).not.toHaveBeenCalled()
})
