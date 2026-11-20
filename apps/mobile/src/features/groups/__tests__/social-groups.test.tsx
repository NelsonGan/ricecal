import { SafeAreaProvider } from 'react-native-safe-area-context'
import { fireEvent, render, screen } from '@/test-utils'
import '@/i18n'
import type { GroupSummary } from '@/data/groups'
import { SocialGroups } from '../SocialGroups'
import { setOpenGroup } from '../store'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const mockPush = jest.fn()
let mockGroups: GroupSummary[] = []

jest.mock('@/data/groups', () => ({
  ...jest.requireActual('@/data/groups'),
  useMyGroups: () => ({ data: mockGroups, isLoading: false, isError: false }),
  useGroupInviteCount: () => ({ data: 2, refetch: jest.fn() }),
  useGroupBoardChatLive: () => false,
  useGroupChatSummary: () => ({ data: undefined }),
}))
// The board's rows have tests of their own; here only which group they are for.
jest.mock('../Board', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    BoardPreview: ({ groupId }: { groupId: string }) => <Text>{`board ${groupId}`}</Text>,
    ChatRow: () => null,
  }
})
jest.mock('../InviteSheet', () => ({ InviteSheet: () => null }))
jest.mock('@/data', () => ({ useUserId: () => 'me' }))
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}))

const group = (id: string, name: string): GroupSummary => ({
  id,
  name,
  icon_name: 'rice-bowl',
  icon_path: null,
  is_public: false,
  is_leader: false,
  member_count: 8,
  logged_today: 7,
  members: [],
})

const social = (
  <SafeAreaProvider initialMetrics={METRICS}>
    <SocialGroups />
  </SafeAreaProvider>
)

beforeEach(() => {
  mockPush.mockClear()
  setOpenGroup('me', null)
  mockGroups = [group('g1', 'Test Two'), group('g2', 'Makan Buddies')]
})

it('shows the first group until another is chosen, and remembers the choice', async () => {
  await render(social)
  expect(screen.getByText('board g1')).toBeOnTheScreen()
  expect(screen.getByText('7 of 8 logged today')).toBeOnTheScreen()

  await fireEvent.press(screen.getByRole('tab', { name: 'Makan Buddies' }))
  expect(screen.getByText('board g2')).toBeOnTheScreen()
})

it('falls back to the first group when the remembered one is gone', async () => {
  setOpenGroup('me', 'left-it')
  await render(social)
  expect(screen.getByText('board g1')).toBeOnTheScreen()
})

it('opens the full board from the card, and the Groups page with its invites counted', async () => {
  await render(social)
  await fireEvent.press(screen.getByLabelText('Test Two, 7 of 8 logged today, Open board'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/group/board', params: { id: 'g1' } })
  await fireEvent.press(screen.getByLabelText('Groups, Invites 2'))
  expect(mockPush).toHaveBeenCalledWith('/group')
})

it('offers to start a group to someone in none', async () => {
  mockGroups = []
  await render(social)
  await fireEvent.press(screen.getByText('Start a group'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/group', params: { new: '1' } })
})
