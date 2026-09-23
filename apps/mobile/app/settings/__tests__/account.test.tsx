import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import AccountScreen from '../account'

const mockUpdateProfile = jest.fn().mockResolvedValue({})
const mockHasPassword = jest.fn().mockResolvedValue(false)
const mockCaptcha = jest.fn().mockResolvedValue('captcha-token')
const mockUpdatePassword = jest.fn().mockResolvedValue(undefined)
const mockPick = jest.fn().mockResolvedValue({ canceled: true })
const mockUpload = jest.fn().mockResolvedValue('avatars/user/new.jpg')
const mockCopy = jest.fn().mockResolvedValue(true)
const mockBack = jest.fn()
const mockDelete = jest.fn().mockResolvedValue(undefined)
const mockSocialAction = jest.fn().mockResolvedValue({})
let mockProfile:
  | { display_name: string; handle?: string | null; bio?: string; avatar_path?: string | null }
  | undefined = { display_name: 'Alex' }

jest.mock('@/data', () => ({
  useAvatarUrl: () => ({ data: undefined }),
  storedImageSource: () => undefined,
  uploadAvatar: (uri: string) => mockUpload(uri),
  useProfile: () => ({ data: mockProfile }),
  useSession: () => ({ session: { user: { email: 'account@example.test' } } }),
  useUpdateProfile: () => ({ mutateAsync: mockUpdateProfile, isPending: false }),
  useUserId: () => 'user',
}))
jest.mock('@/data/social', () => ({
  useSocialAction: () => ({ mutateAsync: mockSocialAction, isPending: false }),
  useSocialOnline: () => true,
  useSocialProfile: () => ({ data: null }),
  reviewSocial: jest.fn().mockResolvedValue('approved'),
}))
jest.mock('@/data/auth', () => ({
  asAuthProblem: (error: unknown) => error,
  deleteAccount: () => mockDelete(),
}))
jest.mock('@/data/account-password', () => ({
  hasAccountPassword: () => mockHasPassword(),
  changeAccountPassword: (...args: unknown[]) => mockUpdatePassword(...args),
}))
jest.mock('@/features/auth', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const Context = React.createContext(false)
  return {
    PasswordField: jest.requireActual('@/features/auth/PasswordField').PasswordField,
    CaptchaProvider: ({ children }: { children: ReactNode }) =>
      React.createElement(Context.Provider, { value: true }, children),
    useCaptchaToken: () => {
      if (!React.useContext(Context)) throw new Error('Password form needs its captcha provider')
      return mockCaptcha
    },
    useAuthMessage: () => () => 'Password could not be changed',
  }
})
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: () => mockPick() }))
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockCopy(value) }))
jest.mock('@/lib/navigation', () => ({ useBack: () => mockBack }))

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
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
    </QueryClientProvider>
  )
}
const user = userEvent.setup()
const mount = () => render(<AccountScreen />, { wrapper: Providers })

beforeEach(() => {
  jest.clearAllMocks()
  mockHasPassword.mockReset().mockResolvedValue(false)
  mockProfile = { display_name: 'Alex' }
})

it('copies the read-only email without allowing an edit', async () => {
  await mount()
  expect(screen.getByLabelText('EMAIL: account@example.test')).not.toHaveProp('onChangeText')
  expect(screen.getByText('account@example.test')).toBeTruthy()
  await user.press(screen.getByRole('button', { name: 'Copy' }))
  expect(mockCopy).toHaveBeenCalledWith('account@example.test')
  expect(screen.getByRole('button', { name: 'Email copied' })).toBeTruthy()
  expect(mockUpdateProfile).not.toHaveBeenCalled()
})

it('waits for a late profile and does not replace a typed draft on refetch', async () => {
  mockProfile = undefined
  const view = await mount()
  expect(screen.getByLabelText('NAME')).toHaveProp('editable', false)
  mockProfile = { display_name: 'Alex' }
  await view.rerender(<AccountScreen />)
  expect(screen.getByLabelText('NAME')).toHaveDisplayValue('Alex')
  await user.clear(screen.getByLabelText('NAME'))
  await user.type(screen.getByLabelText('NAME'), 'New name', { skipBlur: true })
  mockProfile = { display_name: 'Refetched name' }
  await view.rerender(<AccountScreen />)
  expect(screen.getByLabelText('NAME')).toHaveDisplayValue('New name')
})

