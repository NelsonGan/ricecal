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

/**
 * The ring is Skia, and Skia has no canvas here.
 *
 * `@shopify/react-native-skia/jestSetup.js` installs enough of the module for
 * an import to succeed, but the web implementation it falls back to builds its
 * paths through CanvasKit — which is never loaded — so `Skia.PathBuilder.Make()`
 * throws the moment this screen renders. Nothing in this file is about the
 * drawing: what it pins is that the screen ADVANCES and that it advances by
 * replacing itself, so the canvas is stubbed down to the three things the
 * screen touches.
 */
jest.mock('@shopify/react-native-skia', () => {
  const builder = { addArc: () => builder, detach: () => ({}) }
  return {
    Canvas: ({ children }: { children?: unknown }) => children ?? null,
    Path: () => null,
    Skia: { PathBuilder: { Make: () => builder } },
  }
})

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

/**
 * Real seconds, not the fake ones above, and well past what this needs.
 *
 * `waitFor` walks the fake clock forward in 100ms steps and flushes React
 * between them, and this screen now has three Reanimated animations running
 * while it does — a fill, a sweep that repeats for ever, and a pulse per
 * outstanding line. Each flush is therefore real work, and eighty of them on a
 * machine running the other thirty-six suites in parallel went past Jest's
 * five-second default. It takes about half a second on a quiet one; the margin
 * is for a busy one, not for the screen.
 */
const REAL_TIMEOUT_MS = 20_000

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
  expect(screen.getByText('Matching your food')).toBeTruthy()
})

it(
  'replaces itself with the target once the tally lands',
  async () => {
    await render(<Calculating />)

    expect(mockReplace).not.toHaveBeenCalled()

    await waitFor(
      () => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/target'),
      PAST_THE_TALLY,
    )
  },
  REAL_TIMEOUT_MS,
)

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
