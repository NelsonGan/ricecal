import { ScrollView } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { act, fireEvent, render, screen, within } from '@/test-utils'
import '@/i18n'
import type { GroupSummary } from '@/data/groups'
import { SocialGroups } from '../SocialGroups'
import { setOpenGroup } from '../store'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

const mockPush = jest.fn()
let mockFocusCallbacks: (() => void)[] = []
let mockGroups: GroupSummary[] = []
let mockFetching = false
let mockError = false
/** When the list last arrived from the server, as React Query keeps it. */
let mockUpdatedAt = 0
const mockRefetch = jest.fn()

jest.mock('@/data/groups', () => ({
  ...jest.requireActual('@/data/groups'),
  useMyGroups: () => ({
    data: mockGroups,
    isLoading: false,
    isError: mockError,
    dataUpdatedAt: mockUpdatedAt,
    isFetching: mockFetching,
    fetchStatus: mockFetching ? 'fetching' : 'idle',
    refetch: mockRefetch,
  }),
  useGroupInviteCount: () => ({ data: 2, refetch: jest.fn() }),
  useGroupBoardChatLive: () => false,
  useGroupChatSummary: () => ({ data: undefined }),
}))
// The board's rows have tests of their own; here only which group they are for.
jest.mock('../Board', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    BoardPreview: ({ groupId, live }: { groupId: string; live: boolean }) => (
      <Text>{`board ${groupId}${live ? '' : ' paused'}`}</Text>
    ),
    ChatRow: () => null,
  }
})
jest.mock('../InviteSheet', () => ({ InviteSheet: () => null }))
jest.mock('@/data', () => ({ useUserId: () => 'me' }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback)
  },
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

const social = (inView = true) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <SocialGroups inView={inView} />
  </SafeAreaProvider>
)

beforeEach(() => {
  mockPush.mockClear()
  mockFocusCallbacks = []
  mockRefetch.mockReset()
  // As React Query does: a successful fetch stamps the list anew.
  mockRefetch.mockImplementation(async () => {
    mockUpdatedAt = Date.now()
    return { isError: false }
  })
  mockFetching = false
  mockError = false
  mockUpdatedAt = Date.now() - 60_000
  setOpenGroup('me', null)
  mockGroups = [group('g1', 'Test Two'), group('g2', 'Makan Buddies')]
})

it('shows the first group until another is chosen, and remembers the choice', async () => {
  await render(social())
  expect(screen.getByText('board g1')).toBeOnTheScreen()
  expect(screen.getByText('7 of 8 logged today')).toBeOnTheScreen()

  await fireEvent.press(screen.getByRole('tab', { name: 'Makan Buddies' }))
  expect(screen.getByText('board g2')).toBeOnTheScreen()
})

it('falls back to the first group when the remembered one is gone, and forgets it', async () => {
  setOpenGroup('me', 'left-it')
  const view = await render(social())
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  await view.rerender(social())
  expect(screen.getByText('board g1')).toBeOnTheScreen()

  // Forgotten, not merely hidden: a group by that id turning up later is not
  // opened on its own.
  mockGroups = [...mockGroups, group('left-it', 'Old Crew')]
  await view.rerender(social())
  expect(screen.getByText('board g1')).toBeOnTheScreen()
})

it('asks again for a group a notification opened before this phone listed it', async () => {
  setOpenGroup('me', 'joined-elsewhere')
  // Settled only when the list lands, as a real refetch is.
  let land: (result: { isError: boolean }) => void = () => {}
  mockRefetch.mockImplementation(() => {
    mockFetching = true
    return new Promise((resolve) => {
      land = resolve
    })
  })
  const view = await render(social())
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  await view.rerender(social())
  expect(screen.queryByText(/^board/)).toBeNull()

  mockFetching = false
  mockUpdatedAt = Date.now()
  mockGroups = [...mockGroups, group('joined-elsewhere', 'Lunch Club')]
  land({ isError: false })
  await view.rerender(social())
  expect(screen.getByText('board joined-elsewhere')).toBeOnTheScreen()
})

