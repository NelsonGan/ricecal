import { act, fireEvent, render, screen, userEvent } from '@/test-utils'
import '@/i18n'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ComposeScreen from '../../../../app/social/compose'
import PostScreen from '../../../../app/social/post/[id]'

let mockParams: { entryId?: string; postId?: string; id?: string } = {}
const mockRun = jest.fn()
const mockReplace = jest.fn()
const mockMealPhotoUrl = jest.fn((_path?: string) => ({ data: undefined }))
const mockFoodPreview = jest.fn()

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}))
jest.mock('@/data', () => ({
  useUserId: () => 'viewer',
  useMealPhotoUrl: (path?: string) => mockMealPhotoUrl(path),
}))
jest.mock('@/data/social', () => ({
  useSocialOnline: () => true,
  useSocialProfile: () => ({ data: { user_id: 'viewer', review_status: 'approved' } }),
  useSocialEntry: (entryId: string) => ({
    data: {
      postId: entryId === 'shared-entry' || entryId === 'changed-entry' ? 'shared-post' : null,
      entry: {
        food_name: entryId,
        icon_set: entryId === 'changed-entry' ? 'food' : null,
        icon_name: entryId === 'changed-entry' ? 'pizza' : null,
        photo_path: entryId === 'changed-entry' ? 'meals/viewer/new-photo' : null,
        kcal: entryId === 'changed-entry' ? 900 : 640,
        carbs_g: 80,
        protein_g: 18,
        fat_g: 28,
      },
    },
  }),
  useSocialPost: (id: string) => ({
    data: id
      ? {
          id,
          author_id: 'viewer',
          review_status: 'approved',
          food_name: 'Rice',
          icon_set: null,
          icon_name: null,
          photo_path: null,
          kcal: 206,
          carbs_g: 45,
          protein_g: 4,
          fat_g: 0,
          caption: 'An existing caption',
          audience: 'followers',
        }
      : undefined,
  }),
  useSocialComments: () => ({ data: { pages: [] } }),
}))
jest.mock('@/features/social/components', () => {
  return {
    useSocialTask: () => ({ run: mockRun, isPending: false }),
    SocialBar: ({ action }: { action?: React.ReactNode }) =>
      require('react').createElement(require('react-native').View, {}, action),
    // What the composer previews: the name and the figures that will be shared.
    FoodPreview: (props: { name: string; facts?: { kcal: number } | null }) => {
      mockFoodPreview(props)
      return require('react').createElement(
        require('react-native').Text,
        {},
        props.facts ? `${props.name}, ${props.facts.kcal} kcal` : props.name,
      )
    },
    JoinPrompt: () => null,
    QueryNotice: () => null,
    ReviewNotice: () => null,
    PostCard: () => null,
    SocialList: ({ header }: { header?: React.ReactNode }) =>
      require('react').createElement(require('react-native').View, {}, header),
  }
})
jest.mock('@/ui', () => ({
  ...jest.requireActual('@/ui'),
  Screen: ({
    children,
    header,
    footer,
  }: {
    children: React.ReactNode
    header?: React.ReactNode
    footer?: React.ReactNode
  }) => require('react').createElement(require('react-native').View, {}, header, children, footer),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockRun.mockResolvedValue({ id: 'saved' })
})

it('previews the existing post snapshot when its diary source has changed', async () => {
  mockParams = { entryId: 'changed-entry' }
  await render(<ComposeScreen />)

  expect(mockMealPhotoUrl).toHaveBeenLastCalledWith(undefined)
  expect(mockFoodPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      name: 'Rice',
      icon: undefined,
      hasPhoto: false,
      facts: expect.objectContaining({ id: 'shared-post', kcal: 206, photo_path: null }),
    }),
  )
})

it('does not carry a shared meal caption or audience into another source entry', async () => {
  mockParams = { entryId: 'shared-entry' }
  const view = await render(<ComposeScreen />)
  expect(screen.getByLabelText('Caption')).toHaveProp('value', 'An existing caption')

  mockParams = { entryId: 'fresh-entry' }
  await view.rerender(<ComposeScreen />)
  expect(screen.getByLabelText('Caption')).toHaveProp('value', '')
  await userEvent.setup().press(screen.getByRole('button', { name: 'Share' }))
  expect(mockRun).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: 'post',
      entryId: 'fresh-entry',
      caption: '',
      audience: 'public',
    }),
  )
})