it('rejects a blank name and saves only the trimmed name', async () => {
  await mount()
  await user.clear(screen.getByLabelText('NAME'))
  await user.type(screen.getByLabelText('NAME'), '   ', { skipBlur: true })
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  expect(mockUpdateProfile).not.toHaveBeenCalled()
  expect(screen.getByText('Enter your name')).toBeTruthy()
  await user.type(screen.getByLabelText('NAME'), 'Sam  ', { skipBlur: true })
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam' })
})

it('saves handle and bio from the existing account page', async () => {
  mockProfile = { display_name: 'Alex', handle: null, bio: '', avatar_path: null }
  await mount()
  expect(screen.queryByText('My profile')).toBeNull()
  expect(
    screen.queryByText('Choose what people see. Your diary stays private until you share a meal.'),
  ).toBeNull()
  expect(screen.queryByText('3 to 24 lowercase letters, numbers or underscores.')).toBeNull()
  await user.press(
    screen.getByRole('button', { name: '3 to 24 lowercase letters, numbers or underscores.' }),
  )
  expect(screen.getByText('3 to 24 lowercase letters, numbers or underscores.')).toBeTruthy()
  await user.press(screen.getByRole('button', { name: 'Close' }))
  await user.type(screen.getByLabelText('Handle'), 'alex_cooks')
  await user.type(screen.getByLabelText('Bio'), 'Rice and noodles')
  await user.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(mockSocialAction).toHaveBeenCalledWith({
      action: 'profile',
      handle: 'alex_cooks',
      name: 'Alex',
      bio: 'Rice and noodles',
      avatar: null,
    }),
  )
})

it('keeps a failed name draft available for retry', async () => {
  mockUpdateProfile.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await user.clear(screen.getByLabelText('NAME'))
  await user.type(screen.getByLabelText('NAME'), 'Sam', { skipBlur: true })
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  expect(screen.getByLabelText('NAME')).toHaveDisplayValue('Sam')
  await waitFor(() => expect(screen.getByText('Could not save your name')).toBeTruthy())
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  expect(mockUpdateProfile).toHaveBeenCalledTimes(2)
})

it('checks password length and confirmation before making an auth request', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await user.type(await screen.findByLabelText('NEW PASSWORD'), 'short')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).not.toHaveBeenCalled()
  await user.type(await screen.findByLabelText('NEW PASSWORD'), ' enough')
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'different')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('CONFIRM NEW PASSWORD'))
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'short enough')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).toHaveBeenCalledWith('short enough', undefined, undefined)
})

it('clears passwords when dismissed and keeps auth errors in the form', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await user.type(await screen.findByLabelText('NEW PASSWORD'), 'valid example')
  await user.press(screen.getByLabelText('Close'))
  await waitFor(() => expect(screen.queryByLabelText('NEW PASSWORD')).toBeNull())
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByLabelText('NEW PASSWORD')).toHaveDisplayValue('')
  await user.type(await screen.findByLabelText('NEW PASSWORD'), 'valid example')
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'valid example')
  mockUpdatePassword.mockRejectedValueOnce(new Error('same_password'))
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(await screen.findByLabelText('NEW PASSWORD')).toHaveDisplayValue('valid example')
  expect(screen.getByText('Password could not be changed')).toBeTruthy()
})

it('hides deletion details until asked and never deletes on the first tap', async () => {
  await mount()
  expect(screen.queryByText('Every photograph you took')).toBeNull()
  await user.press(screen.getByText('Delete my account'))
  await user.press(screen.getByLabelText('What gets deleted'))
  expect(screen.getByText('Every photograph you took')).toBeTruthy()
  await user.press(screen.getByText('Close'))
  expect(mockDelete).not.toHaveBeenCalled()
  await user.press(screen.getByText('Cancel'))
  expect(mockDelete).not.toHaveBeenCalled()
})

it('uploads the selected profile photo before saving its key', async () => {
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] })
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change photo' }))
  await waitFor(() =>
    expect(mockUpdateProfile).toHaveBeenCalledWith({ avatarPath: 'avatars/user/new.jpg' }),
  )
  expect(mockUpload).toHaveBeenCalledWith('file:///photo.jpg')
})

it('leaves the photo unchanged when picking is canceled or uploading fails', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change photo' }))
  expect(mockUpload).not.toHaveBeenCalled()
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] })
  mockUpload.mockRejectedValueOnce(new Error('offline'))
  await user.press(screen.getByRole('button', { name: 'Change photo' }))
  await waitFor(() => expect(screen.getByText('Could not update photo')).toBeTruthy())
  expect(mockUpdateProfile).not.toHaveBeenCalled()
})

