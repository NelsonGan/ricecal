import '@/i18n'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen } from '@/test-utils'
import WelcomeToPro from '../welcome'

let mockPlan = 'yearly'
let mockState = 'trial'
let mockTrialUnit: string | undefined = 'day'
let mockTrialCount: string | undefined = '3'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    plan: mockPlan,
    trialUnit: mockTrialUnit,
    trialCount: mockTrialCount,
  }),
}))

jest.mock('@/features/paywall', () => ({
  usePlanSummary: () => ({ state: mockState }),
}))

jest.mock('@/lib/navigation', () => ({
  useEnterApp: () => jest.fn(),
}))

beforeEach(() => {
  mockPlan = 'yearly'
  mockState = 'trial'
  mockTrialUnit = 'day'
  mockTrialCount = '3'
})

async function renderWelcome() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <WelcomeToPro />
    </SafeAreaProvider>,
  )
}

it('describes the purchased trial using the selected store product', async () => {
  await renderWelcome()
  expect(
    screen.getByText('Your free trial lasts 3 days. Everything is unlocked.'),
  ).toBeOnTheScreen()
})

it('never guesses seven days when the store period is unavailable', async () => {
  mockTrialUnit = undefined
  mockTrialCount = undefined
  await renderWelcome()
  expect(screen.getByText('Your free trial starts now. Everything is unlocked.')).toBeOnTheScreen()
})

it('does not promise a trial to a purchase that was charged immediately', async () => {
  mockState = 'active'
  await renderWelcome()
  expect(screen.getByText('Everything is unlocked.')).toBeOnTheScreen()
})