it('keeps sharing details in the audience picker and info sheet', async () => {
  mockParams = { entryId: 'fresh-entry' }
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ComposeScreen />
    </SafeAreaProvider>,
  )
  const user = userEvent.setup()
  const audience = screen.getByLabelText('Who can see this?')
  const shareHint =
    'Only this food, its calories and macros, and your caption are shared. Deleting the diary entry also removes its post.'

  expect(screen.getByText('fresh-entry, 640 kcal')).toBeOnTheScreen()
  expect(screen.getByLabelText('Caption')).toHaveProp('maxLength', 280)
  expect(audience).toHaveAccessibilityValue({ text: 'Everyone' })
  expect(screen.queryByText('Anyone signed in can see this post.')).toBeNull()
  expect(screen.queryByText('Only you and your followers can see this post.')).toBeNull()
  expect(screen.queryByText(shareHint)).toBeNull()

  await user.press(audience)
  expect(screen.getByText('Anyone signed in can see this post.')).toBeOnTheScreen()
  expect(screen.getByText('Only you and your followers can see this post.')).toBeOnTheScreen()
  await user.press(screen.getByText('Followers'))
  expect(audience).toHaveAccessibilityValue({ text: 'Followers' })

  await user.press(screen.getByRole('button', { name: 'About sharing' }))
  expect(screen.getByText(shareHint)).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Close' }))
  await user.press(screen.getByRole('button', { name: 'Share' }))
  expect(mockRun).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: 'post', entryId: 'fresh-entry', audience: 'followers' }),
  )
})

it('retains a failed meal draft only while editing the same source', async () => {
  mockRun.mockRejectedValue(new Error('offline'))
  mockParams = { entryId: 'first-entry' }
  const view = await render(<ComposeScreen />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Caption'), 'First meal')
  await user.press(screen.getByRole('button', { name: 'Share' }))
  expect(screen.getByLabelText('Caption')).toHaveProp('value', 'First meal')
  await user.press(screen.getByRole('button', { name: 'Share' }))
  // The entry is the retry key: the server answers a repeat with its one post.
  expect(mockRun.mock.calls[1][0]).toEqual(mockRun.mock.calls[0][0])
  expect(mockRun.mock.calls[1][0]).toEqual(
    expect.objectContaining({ action: 'post', entryId: 'first-entry', caption: 'First meal' }),
  )

  mockParams = { entryId: 'second-entry' }
  await view.rerender(<ComposeScreen />)
  expect(screen.getByLabelText('Caption')).toHaveProp('value', '')
  await user.press(screen.getByRole('button', { name: 'Share' }))
  expect(mockRun.mock.calls[2][0]).toEqual(
    expect.objectContaining({ action: 'post', entryId: 'second-entry', caption: '' }),
  )
})

it('starts a new comment draft and request id when the post route changes', async () => {
  mockRun.mockRejectedValue(new Error('offline'))
  mockParams = { id: 'first-post' }
  const view = await render(<PostScreen />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Comment'), 'For the first meal')
  await user.press(screen.getByRole('button', { name: 'Send' }))
  const firstRequest = mockRun.mock.calls[0][0].requestId
  expect(screen.getByLabelText('Comment')).toHaveProp('value', 'For the first meal')

  mockParams = { id: 'second-post' }
  await view.rerender(<PostScreen />)
  expect(screen.getByLabelText('Comment')).toHaveProp('value', '')
  await user.type(screen.getByLabelText('Comment'), 'For the second meal')
  await user.press(screen.getByRole('button', { name: 'Send' }))
  expect(mockRun.mock.calls[1][0]).toEqual(
    expect.objectContaining({ postId: 'second-post', body: 'For the second meal' }),
  )
  expect(mockRun.mock.calls[1][0].requestId).not.toBe(firstRequest)
})

it('does not navigate back to a previous source when its pending publication finishes', async () => {
  let finish: (value: { id: string }) => void = () => undefined
  mockRun.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  mockParams = { entryId: 'first-entry' }
  const view = await render(<ComposeScreen />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Share' }))
  mockParams = { entryId: 'second-entry' }
  await view.rerender(<ComposeScreen />)
  await act(async () => {
    finish({ id: 'first-post' })
  })
  expect(mockReplace).not.toHaveBeenCalled()
})

it('refuses blank and oversized comment drafts while accepting the 500-character boundary', async () => {
  mockParams = { id: 'post' }
  await render(<PostScreen />)
  const input = screen.getByLabelText('Comment')
  expect(input).toHaveProp('maxLength', 500)
  await fireEvent.changeText(input, '  \n  ')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await fireEvent.changeText(input, 'a'.repeat(501))
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  await fireEvent.changeText(input, 'a'.repeat(500))
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
})