it('requires the exact delete confirmation and clears it when canceled', async () => {
  await mount()
  await user.press(screen.getByText('Delete my account'))
  const field = screen.getByLabelText('Type "delete" to confirm')
  expect(screen.getByRole('button', { name: /^Delete$/ })).toBeDisabled()
  await user.type(field, 'Delete')
  expect(screen.getByRole('button', { name: /^Delete$/ })).toBeDisabled()
  await user.clear(field)
  await user.type(field, 'delete')
  expect(screen.getByRole('button', { name: /^Delete$/ })).toBeEnabled()
  await user.press(screen.getByText('Cancel'))
  await user.press(screen.getByText('Delete my account'))
  expect(screen.getByLabelText('Type "delete" to confirm')).toHaveDisplayValue('')
  expect(mockDelete).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText('Type "delete" to confirm'), 'delete')
  await user.press(screen.getByRole('button', { name: /^Delete$/ }))
  expect(mockDelete).toHaveBeenCalledTimes(1)
})

it('saves a changed name only on blur and skips unchanged names', async () => {
  await mount()
  expect(screen.queryByText('Save changes')).toBeNull()
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  expect(mockUpdateProfile).not.toHaveBeenCalled()
  await fireEvent.changeText(screen.getByLabelText('NAME'), 'Sam')
  expect(mockUpdateProfile).not.toHaveBeenCalled()
  await fireEvent(screen.getByLabelText('NAME'), 'blur')
  await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam' }))
})

it('saves the focused name before leaving and stays after a failed save', async () => {
  await mount()
  await fireEvent.changeText(screen.getByLabelText('NAME'), 'Sam')
  mockUpdateProfile.mockRejectedValueOnce(new Error('offline'))
  await user.press(screen.getByRole('button', { name: 'Go back' }))
  expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam' })
  expect(mockBack).not.toHaveBeenCalled()
  await user.press(screen.getByRole('button', { name: 'Go back' }))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
})

it('finishes saving the name before opening the photo picker', async () => {
  let finish!: (value: object) => void
  mockUpdateProfile.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  await fireEvent.changeText(screen.getByLabelText('NAME'), 'Sam')
  await user.press(screen.getByRole('button', { name: 'Change photo' }))
  expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam' })
  expect(mockPick).not.toHaveBeenCalled()
  finish({})
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(1))
})

it('shares an in-flight name save and only navigates back once', async () => {
  let finish!: (value: object) => void
  mockUpdateProfile.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await mount()
  await fireEvent.changeText(screen.getByLabelText('NAME'), 'Sam')
  await user.press(screen.getByRole('button', { name: 'Go back' }))
  await user.press(screen.getByRole('button', { name: 'Go back' }))
  expect(mockUpdateProfile).toHaveBeenCalledTimes(1)
  expect(mockBack).not.toHaveBeenCalled()
  finish({})
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
})

it('requires the current password for an existing password and verifies it before changing', async () => {
  mockHasPassword.mockResolvedValue(true)
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  const current = await screen.findByLabelText('Current password')
  await fireEvent.changeText(screen.getByLabelText('NEW PASSWORD'), 'new-password-123')
  await fireEvent.changeText(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'new-password-123')
  await user.press(screen.getByRole('button', { name: 'Save changes' }))
  expect(mockUpdatePassword).not.toHaveBeenCalled()
  await fireEvent.changeText(current, 'wrong-password')
  mockUpdatePassword.mockRejectedValueOnce({ reason: 'invalid_credentials' })
  await user.press(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByText('Current password is incorrect')).toBeTruthy()
  await fireEvent.changeText(current, 'old-password-123')
  await user.press(screen.getByRole('button', { name: 'Save changes' }))
  expect(mockUpdatePassword).toHaveBeenLastCalledWith(
    'new-password-123',
    'old-password-123',
    'captcha-token',
  )
})

it('allows a first password without a current-password field and clears it on close', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await screen.findByLabelText('NEW PASSWORD')
  expect(screen.queryByLabelText('Current password')).toBeNull()
  await fireEvent.changeText(screen.getByLabelText('NEW PASSWORD'), 'first-password-123')
  await fireEvent.changeText(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'first-password-123')
  await user.press(screen.getByRole('button', { name: 'Save changes' }))
  expect(mockUpdatePassword).toHaveBeenLastCalledWith('first-password-123', undefined, undefined)
  expect(mockCaptcha).not.toHaveBeenCalled()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByLabelText('NEW PASSWORD')).toHaveDisplayValue('')
})

it('does not show a password form until password status is known and can retry', async () => {
  mockHasPassword.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await user.press(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByLabelText('NEW PASSWORD')).toBeTruthy()
  expect(mockUpdatePassword).not.toHaveBeenCalled()
})
