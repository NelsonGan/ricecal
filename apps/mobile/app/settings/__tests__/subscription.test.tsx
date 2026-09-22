import '@/i18n'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { PlanSummary } from '@/features/paywall'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import SubscriptionScreen from '../subscription'

/**
 * The rule this file exists for: a trial never gets offered a plan switch.
 *
 * A plan change out of a free trial ends the trial and bills the new plan at
 * once, so the switch is a charge wearing the clothes of plan admin. Two
 * App Store accounts took it from this screen and were charged within the
 * minute. Cancelling is what a trial wants, so cancelling is the footer.
 */

const mockOpenManage = jest.fn()
const mockPush = jest.fn()

/**
 * The hook's own type, not a copy of it. A type import is erased, so it never
 * reaches the `jest.mock` factory below, and it is what makes this mock fail to
 * compile rather than quietly go stale when `usePlanSummary` grows a field the
 * screen then reads.
 */
type Summary = PlanSummary

const PAID_YEARLY: Summary = {
  state: 'active',
  plan: 'yearly',
  trialEndsAt: null,
  trialStartedAt: null,
  renews: true,
}
let mockSummary: Summary = PAID_YEARLY
let mockEntitled = true

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/data', () => ({
  useEntitlement: () => ({ entitled: mockEntitled }),
  usePlanPrices: () => ({
    data: { yearly: { priceString: 'RM99.90' }, monthly: { priceString: 'RM19.90' } },
  }),
}))

jest.mock('@/data/purchases', () => ({
  openManageSubscriptions: (...args: unknown[]) => mockOpenManage(...args),
}))

jest.mock('@/features/paywall', () => ({
  PLAN_FEATURES: jest.requireActual('@/features/paywall/PlanTable').PLAN_FEATURES,
  usePlanSummary: () => mockSummary,
}))

jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))

const user = userEvent.setup()

const mount = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ToastProvider>
        <SubscriptionScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockSummary = PAID_YEARLY
  mockEntitled = true
})

it('offers no plan switch during a trial, and cancelling instead', async () => {
  mockSummary = {
    state: 'trial',
    plan: 'yearly',
    trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    trialStartedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    renews: true,
  }
  await mount()

  expect(screen.queryByText('Switch to monthly')).toBeNull()
  expect(screen.getByText('Cancel subscription')).toBeOnTheScreen()
})

it('offers the switch once the subscription is paid for', async () => {
  await mount()

  await user.press(screen.getByText('Switch to monthly'))
  expect(mockOpenManage).toHaveBeenCalledWith('switch', 'subscription')
})

it('sends a cancellation to the store, and says so first', async () => {
  await mount()

  await user.press(screen.getByText('Cancel subscription'))
  expect(mockOpenManage).not.toHaveBeenCalled()

  await user.press(screen.getByText('Cancel plan'))
  expect(mockOpenManage).toHaveBeenCalledWith('cancel', 'subscription')
})

it('has nothing to cancel or switch on a promotional grant', async () => {
  mockSummary = {
    state: 'active',
    plan: null,
    trialEndsAt: null,
    trialStartedAt: null,
    renews: false,
  }
  await mount()

  expect(screen.queryByText('Cancel subscription')).toBeNull()
  expect(screen.queryByText('Switch to yearly')).toBeNull()
  expect(screen.getByText('Manage in the store')).toBeOnTheScreen()
})

it('sells Pro rather than managing it when nothing is entitled', async () => {
  mockEntitled = false
  mockSummary = {
    state: 'none',
    plan: null,
    trialEndsAt: null,
    trialStartedAt: null,
    renews: false,
  }
  await mount()

  expect(screen.queryByText('Cancel subscription')).toBeNull()
  expect(screen.queryByText('Switch to monthly')).toBeNull()
})
