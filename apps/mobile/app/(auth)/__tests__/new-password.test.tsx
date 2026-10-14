import { fireEvent, render, screen, userEvent } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import NewPasswordScreen from '../new-password'

/**
 * The reset's last screen skips its code only for a session the reset link
 * produced. Being signed in is not enough: a signed-in phone that opened the
 * reset URL with no code used to land here and set a new password unasked.
 */

const mockVerify = jest.fn().mockResolvedValue(undefined)
const mockUpdate = jest.fn().mockResolvedValue(undefined)
const mockSession: { session: unknown } = { session: null }
const mockParams: { email?: string } = {}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: jest.fn() }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/data', () => ({ useSession: () => mockSession }))
jest.mock('@/data/auth', () => ({
  emailSendRetryAfter: () => 0,
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  updatePassword: (password: string) => mockUpdate(password),
  verifyEmailCode: (...args: unknown[]) => mockVerify(...args),
}))
jest.mock('@/features/auth', () => ({
  PasswordField: jest.requireActual('@/features/auth/PasswordField').PasswordField,
  useAuthMessage: () => () => 'Something went wrong',
  useCaptchaToken: () => jest.fn().mockResolvedValue('captcha'),
}))

const signedIn = (method: string) => {
  const claims = { amr: [{ method, timestamp: Math.floor(Date.now() / 1000) - 5 }] }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return { user: { email: 'owner@example.test' }, access_token: `h.${payload}.s` }
}

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
const user = userEvent.setup()

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.session = null
  delete mockParams.email
})

async function fillPasswords() {
  await fireEvent.changeText(screen.getByLabelText('NEW PASSWORD'), 'new-password-123')
  await fireEvent.changeText(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'new-password-123')
  await user.press(screen.getByRole('button', { name: 'Save and sign in' }))
}

it('sets the password straight away for a session the reset link produced', async () => {
  mockSession.session = signedIn('recovery')
  await render(<NewPasswordScreen />, { wrapper: Providers })
  expect(screen.queryByLabelText('CODE')).toBeNull()
  await fillPasswords()
  expect(mockVerify).not.toHaveBeenCalled()
  expect(mockUpdate).toHaveBeenCalledWith('new-password-123')
})

it('asks an ordinary signed-in session for a code before changing anything', async () => {
  mockSession.session = signedIn('password')
  await render(<NewPasswordScreen />, { wrapper: Providers })
  expect(screen.getByLabelText('CODE')).toBeTruthy()
  await fillPasswords()
  expect(mockUpdate).not.toHaveBeenCalled()
  await fireEvent.changeText(screen.getByLabelText('CODE'), '123456')
  await user.press(screen.getByRole('button', { name: 'Save and sign in' }))
  expect(mockVerify).toHaveBeenCalledWith('owner@example.test', '123456', 'recovery')
  expect(mockUpdate).toHaveBeenCalledWith('new-password-123')
})

it('asks for the code that was mailed when there is no session', async () => {
  mockParams.email = 'owner@example.test'
  await render(<NewPasswordScreen />, { wrapper: Providers })
  expect(screen.getByLabelText('CODE')).toBeTruthy()
})
