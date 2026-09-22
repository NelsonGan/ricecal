import { act, render, screen, userEvent } from '@/test-utils'
import '@/i18n'
import { FollowButton, ReviewNotice, SocialPhoto } from '../components'

const mockPush = jest.fn()
const mockMutate = jest.fn()
const mockProfile = jest.fn()
const mockPhoto = jest.fn()
const mockToast = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}))
jest.mock('expo-image', () => ({
  Image: (props: { source?: { uri?: string } }) =>
    require('react').createElement(require('react-native').View, {
      ...props,
      testID: props.source?.uri ? 'social-photo' : undefined,
    }),
}))
jest.mock('@/data', () => ({
  useUserId: () => 'viewer',
  useMealPhotoUrl: () => ({ data: undefined }),
}))
jest.mock('@/data/social', () => ({
  useSocialAction: () => ({ mutateAsync: mockMutate, isPending: false }),
  useSocialProfile: () => mockProfile(),
  useSocialPhoto: (...args: unknown[]) => mockPhoto(...args),
  useSocialOnline: () => true,
}))
jest.mock('@/ui', () => ({ ...jest.requireActual('@/ui'), useToast: () => ({ show: mockToast }) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockProfile.mockReturnValue({ data: { user_id: 'viewer' } })
  mockPhoto.mockReturnValue({ data: undefined, isError: false })
  mockMutate.mockResolvedValue({})
})

it('asks a reader without public identity to create one before following', async () => {
  mockProfile.mockReturnValue({ data: null })
  await render(<FollowButton id="someone" following={false} />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Follow' }))
  expect(mockPush).toHaveBeenCalledWith('/social/edit-profile')
  expect(mockMutate).not.toHaveBeenCalled()
})

it('unfollows by setting the desired state and never offers following yourself', async () => {
  const view = await render(<FollowButton id="someone" following />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Unfollow' }))
  expect(mockMutate).toHaveBeenCalledWith({ action: 'follow', id: 'someone', following: false })
  await view.rerender(<FollowButton id="viewer" following={false} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('offers retry only for pending moderation and retains the revision identity', async () => {
  const view = await render(
    <ReviewNotice status="pending" reason={null} kind="comment" id="comment" />,
  )
  await userEvent.setup().press(screen.getByRole('button', { name: 'Retry review' }))
  expect(mockMutate).toHaveBeenCalledWith({ action: 'review', kind: 'comment', id: 'comment' })
  await view.rerender(
    <ReviewNotice status="quarantined" reason={null} kind="comment" id="comment" />,
  )
  expect(screen.queryByRole('button', { name: 'Retry review' })).toBeNull()
  expect(screen.getByText('Under review')).toBeTruthy()
})

it('passes reviewed-image validators and removes an expired photograph', async () => {
  jest.useFakeTimers()
  mockPhoto.mockReturnValue({
    data: {
      url: 'https://images.example/photo',
      headers: { 'If-Match': 'reviewed-etag' },
      expiresAt: Date.now() + 50_000,
    },
    isError: false,
  })
  const view = await render(<SocialPhoto path="meals/person/photo" label="Rice" />)
  expect(screen.getByTestId('social-photo')).toHaveProp('source', {
    uri: 'https://images.example/photo',
    headers: { 'If-Match': 'reviewed-etag' },
  })
  expect(screen.getByTestId('social-photo')).toHaveProp('cachePolicy', 'none')
  await act(async () => {
    jest.advanceTimersByTime(50_000)
  })
  expect(screen.queryByTestId('social-photo')).toBeNull()
  await view.unmount()
  jest.useRealTimers()
})

it('never draws stale signed data after access is refused or the row leaves the viewport', async () => {
  const data = { url: 'https://images.example/photo', headers: {}, expiresAt: Date.now() + 50_000 }
  mockPhoto.mockReturnValue({ data, isError: true })
  const view = await render(<SocialPhoto path="meals/person/photo" label="Rice" />)
  expect(screen.queryByTestId('social-photo')).toBeNull()
  mockPhoto.mockReturnValue({ data, isError: false })
  await view.rerender(<SocialPhoto path="meals/person/photo" label="Rice" visible={false} />)
  expect(screen.queryByTestId('social-photo')).toBeNull()
  expect(mockPhoto).toHaveBeenLastCalledWith('meals/person/photo', false)
})
