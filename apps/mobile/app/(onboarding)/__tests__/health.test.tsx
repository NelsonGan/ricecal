import { render as rntlRender, screen, userEvent, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import HealthStep from '../health'

/**
 * The screen this app was rejected on, and the two things about it that must
 * stay true.
 *
 * Guideline 5.1.1(iv) in two halves. A message shown before a system permission
 * sheet may not be dressed as the ask — the button said "Connect Apple Health"
 * — and it may not offer a way past the sheet, which the "Not now" beside it
 * did. Both are assertions here rather than comments, because what would undo
 * either is ordinary product work (a label that names the store reads better; a
 * skip raises completion) and nothing about it fails.
 *
 * The third thing pinned is the shape that removing the skip forced. Every
 * write in this app is `networkMode: 'online'`, so the connect mutation is
 * PAUSED with no connection and its body never runs — asking through it meant
 * no sheet at all offline, on a step nobody can leave. The screen asks
 * `requestAccess` directly and does not wait for the sync, so a mutation that
 * never settles must not hold the flow. That is the last case, and it is the
 * one that would strand a new account on a permission screen.
 */

const mockReplace = jest.fn()
const mockRequestAccess = jest.fn()
const mockMutateAsync = jest.fn()
const mockAvailability = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}))

// A partial stand-in for the barrel, as in the notifications suite: the real
// module builds a Supabase client at import time.
jest.mock('@/data', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false, userId: 'u1' }),
  useConnectHealth: () => ({ mutateAsync: mockMutateAsync }),
}))

jest.mock('@/lib/health', () => ({
  offeredProviders: () => Promise.resolve({ native: { availability: mockAvailability() } }),
  providerFor: () => ({ requestAccess: mockRequestAccess }),
  // Never in a test: the generated provider is a development affordance and
  // its button is not what any of this is about.
  canOfferDemo: () => false,
}))

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

/** The button is held until the availability check lands, so every case waits. */
const pressContinue = async () => {
  const button = await screen.findByText('Continue')
  await user.press(button)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAvailability.mockReturnValue({ ok: true })
  mockRequestAccess.mockResolvedValue({ granted: true, permissions: ['steps'] })
  mockMutateAsync.mockResolvedValue({ granted: true, days: 7 })
})

it('offers one button, and it does not name the permission', async () => {
  await render(<HealthStep />)

  expect(await screen.findByText('Continue')).toBeTruthy()
  expect(screen.queryByText('Connect Apple Health')).toBeNull()
  expect(screen.queryByText('Connect Health Connect')).toBeNull()
})

/**
 * COUNTED, not named. Asserting that "Not now" is absent only holds while that
 * exact string is the one somebody would reintroduce; asserting there is ONE
 * button holds whatever they call it, which is the property the guideline is
 * actually about. The step's frame draws no back control — the flow replaces
 * rather than pushes by this point — so one is the whole screen.
 */
it('offers no way off the screen that skips the permission request', async () => {
  await render(<HealthStep />)
  await screen.findByText('Continue')

  expect(screen.queryAllByRole('button')).toHaveLength(1)
})

it('puts the sheet up before it moves on', async () => {
  await render(<HealthStep />)

  await pressContinue()

  await waitFor(() => expect(mockRequestAccess).toHaveBeenCalled())
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications'))
})

/**
 * A refusal is an answer, not a failure. It moves on and it says nothing: on
 * Android the user has just read Health Connect's own dialog and declined, and
 * a toast about it would be the app arguing with a decision the system already
 * recorded.
 */
it('moves on without syncing when the permission is refused', async () => {
  mockRequestAccess.mockResolvedValue({ granted: false, permissions: [] })

  await render(<HealthStep />)
  await pressContinue()

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications'))
  expect(mockMutateAsync).not.toHaveBeenCalled()
})

/**
 * A native call that raises rather than answering. Unhandled, the step would
 * have one button that does nothing and no second button at all.
 */
it('moves on when the sheet cannot be presented at all', async () => {
  mockRequestAccess.mockRejectedValue(new Error('HealthKit is not available'))

  await render(<HealthStep />)
  await pressContinue()

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications'))
  expect(mockMutateAsync).not.toHaveBeenCalled()
})

/**
 * The offline case, and the reason the step does not await the sync. A paused
 * mutation never settles; if `next()` were behind it, this is where a new
 * account would sit for ever.
 */
it('does not wait on a sync that will never settle', async () => {
  mockMutateAsync.mockReturnValue(new Promise(() => {}))

  await render(<HealthStep />)
  await pressContinue()

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications'))
})

/**
 * An iPad, or a device with no health store. There is nothing to ask for, so
 * the button is the same word and simply advances — a label that changed to
 * "Continue" only here is the one that used to change its mind on mount.
 */
it('still says Continue where there is no store to connect to', async () => {
  mockAvailability.mockReturnValue({ ok: false, reason: 'no-health-store' })

  await render(<HealthStep />)
  await pressContinue()

  expect(mockRequestAccess).not.toHaveBeenCalled()
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/notifications'))
})
