import { View } from 'react-native'
import type { SocialPost, SocialProfile } from '@/data/social'
import i18n from '@/i18n'
import { act, fireEvent, render, screen, userEvent } from '@/test-utils'
import {
  FollowButton,
  FoodPreview,
  PersonRow,
  PostCard,
  QueryNotice,
  ReviewNotice,
  SocialList,
  SocialPhoto,
} from '../components'

const mockPush = jest.fn()
const mockMutate = jest.fn()
const mockProfile = jest.fn()
const mockPhoto = jest.fn()
const mockRefetchProfile = jest.fn()
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
  useAvatarUrl: () => ({ data: undefined }),
}))
jest.mock('@/data/social', () => ({
  useSocialAction: () => ({ mutateAsync: mockMutate, isPending: false }),
  useSocialProfile: () => mockProfile(),
  useSocialPhoto: (...args: unknown[]) => mockPhoto(...args),
  useSocialOnline: () => true,
}))
jest.mock('@/ui', () => ({ ...jest.requireActual('@/ui'), useToast: () => ({ show: mockToast }) }))

const person: SocialProfile = {
  user_id: 'someone',
  handle: 'someone',
  display_name: 'Someone',
  bio: '',
  avatar_path: null,
  review_status: 'approved',
  review_reason: null,
  revision: 1,
  quarantined: false,
  follower_count: 0,
  following_count: 0,
  post_count: 0,
  is_following: false,
  is_followed_by: false,
  created_at: '2026-09-23T00:00:00.000Z',
}

const post: SocialPost = {
  id: 'post',
  author_id: person.user_id,
  handle: person.handle,
  display_name: person.display_name,
  avatar_path: null,
  food_name: 'Rice',
  icon_set: null,
  icon_name: null,
  photo_path: null,
  kcal: 206,
  carbs_g: 44.5,
  protein_g: 4.3,
  fat_g: 0.4,
  caption: '',
  audience: 'public',
  review_status: 'approved',
  review_reason: null,
  revision: 1,
  quarantined: false,
  created_at: '2026-09-23T00:00:00.000Z',
  published_at: '2026-09-23T00:00:00.000Z',
  like_count: 0,
  comment_count: 0,
  is_liked: false,
  is_following: true,
}

beforeEach(async () => {
  jest.clearAllMocks()
  await i18n.changeLanguage('en')
  mockProfile.mockReturnValue({
    data: { ...person, user_id: 'viewer' },
    isPending: false,
    isError: false,
    refetch: mockRefetchProfile,
  })
  mockPhoto.mockReturnValue({ data: undefined, isError: false })
  mockMutate.mockResolvedValue({})
})

it('asks a reader without public identity to create one before following', async () => {
  mockProfile.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
    refetch: mockRefetchProfile,
  })
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

it('waits for the public identity query and offers retry when it fails', async () => {
  mockProfile.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: mockRefetchProfile,
  })
  const view = await render(<FollowButton id="someone" following={false} />)
  expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled()

  mockProfile.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: mockRefetchProfile,
  })
  await view.rerender(<FollowButton id="someone" following={false} />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }))
  expect(mockRefetchProfile).toHaveBeenCalledTimes(1)
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockMutate).not.toHaveBeenCalled()
})

it('does not treat an unresolved public identity as permission to like', async () => {
  mockProfile.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch: mockRefetchProfile,
  })
  const view = await render(<PostCard post={post} />)
  expect(screen.getByRole('button', { name: 'Like, 0 likes' })).toBeDisabled()

  mockProfile.mockReturnValue({
    data: { ...person, user_id: 'viewer' },
    isPending: false,
    isError: false,
    refetch: mockRefetchProfile,
  })
  await view.rerender(<PostCard post={post} />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Like, 0 likes' }))
  expect(mockMutate).toHaveBeenCalledWith({ action: 'like', id: 'post', liked: true })
  expect(mockPush).not.toHaveBeenCalledWith('/social/edit-profile')
})

it('lays the name, calories and macros over the food and reads them out', async () => {
  await render(<PostCard post={post} />)
  expect(
    screen.getByRole('button', {
      name: 'Rice, 206 kcal, Carbs 45 grams, Protein 4 grams, Fat 0 grams',
    }),
  ).toBeTruthy()
  // Once, on the picture: the line under the actions that repeated it is gone.
  expect(screen.getAllByText('Rice')).toHaveLength(1)
  expect(screen.getByText('206')).toBeTruthy()
  for (const text of ['Carbs', '45g', 'Protein', '4g', 'Fat', '0g']) {
    expect(screen.getByText(text)).toBeTruthy()
  }
})

it('announces one gram with the singular unit', async () => {
  await render(<PostCard post={{ ...post, carbs_g: 1, protein_g: 1, fat_g: 1 }} />)
  expect(
    screen.getByRole('button', {
      name: 'Rice, 206 kcal, Carbs 1 gram, Protein 1 gram, Fat 1 gram',
    }),
  ).toBeTruthy()
})

