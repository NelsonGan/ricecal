import * as ImagePicker from 'expo-image-picker'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen, userEvent, waitFor } from '@/test-utils'
import '@/i18n'
import EditProfileScreen from '../../../../app/social/edit-profile'

const mockDismissTo = jest.fn()
const mockRemoveAvatar = jest.fn(async (_path: string) => undefined)
const mockRun = jest.fn(async () => ({ id: 'viewer', status: 'pending' }))
const mockUploadAvatar = jest.fn(async (_uri: string) => 'avatars/viewer/new.jpg')

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canDismiss: () => true,
    dismiss: jest.fn(),
    dismissTo: mockDismissTo,
    replace: jest.fn(),
  }),
}))
jest.mock('@/data', () => ({
  removeAvatar: (path: string) => mockRemoveAvatar(path),
  uploadAvatar: (uri: string) => mockUploadAvatar(uri),
  useAvatarUrl: () => ({ data: undefined }),
  useUserId: () => 'viewer',
}))
jest.mock('@/data/social', () => ({
  useSocialOnline: () => true,
  useSocialProfile: () => ({
    data: {
      user_id: 'viewer',
      handle: 'rice_friend',
      display_name: 'Rice Friend',
      bio: '',
      avatar_path: 'avatars/viewer/old.jpg',
      review_status: 'approved',
      review_reason: null,
      quarantined: false,
    },
    isPending: false,
    isError: false,
  }),
}))
jest.mock('@/features/social/components', () => ({
  QueryNotice: () => null,
  ReviewNotice: () => null,
  SocialPhoto: () => null,
  useSocialTask: () => ({ isPending: false, run: mockRun }),
}))
jest.mock('@/ui', () => ({
  ...jest.requireActual('@/ui'),
  useToast: () => ({ show: jest.fn() }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockRun.mockResolvedValue({ id: 'viewer', status: 'pending' })
  mockUploadAvatar.mockResolvedValue('avatars/viewer/new.jpg')
  ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///new-avatar.jpg' }],
  })
})

const renderProfile = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <EditProfileScreen />
    </SafeAreaProvider>,
  )

it('deletes an uploaded avatar when it is removed before saving', async () => {
  const view = await renderProfile()
  const user = userEvent.setup()

  await user.press(screen.getByRole('button', { name: 'Choose photo' }))
  await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalledWith('file:///new-avatar.jpg'))
  await user.press(screen.getByRole('button', { name: 'Remove photo' }))

  expect(mockRemoveAvatar).toHaveBeenCalledWith('avatars/viewer/new.jpg')
  await view.unmount()
  expect(mockRemoveAvatar).toHaveBeenCalledTimes(1)
})

it('keeps the committed avatar and returns to the profile', async () => {
  const view = await renderProfile()
  const user = userEvent.setup()

  await user.press(screen.getByRole('button', { name: 'Choose photo' }))
  await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalled())
  await user.press(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'profile', avatar: 'avatars/viewer/new.jpg' }),
    ),
  )
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'viewer' },
  })

  await view.unmount()
  expect(mockRemoveAvatar).not.toHaveBeenCalledWith('avatars/viewer/new.jpg')
})

it('does not delete an avatar committed after the editor unmounts', async () => {
  let finishSave: ((value: { id: string; status: string }) => void) | undefined
  mockRun.mockImplementationOnce(
    async () =>
      await new Promise<{ id: string; status: string }>((resolve) => {
        finishSave = resolve
      }),
  )
  const view = await renderProfile()
  const user = userEvent.setup()

  await user.press(screen.getByRole('button', { name: 'Choose photo' }))
  await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalled())
  await user.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockRun).toHaveBeenCalled())
  await view.unmount()
  finishSave?.({ id: 'viewer', status: 'pending' })
  await Promise.resolve()

  await waitFor(() => expect(mockRemoveAvatar).not.toHaveBeenCalledWith('avatars/viewer/new.jpg'))
  expect(mockDismissTo).not.toHaveBeenCalled()
})

it('keeps an ambiguous staged avatar when an unmounted save later rejects', async () => {
  let failSave: ((error: Error) => void) | undefined
  mockRun.mockImplementationOnce(
    async () =>
      await new Promise<never>((_resolve, reject) => {
        failSave = reject
      }),
  )
  const view = await renderProfile()
  const user = userEvent.setup()

  await user.press(screen.getByRole('button', { name: 'Choose photo' }))
  await waitFor(() => expect(mockUploadAvatar).toHaveBeenCalled())
  await user.press(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockRun).toHaveBeenCalled())
  await view.unmount()
  failSave?.(new Error('ambiguous network failure'))
  await Promise.resolve()

  await waitFor(() => expect(mockRemoveAvatar).not.toHaveBeenCalledWith('avatars/viewer/new.jpg'))
  expect(mockDismissTo).not.toHaveBeenCalled()
})
