import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { ActivityCard } from '../ActivityCard'

/**
 * The activity card on Today.
 *
 * What is pinned is the one claim it must not make: zero steps on an account
 * with no health store would be a statement about the user rather than about
 * the phone, so no figure at all is drawn without one. And the Workouts button
 * is the way into Workouts from Today, so it has to go there.
 */

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const user = userEvent.setup()

beforeEach(() => mockPush.mockClear())

it('draws the steps a health store reported', async () => {
  await render(<ActivityCard steps={8426} />)
  expect(screen.getByText('8,426', { exact: false })).toBeOnTheScreen()
  expect(screen.getByText('Activity')).toBeOnTheScreen()
})

it('draws no figure when no store reported the day', async () => {
  await render(<ActivityCard steps={null} />)
  expect(screen.queryByText(/step/)).toBeNull()
  expect(screen.queryByText('0', { exact: false })).toBeNull()
})

it('opens Workouts', async () => {
  await render(<ActivityCard steps={null} />)
  await user.press(screen.getByText('Workouts'))
  expect(mockPush).toHaveBeenCalledWith('/workouts')
})
