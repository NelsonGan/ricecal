import { render, screen, userEvent, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import '@/i18n'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'
import AccountScreen from '../account'

const mockUpdateProfile = jest.fn().mockResolvedValue({})
const mockUpdatePassword = jest.fn().mockResolvedValue(undefined)
const mockPick = jest.fn().mockResolvedValue({ canceled: true })
const mockUpload = jest.fn().mockResolvedValue('avatars/user/new.jpg')
const mockCopy = jest.fn().mockResolvedValue(true)
const mockDelete = jest.fn().mockResolvedValue(undefined)
let mockProfile: { display_name: string } | undefined = { display_name: 'Alex' }

jest.mock('@/data', () => ({
  useAvatarUrl: () => ({ data: undefined }),
  storedImageSource: () => undefined,
  uploadAvatar: (uri: string) => mockUpload(uri),
  useProfile: () => ({ data: mockProfile }),
  useSession: () => ({ session: { user: { email: 'account@example.test' } } }),
  useUpdateProfile: () => ({ mutateAsync: mockUpdateProfile, isPending: false }),
}))
jest.mock('@/data/auth', () => ({
  updatePassword: (value: string) => mockUpdatePassword(value),
  deleteAccount: () => mockDelete(),
}))
jest.mock('@/data/purchases', () => ({ openManageSubscriptions: jest.fn() }))
jest.mock('@/features/paywall', () => ({ usePlanSummary: () => ({ renews: false }) }))
jest.mock('@/features/auth', () => ({
  PasswordField: jest.requireActual('@/features/auth/PasswordField').PasswordField,
  useAuthMessage: () => () => 'Password could not be changed',
}))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: () => mockPick() }))
jest.mock('expo-clipboard', () => ({ setStringAsync: (value: string) => mockCopy(value) }))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

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
const mount = () => render(<AccountScreen />, { wrapper: Providers })

beforeEach(() => {
  jest.clearAllMocks()
  mockProfile = { display_name: 'Alex' }
})

it('copies the read-only email without allowing an edit', async () => {
  await mount()
  expect(screen.getByLabelText('EMAIL')).toHaveProp('editable', false)
  await user.press(screen.getByText('Copy'))
  expect(mockCopy).toHaveBeenCalledWith('account@example.test')
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
  await user.type(screen.getByLabelText('NAME'), 'New name')
  mockProfile = { display_name: 'Refetched name' }
  await view.rerender(<AccountScreen />)
  expect(screen.getByLabelText('NAME')).toHaveDisplayValue('New name')
})

it('rejects a blank name and saves only the trimmed name', async () => {
  await mount()
  await user.clear(screen.getByLabelText('NAME'))
  await user.type(screen.getByLabelText('NAME'), '   ')
  await user.press(screen.getByText('Save changes'))
  expect(mockUpdateProfile).not.toHaveBeenCalled()
  expect(screen.getByText('Enter your name')).toBeTruthy()
  await user.type(screen.getByLabelText('NAME'), 'Sam  ')
  await user.press(screen.getByText('Save changes'))
  expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam' })
})

it('keeps a failed name draft available for retry', async () => {
  mockUpdateProfile.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await user.clear(screen.getByLabelText('NAME'))
  await user.type(screen.getByLabelText('NAME'), 'Sam')
  await user.press(screen.getByText('Save changes'))
  expect(screen.getByLabelText('NAME')).toHaveDisplayValue('Sam')
  expect(screen.getByText('Could not save your name')).toBeTruthy()
  await user.press(screen.getByText('Save changes'))
  expect(mockUpdateProfile).toHaveBeenCalledTimes(2)
})

it('checks password length and confirmation before making an auth request', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await user.type(screen.getByLabelText('NEW PASSWORD'), 'short')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText('NEW PASSWORD'), ' enough')
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'different')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('CONFIRM NEW PASSWORD'))
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'short enough')
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(mockUpdatePassword).toHaveBeenCalledWith('short enough')
})

it('clears passwords when dismissed and keeps auth errors in the form', async () => {
  await mount()
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  await user.type(screen.getByLabelText('NEW PASSWORD'), 'valid example')
  await user.press(screen.getByLabelText('Close'))
  await waitFor(() => expect(screen.queryByLabelText('NEW PASSWORD')).toBeNull())
  await user.press(screen.getByRole('button', { name: 'Change password' }))
  expect(screen.getByLabelText('NEW PASSWORD')).toHaveDisplayValue('')
  await user.type(screen.getByLabelText('NEW PASSWORD'), 'valid example')
  await user.type(screen.getByLabelText('CONFIRM NEW PASSWORD'), 'valid example')
  mockUpdatePassword.mockRejectedValueOnce(new Error('same_password'))
  await user.press(screen.getAllByRole('button', { name: 'Save changes' }).slice(-1)[0])
  expect(screen.getByLabelText('NEW PASSWORD')).toHaveDisplayValue('valid example')
  expect(screen.getByText('Password could not be changed')).toBeTruthy()
})

it('hides deletion details until asked and never deletes on the first tap', async () => {
  await mount()
  expect(screen.queryByText('Every photograph you took')).toBeNull()
  await user.press(screen.getByLabelText('What gets deleted'))
  expect(screen.getByText('Every photograph you took')).toBeTruthy()
  await user.press(screen.getByText('Close'))
  await user.press(screen.getByText('Delete my account'))
  expect(mockDelete).not.toHaveBeenCalled()
  await user.press(screen.getByText('Cancel'))
  expect(mockDelete).not.toHaveBeenCalled()
})

it('uploads the selected profile photo before saving its key', async () => {
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] })
  await mount()
  await user.press(screen.getByText('Change photo'))
  await waitFor(() =>
    expect(mockUpdateProfile).toHaveBeenCalledWith({ avatarPath: 'avatars/user/new.jpg' }),
  )
  expect(mockUpload).toHaveBeenCalledWith('file:///photo.jpg')
})

it('leaves the photo unchanged when picking is canceled or uploading fails', async () => {
  await mount()
  await user.press(screen.getByText('Change photo'))
  expect(mockUpload).not.toHaveBeenCalled()
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] })
  mockUpload.mockRejectedValueOnce(new Error('offline'))
  await user.press(screen.getByText('Change photo'))
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
