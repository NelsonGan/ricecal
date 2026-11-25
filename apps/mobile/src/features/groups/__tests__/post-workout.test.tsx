import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen } from '@/test-utils'
import '@/i18n'
import { PostWorkoutScreen } from '../WorkoutView'

const mockReplace = jest.fn()
let mockOwner = 'mina'
let mockGone = false
beforeEach(() => {
  mockReplace.mockClear()
  mockOwner = 'mina'
  mockGone = false
})
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}
const draw = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PostWorkoutScreen postId="post" />
    </SafeAreaProvider>,
  )

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/data', () => ({
  useUserId: () => 'me',
  useSettings: () => ({ data: { units: 'metric' } }),
}))
jest.mock('@/data/social', () => ({
  useSocialPostWorkout: () => ({
    data: mockGone
      ? null
      : {
          owner: { id: mockOwner, name: 'Mina Tan', handle: 'mina', avatar_path: null },
          workout: { id: 'workout', name: 'Push day' },
        },
    isError: false,
    fetchStatus: 'idle',
    refetch: jest.fn(),
  }),
}))
jest.mock('@/features/workouts', () => ({
  SessionFigures: () => null,
  SessionExercises: () => null,
}))
jest.mock('../parts', () => ({
  PersonAvatar: () => null,
  useOpenProfile: () => jest.fn(),
}))

it("draws someone else's workout post under their name", async () => {
  await draw()
  expect(screen.getByText('Push day')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Mina Tan/ })).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
})

it('hands your own post over to your own workout page', async () => {
  mockOwner = 'me'
  await draw()
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: 'workout' } })
  // Not the reduced page a stranger reads, even for a frame.
  expect(screen.queryByRole('button', { name: /Mina Tan/ })).toBeNull()
})

it('says a deleted or hidden post is gone, with nothing to retry', async () => {
  mockGone = true
  await draw()
  expect(screen.getByText('This is no longer available')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})
