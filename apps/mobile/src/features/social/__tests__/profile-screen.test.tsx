import { render, screen } from '@/test-utils'
import '@/i18n'
import ProfileScreen from '../../../../app/social/profile/[id]'

let mockProfileId = 'viewer'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockProfileId }),
  useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }),
}))
jest.mock('@/data', () => ({
  useUserId: () => 'viewer',
  useProfile: () => ({
    data: {
      id: 'viewer',
      display_name: 'Alex',
      handle: null,
      bio: '',
      avatar_path: null,
    },
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
  }),
  useAvatarUrl: () => ({ data: undefined }),
}))
jest.mock('@/data/social', () => ({
  useSocialProfile: () => ({
    data: null,
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
  }),
  useSocialPosts: () => ({ data: { pages: [{ rows: [] }] } }),
}))
jest.mock('@/features/social/components', () => ({
  SocialBar: ({ title }: { title: string }) =>
    require('react').createElement(require('react-native').Text, {}, title),
  SocialPhoto: () => null,
  SocialList: ({ header, empty }: { header: React.ReactNode; empty: string }) =>
    require('react').createElement(
      require('react-native').View,
      {},
      header,
      require('react').createElement(require('react-native').Text, {}, empty),
    ),
  QueryNotice: () =>
    require('react').createElement(require('react-native').Text, {}, 'Unavailable'),
  ReviewNotice: () => null,
}))
jest.mock('@/ui', () => ({
  ...jest.requireActual('@/ui'),
  Screen: ({ children, header }: { children: React.ReactNode; header: React.ReactNode }) =>
    require('react').createElement(require('react-native').View, {}, header, children),
}))

it('shows the existing account as an empty profile before a handle is chosen', async () => {
  mockProfileId = 'viewer'
  await render(<ProfileScreen />)

  expect(screen.getByText('Alex')).toBeOnTheScreen()
  expect(screen.queryByText('Handle')).toBeNull()
  expect(screen.queryByText('Bio')).toBeNull()
  expect(screen.getByText('0 posts')).toBeOnTheScreen()
  expect(screen.getByText('No posts yet')).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Edit profile' })).toBeOnTheScreen()
  expect(screen.queryByText('Unavailable')).toBeNull()
})

it('does not reveal the viewer account on someone else’s unavailable profile', async () => {
  mockProfileId = 'another-user'
  await render(<ProfileScreen />)

  expect(screen.getByText('Unavailable')).toBeOnTheScreen()
  expect(screen.queryByText('Alex')).toBeNull()
})