it('opens the full board from the card, and the Groups page with its invites counted', async () => {
  await render(social())
  await fireEvent.press(screen.getByLabelText('Test Two, 7 of 8 logged today, Open board'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/group/board', params: { id: 'g1' } })
  await fireEvent.press(screen.getByLabelText('Groups, Invites 2'))
  expect(mockPush).toHaveBeenCalledWith('/group')
})

it('offers to start a group to someone in none', async () => {
  mockGroups = []
  await render(social())
  await fireEvent.press(screen.getByText('Start a group'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/group', params: { new: '1' } })
})

it('stops reading the board once the card has scrolled away', async () => {
  await render(social(false))
  expect(screen.getByText('board g1 paused')).toBeOnTheScreen()
})

it('waits for a group just made rather than showing another, and falls back once the list settles', async () => {
  setOpenGroup('me', 'just-made')
  mockFetching = true
  const view = await render(social())
  expect(screen.queryByText(/^board/)).toBeNull()

  mockFetching = false
  await view.rerender(social())
  expect(screen.getByText('board g1')).toBeOnTheScreen()
})

it('keeps a group a notification opened when asking for it fails, and asks only once', async () => {
  // The refetch that should prove the group gone failed instead (a timeout or a
  // 5xx, with the connection up). React Query keeps the old list and goes idle,
  // which is not an answer: the group stays chosen for the next list that
  // arrives, without asking again or blanking the card meanwhile.
  setOpenGroup('me', 'joined-elsewhere')
  mockRefetch.mockImplementation(async () => {
    mockError = true
    return { isError: true }
  })
  const view = await render(social())
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  await view.rerender(social())
  await view.rerender(social())
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  expect(screen.getByText('board g1')).toBeOnTheScreen()

  // Later, a pull to refresh brings the list with the group in it.
  mockError = false
  mockUpdatedAt = Date.now() + 1
  mockGroups = [...mockGroups, group('joined-elsewhere', 'Lunch Club')]
  await view.rerender(social())
  expect(screen.getByText('board joined-elsewhere')).toBeOnTheScreen()
})

it('forgets a group the first list after a failed ask leaves out', async () => {
  setOpenGroup('me', 'left-it')
  mockRefetch.mockImplementation(async () => {
    mockError = true
    return { isError: true }
  })
  const view = await render(social())
  await view.rerender(social())

  mockError = false
  mockUpdatedAt = Date.now() + 1
  mockGroups = [...mockGroups]
  await view.rerender(social())
  await view.rerender(social())
  expect(mockRefetch).toHaveBeenCalledTimes(1)
  expect(screen.getByText('board g1')).toBeOnTheScreen()

  // Forgotten, not merely hidden: a group by that id turning up later is not
  // opened on its own.
  mockGroups = [...mockGroups, group('left-it', 'Old Crew')]
  await view.rerender(social())
  expect(screen.getByText('board g1')).toBeOnTheScreen()
})

const tabNames = () =>
  screen.getAllByRole('tab').map((tab) => String(within(tab).getByText(/.+/).props.children))

it('puts a remembered group at the front of the pill row on launch', async () => {
  mockGroups = [
    group('g1', 'Test Two'),
    group('g2', 'Makan Buddies'),
    group('g3', 'Gym Crew'),
    group('g4', 'Family Table'),
  ]
  setOpenGroup('me', 'g4')

  await render(social())
  expect(tabNames()).toEqual(['Family Table', 'Test Two', 'Makan Buddies', 'Gym Crew'])
  expect(screen.getByRole('tab', { name: 'Family Table' }).props.accessibilityState).toEqual({
    selected: true,
  })
  expect(screen.getByText('board g4')).toBeOnTheScreen()
})

it('keeps the pill row still on tap, then moves the chosen group to the front on relaunch', async () => {
  mockGroups = [
    group('g1', 'Test Two'),
    group('g2', 'Makan Buddies'),
    group('g3', 'Gym Crew'),
    group('g4', 'Family Table'),
  ]

  const first = await render(social())
  expect(tabNames()).toEqual(['Test Two', 'Makan Buddies', 'Gym Crew', 'Family Table'])

  await fireEvent.press(screen.getByRole('tab', { name: 'Family Table' }))
  expect(screen.getByText('board g4')).toBeOnTheScreen()
  // Tapping in place does not jump the pill out from under the finger.
  expect(tabNames()).toEqual(['Test Two', 'Makan Buddies', 'Gym Crew', 'Family Table'])

  await first.unmount()

  // Second launch starts with the remembered group at the front.
  await render(social())
  expect(tabNames()).toEqual(['Family Table', 'Test Two', 'Makan Buddies', 'Gym Crew'])
  expect(screen.getByText('board g4')).toBeOnTheScreen()
})

it('moves a group chosen outside the pill row to the front and rewinds the strip', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {})
  mockGroups = [
    group('g1', 'Test Two'),
    group('g2', 'Makan Buddies'),
    group('g3', 'Gym Crew'),
    group('g4', 'Family Table'),
  ]

  await render(social())
  scrollTo.mockClear()

  await act(() => {
    setOpenGroup('me', 'g3')
  })

  expect(tabNames()).toEqual(['Gym Crew', 'Test Two', 'Makan Buddies', 'Family Table'])
  expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: false })
  scrollTo.mockRestore()
})

it('moves a tapped group to the front and rewinds the strip when returning to Social', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {})
  mockGroups = [
    group('g1', 'Test Two'),
    group('g2', 'Makan Buddies'),
    group('g3', 'Gym Crew'),
    group('g4', 'Family Table'),
  ]

  await render(social())
  await fireEvent.press(screen.getByRole('tab', { name: 'Family Table' }))
  expect(tabNames()).toEqual(['Test Two', 'Makan Buddies', 'Gym Crew', 'Family Table'])

  scrollTo.mockClear()
  // Focus callbacks are pushed on each render; invoke the latest pair once.
  const latest = mockFocusCallbacks.slice(-2)
  await act(() => {
    for (const callback of latest) callback()
  })

  expect(tabNames()).toEqual(['Family Table', 'Test Two', 'Makan Buddies', 'Gym Crew'])
  expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: false })
  scrollTo.mockRestore()
})
