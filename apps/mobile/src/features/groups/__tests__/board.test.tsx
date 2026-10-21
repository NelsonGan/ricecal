import { SafeAreaProvider } from 'react-native-safe-area-context'
import { fireEvent, render, screen } from '@/test-utils'
import '@/i18n'
import type { BoardEntry, BoardMember, GroupBoard } from '@/data/groups'
import { ToastProvider } from '@/ui'
import { GroupBoardScreen } from '../Board'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const mockPress = jest.fn()
const mockRun = jest.fn(() => Promise.resolve('nudge-id'))
let mockBoard: GroupBoard

jest.mock('@/data/groups', () => ({
  ...jest.requireActual('@/data/groups'),
  useGroupBoard: () => ({ data: mockBoard, isError: false, refetch: jest.fn() }),
  useMyGroups: () => ({ data: undefined }),
  useGroupMessages: () => ({ data: [], isLoading: false }),
  useGroupAction: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}))
jest.mock('../parts', () => ({
  ...jest.requireActual('../parts'),
  useGroupTask: () => ({ press: mockPress, run: mockRun, isPending: false }),
  EntryPicture: () => null,
  PersonAvatar: () => null,
}))
jest.mock('@/data', () => ({
  useUserId: () => 'me',
  dateKey: () => '2026-10-21',
  storedImageSource: () => undefined,
  useMealPhotoUrl: () => ({ data: undefined }),
}))
jest.mock('@/data/moderation', () => ({ useBlockAuthor: () => ({ mutate: jest.fn() }) }))
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: jest.fn() }),
}))

const entry = (id: string, meal: BoardEntry['meal'], name: string): BoardEntry => ({
  id,
  meal,
  name,
  kcal: 500,
  carbs_g: 60,
  protein_g: 20,
  fat_g: 15,
  photo_path: null,
  icon_set: 'dishes',
  icon_name: 'nasi-lemak',
  logged_at: '2026-10-21T04:00:00Z',
  serving_label: '1 plate',
  likes: 0,
  dislikes: 0,
  mine: 0,
})
const member = (id: string, name: string, patch: Partial<BoardMember> = {}): BoardMember => ({
  person: { id, name, handle: id, avatar_path: null },
  entries: [],
  nudges: {},
  nudgeable: [],
  workout: null,
  ...patch,
})

beforeEach(() => {
  mockPress.mockClear()
  mockRun.mockClear()
  mockBoard = {
    group: {
      id: 'g1',
      name: 'Makan Buddies',
      icon_name: 'rice-bowl',
      is_public: false,
      leader_id: 'me',
      member_count: 7,
    },
    members: [
      member('me', 'Pro Tester', { entries: [entry('e1', 'breakfast', 'Nasi lemak')] }),
      member('aisha', 'Aisha Rahman', {
        entries: [entry('e2', 'lunch', 'Yong tau foo'), entry('e3', 'lunch', 'Iced lime tea')],
        workout: { name: 'Yoga', kind: 'yoga', duration_s: 1800, count: 1 },
      }),
      member('weijie', 'Wei Jie Tan', { nudgeable: ['lunch'] }),
      member('hafiz', 'Hafiz Ismail', {
        nudges: {
          breakfast: {
            by: { id: 'aisha', name: 'Aisha Rahman', handle: 'aisha', avatar_path: null },
          },
        },
      }),
      member('priya', 'Priya Nair'),
      member('meiling', 'Mei Ling Wong'),
      member('daniel', 'Daniel Lim'),
    ],
    chat: {
      unread: 1,
      last: {
        author: { id: 'hafiz', name: 'Hafiz Ismail', handle: 'hafiz', avatar_path: null },
        body: 'cheat day lah',
      },
    },
  }
})

const board = (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ToastProvider>
      <GroupBoardScreen groupId="g1" onBack={jest.fn()} />
    </ToastProvider>
  </SafeAreaProvider>
)

it('puts the viewer first and draws each meal in its column', async () => {
  await render(board)
  expect(screen.getByText('Makan Buddies')).toBeOnTheScreen()
  expect(screen.getByText('You')).toBeOnTheScreen()
  expect(screen.getByLabelText('Nasi lemak, 500 kcal')).toBeOnTheScreen()
  // Two foods in one meal share a tile; both are there to swipe through.
  expect(screen.getByLabelText('Yong tau foo, 500 kcal, 1 of 2')).toBeOnTheScreen()
  expect(screen.getByLabelText('Iced lime tea, 500 kcal, 2 of 2')).toBeOnTheScreen()
  expect(screen.getByLabelText('Yoga, 30m')).toBeOnTheScreen()
})

it('offers to log only the viewer’s own empty meals today', async () => {
  await render(board)
  expect(screen.getAllByLabelText('Log a meal')).toHaveLength(2)
})

it('nudges an empty meal that is open, and says who nudged one that is not', async () => {
  await render(board)
  expect(screen.getByText('Aisha nudged')).toBeOnTheScreen()
  await fireEvent.press(screen.getByLabelText('Nudge Wei about lunch'))
  expect(mockRun).toHaveBeenCalledWith({
    action: 'nudge',
    groupId: 'g1',
    day: '2026-10-21',
    targetId: 'weijie',
    meal: 'lunch',
  })
})

it('gives two people with one first name their full names', async () => {
  mockBoard.members[4] = member('priya', 'Wei Ming Lee')
  await render(board)
  expect(screen.getByText('Wei Jie Tan')).toBeOnTheScreen()
  expect(screen.getByText('Wei Ming Lee')).toBeOnTheScreen()
})

it('folds the board after five rows and unfolds on request', async () => {
  await render(board)
  expect(screen.queryByText('Daniel')).toBeNull()
  await fireEvent.press(screen.getByText('Show 2 more'))
  expect(screen.getByText('Daniel')).toBeOnTheScreen()
  expect(screen.getByText('Show less')).toBeOnTheScreen()
})

it('shows the day’s last message and its unread count in the chat bar', async () => {
  await render(board)
  expect(screen.getByText('Hafiz: cheat day lah')).toBeOnTheScreen()
})
