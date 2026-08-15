import { render as rntlRender, screen, userEvent, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import NotificationsStep from '../notifications'

/**
 * The permission that has to do something.
 *
 * Every `reminder_enabled` starts false in the signup trigger, deliberately — an
 * app that schedules notifications nobody asked for is an app that gets its
 * permission revoked. Which makes the obvious implementation of this screen a
 * lie: call `ensureNotificationPermission`, move on, and the user who tapped
 * "Enable notifications" and said yes to the system dialog never receives one.
 * So the assertion worth having is not that the permission was requested, it is
 * that the three meal reminders were turned ON.
 *
 * The second thing pinned here is that nothing on this screen is a wall. A
 * refusal, a failed write, a permission the SDK could not record: all of them
 * still advance. A minute-old account stuck behind a toast is the worse bug.
 */

const mockReplace = jest.fn()
const mockEnsure = jest.fn()
const mockUpdateMealTime = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}))

jest.mock('@/lib/notifications', () => ({
  ensureNotificationPermission: () => mockEnsure(),
}))

// A partial stand-in for the barrel: this screen reaches two hooks, and the real
// module builds a Supabase client at import time that no test environment can
// construct.
jest.mock('@/data', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false, userId: 'u1' }),
  useUpdateMealTime: () => ({ mutateAsync: mockUpdateMealTime }),
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

beforeEach(() => {
  jest.clearAllMocks()
  mockEnsure.mockResolvedValue(true)
  mockUpdateMealTime.mockResolvedValue({})
})

it('turns the three meal reminders on when permission is granted', async () => {
  await render(<NotificationsStep />)

  await user.press(screen.getByText('Enable notifications'))

  await waitFor(() => expect(mockUpdateMealTime).toHaveBeenCalledTimes(3))
  expect(mockUpdateMealTime.mock.calls.map(([patch]) => patch)).toEqual([
    { meal: 'breakfast', reminder_enabled: true },
    { meal: 'lunch', reminder_enabled: true },
    { meal: 'dinner', reminder_enabled: true },
  ])
  expect(mockReplace).toHaveBeenCalledWith('/paywall/intro')
})

it('schedules nothing when the user says no, and still moves on', async () => {
  mockEnsure.mockResolvedValue(false)
  await render(<NotificationsStep />)

  await user.press(screen.getByText('Enable notifications'))

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/paywall/intro'))
  expect(mockUpdateMealTime).not.toHaveBeenCalled()
})

it('carries on when the write fails', async () => {
  mockUpdateMealTime.mockRejectedValue(new Error('offline'))
  await render(<NotificationsStep />)

  await user.press(screen.getByText('Enable notifications'))

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/paywall/intro'))
})

/**
 * The one that was a real hang.
 *
 * Writes are `networkMode: 'online'`, so with no connection react-query PAUSES
 * these rather than rejecting them and an awaited `mutateAsync` never settles.
 * Awaiting them left the button disabled and the flow stopped dead on the last
 * screen before the diary — no error, no timeout, nothing to retry.
 */
it('does not wait on a write that will never settle', async () => {
  mockUpdateMealTime.mockReturnValue(new Promise(() => {}))
  await render(<NotificationsStep />)

  await user.press(screen.getByText('Enable notifications'))

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/paywall/intro'))
  // Started all the same: the optimistic update has flipped the cache, so
  // `useReminderSync` schedules from it the moment Today mounts.
  expect(mockUpdateMealTime).toHaveBeenCalledWith({ meal: 'breakfast', reminder_enabled: true })
})

it('asks for nothing when the ask is declined outright', async () => {
  await render(<NotificationsStep />)

  await user.press(screen.getByText('Maybe later'))

  expect(mockEnsure).not.toHaveBeenCalled()
  expect(mockUpdateMealTime).not.toHaveBeenCalled()
  expect(mockReplace).toHaveBeenCalledWith('/paywall/intro')
})
