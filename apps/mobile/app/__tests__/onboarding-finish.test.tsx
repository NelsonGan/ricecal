import { SafeAreaProvider } from 'react-native-safe-area-context'
import { allAnnouncementIds } from '@/features/news/announcements'
import { render } from '@/test-utils'
import FinishStep from '../(onboarding)/finish'

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const mockMutate = jest.fn()
const draft = {
  units: 'metric',
  sex: 'female',
  age: 30,
  heightCm: 160,
  weightKg: 60,
  targetWeightKg: 55,
  activity: 'light',
  referralSource: 'tiktok',
}
jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({ replace: jest.fn() }),
}))
jest.mock('@/data', () => ({
  useSession: () => ({ session: { user: { id: 'me' } }, loading: false }),
  useFinishOnboarding: () => ({ mutate: mockMutate, isError: false, isPending: true }),
}))
jest.mock('@/features/onboarding', () => ({
  isComplete: () => true,
  ONBOARDING_STEPS: ['units'],
  useOnboardingDraft: () => ({ draft, clear: jest.fn() }),
}))
jest.mock('@/lib/analytics', () => ({
  planDirection: () => 'lose',
  setPersonProps: jest.fn(),
  track: jest.fn(),
}))

it('starts a new account sharing to the feed, with every announcement already seen', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FinishStep />
    </SafeAreaProvider>,
  )
  expect(mockMutate).toHaveBeenCalledTimes(1)
  expect(mockMutate.mock.calls[0][0]).toMatchObject({
    autoPostFoods: true,
    seenAnnouncements: allAnnouncementIds(),
  })
})