it('keeps small nutrition text opaque over photographs', async () => {
  const data = { url: 'https://images.example/photo', headers: {}, expiresAt: Date.now() + 50_000 }
  mockPhoto.mockReturnValue({ data, isError: false })
  const view = await render(<FoodPreview name="Rice" photo="meals/person/photo" facts={post} />)
  await act(async () => {
    fireEvent(screen.getByTestId('social-photo'), 'load')
  })
  expect(screen.getByText('Carbs').props.className.split(' ')).toContain('text-white')

  await view.rerender(
    <FoodPreview name="Rice" photo="meals/person/photo" facts={post} variant="tile" />,
  )
  expect(screen.getByText('206 kcal').props.className.split(' ')).toContain('text-white')
})

it('says when a photograph is on screen, so the caption over it can match', async () => {
  const onShown = jest.fn()
  const data = { url: 'https://images.example/photo', headers: {}, expiresAt: Date.now() + 50_000 }
  mockPhoto.mockReturnValue({ data, isError: false })
  const view = await render(
    <SocialPhoto path="meals/person/photo" label="Rice" onShown={onShown} />,
  )
  expect(onShown).not.toHaveBeenCalledWith(true)
  await act(async () => {
    fireEvent(screen.getByTestId('social-photo'), 'load')
  })
  expect(onShown).toHaveBeenLastCalledWith(true)
  mockPhoto.mockReturnValue({ data, isError: true })
  await view.rerender(<SocialPhoto path="meals/person/photo" label="Rice" onShown={onShown} />)
  expect(onShown).toHaveBeenLastCalledWith(false)
})

it('keeps blocked people static while regular people remain navigable', async () => {
  const view = await render(<PersonRow person={person} navigable={false} trailing={<View />} />)
  expect(screen.queryByRole('button', { name: 'Someone, @someone' })).toBeNull()

  await view.rerender(<PersonRow person={person} trailing={<View />} />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Someone, @someone' }))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/social/profile/[id]',
    params: { id: 'someone' },
  })
})

it('announces social loading states in the active language', async () => {
  await i18n.changeLanguage('ms')
  await render(
    <>
      <QueryNotice pending retry={jest.fn()} />
      <SocialList
        query={{
          data: undefined,
          isPending: true,
          isError: false,
          isFetching: true,
          isFetchingNextPage: false,
          isFetchNextPageError: false,
          hasNextPage: false,
          fetchStatus: 'fetching',
          fetchNextPage: jest.fn(),
          refetch: jest.fn(),
        }}
        rowKey={(row: { id: string }) => row.id}
        renderRow={() => <></>}
        empty="Empty"
      />
    </>,
  )
  const loading = screen.getAllByLabelText('Memuatkan')
  expect(loading).toHaveLength(2)
  for (const indicator of loading) expect(indicator).toHaveProp('accessibilityRole', 'progressbar')
})

it('says the feed has ended under its last post, and not while more can load', async () => {
  const query = {
    data: { pages: [{ rows: [{ id: 'post' }], next: null }] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    fetchStatus: 'idle',
    fetchNextPage: jest.fn(async () => undefined),
    refetch: jest.fn(async () => undefined),
  }
  const list = (
    <SocialList
      query={query}
      rowKey={(row) => row.id}
      renderRow={() => <View />}
      empty="Empty"
      end="You have reached the end"
    />
  )
  const view = await render(list)
  expect(screen.getByText('You have reached the end')).toBeOnTheScreen()
  await view.rerender(<SocialList {...list.props} query={{ ...query, hasNextPage: true }} />)
  expect(screen.queryByText('You have reached the end')).toBeNull()
  expect(screen.getByText('Load more')).toBeOnTheScreen()
  await view.rerender(
    <SocialList
      {...list.props}
      query={{ ...query, data: { pages: [{ rows: [], next: null }] } }}
    />,
  )
  expect(screen.queryByText('You have reached the end')).toBeNull()
  expect(screen.getByText('Empty')).toBeOnTheScreen()
})

it('shows pull-to-refresh only for an explicit refresh', async () => {
  let finishRefresh: (() => void) | undefined
  const refetch = jest.fn(
    async () =>
      await new Promise<void>((resolve) => {
        finishRefresh = resolve
      }),
  )
  const query = {
    data: { pages: [{ rows: [{ id: 'post' }], next: null }] },
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    fetchStatus: 'idle',
    fetchNextPage: jest.fn(async () => undefined),
    refetch,
  }
  const list = (
    <SocialList query={query} rowKey={(row) => row.id} renderRow={() => <View />} empty="Empty" />
  )
  const view = await render(list)
  const refreshControl = () =>
    view.root?.queryAll((node) => typeof node.props.refreshing === 'boolean')[0]

  expect(refreshControl()?.props.refreshing).toBe(false)
  await view.rerender(<SocialList {...list.props} query={{ ...query, isFetching: true }} />)
  expect(refreshControl()?.props.refreshing).toBe(false)

  await act(async () => {
    refreshControl()?.props.onRefresh()
    await Promise.resolve()
  })
  expect(refreshControl()?.props.refreshing).toBe(true)
  await act(async () => finishRefresh?.())
  expect(refreshControl()?.props.refreshing).toBe(false)
  expect(refetch).toHaveBeenCalledTimes(1)
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
  // A fresh signature for the same reviewed bytes reuses the image in memory.
  expect(screen.getByTestId('social-photo')).toHaveProp('source', {
    uri: 'https://images.example/photo',
    headers: { 'If-Match': 'reviewed-etag' },
    cacheKey: 'meals/person/photo#reviewed-etag',
  })
  expect(screen.getByTestId('social-photo')).toHaveProp('cachePolicy', 'memory')
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
