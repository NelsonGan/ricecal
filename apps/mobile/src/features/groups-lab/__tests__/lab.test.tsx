import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { ChallengeLeague } from '../ChallengeLeague'
import { GroupsLabHub } from '../Hub'
import { JoinInvite } from '../Join'
import { MakanTable } from '../MakanTable'
import { StreakCircle } from '../StreakCircle'
import { WeeklyPact } from '../WeeklyPact'

const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockParams: { step?: string } = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}))

// The calorie ring draws with Skia, whose jest fallback has no CanvasKit to
// build paths with. Nothing here is about the drawing, as in calculating.test.
jest.mock('@shopify/react-native-skia', () => {
  const builder = { addArc: () => builder, detach: () => ({}) }
  return {
    Canvas: ({ children }: { children?: unknown }) => children ?? null,
    Path: () => null,
    Skia: { PathBuilder: { Make: () => builder } },
  }
})

const user = userEvent.setup()

function show(ui: ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

it('lists the four directions and opens each one', async () => {
  await show(<GroupsLabHub />)
  for (const group of ['Gym Kakis', 'Family', 'Makan Kakis', 'Lunch Kakis']) {
    expect(screen.getByText(group)).toBeOnTheScreen()
  }
  await user.press(screen.getByText('Gym Kakis'))
  expect(mockPush).toHaveBeenCalledWith('/labs/groups/streak')
})

it('joins from an invite and lands on the pact week', async () => {
  await show(<JoinInvite />)
  expect(screen.getByText('Never shared')).toBeOnTheScreen()
  await user.press(screen.getByText('Join Lunch Kakis'))
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/labs/groups/pact',
    params: { step: 'week' },
  })
})

it('keeps the circle streak once the last friend logs', async () => {
  await show(<StreakCircle />)
  expect(screen.getByText('4 of 5 in today')).toBeOnTheScreen()
  await user.press(screen.getByText('Gym Kakis'))
  expect(screen.getByText('12')).toBeOnTheScreen()
  await user.press(screen.getByText('Arif logs lunch'))
  expect(screen.getByText('13')).toBeOnTheScreen()
  expect(screen.getByText('Everyone is in for today')).toBeOnTheScreen()
})

it('moves you to the top of the podium when you score', async () => {
  await show(<ChallengeLeague />)
  await user.press(screen.getByText('Next: invite friends'))
  await user.press(screen.getByText('Start challenge'))
  expect(screen.getByText('You are #2')).toBeOnTheScreen()
  await user.press(screen.getAllByText('Do it')[0])
  expect(screen.getByText('You are #1')).toBeOnTheScreen()
})

it('opens a friend’s meal from the table and takes a reaction', async () => {
  await show(<MakanTable />)
  await user.press(screen.getByLabelText('Wei Ling, Lunch, Char kuey teow'))
  expect(screen.getByText('wah worth it')).toBeOnTheScreen()
  await user.press(screen.getByText('Strong 2'))
  expect(screen.getByText('Strong 3')).toBeOnTheScreen()
})

it('tracks the pact against the targets the group set', async () => {
  mockParams = { step: 'week' }
  await show(<WeeklyPact />)
  expect(screen.getAllByText('Done')).toHaveLength(2)
  expect(screen.getByText('Behind')).toBeOnTheScreen()
  await user.press(screen.getByText('Skip to Sunday'))
  expect(screen.getByText('Arif owes kopi')).toBeOnTheScreen()
})
