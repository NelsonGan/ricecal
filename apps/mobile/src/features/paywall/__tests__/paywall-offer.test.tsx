import '@/i18n'
import type { ComponentProps } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { render, screen, userEvent } from '@/test-utils'
import { ToastProvider } from '@/ui'
import { PaywallOffer } from '../PaywallOffer'

const mockReplace = jest.fn()
const mockAwaitEntitlement = jest.fn(async () => undefined)
const mockPurchasePlan = jest.fn(async (_plan: string) => undefined)
const mockRestorePurchases = jest.fn(async () => true)
const mockPurchasesAvailable = jest.fn(() => true)
const mockTrack = jest.fn()
const mockTrackPurchaseStarted = jest.fn()
const mockTrackPurchaseAbandoned = jest.fn()

const mockPlanPrices = {
  yearly: { priceString: 'RM99.90', perMonthString: 'RM8.33', freeTrialEligible: true },
  monthly: { priceString: 'RM12.90', freeTrialEligible: false },
  lifetime: { priceString: 'RM299.90', freeTrialEligible: false },
  yearlySavingPercent: 35,
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/data', () => ({
  useAwaitEntitlement: () => mockAwaitEntitlement,
  usePlanPrices: () => ({ data: mockPlanPrices }),
}))

jest.mock('@/data/purchases', () => ({
  isUserCancelled: () => false,
  PurchasesUnavailable: class PurchasesUnavailable extends Error {},
  purchasePlan: (plan: string) => mockPurchasePlan(plan),
  purchasesAvailable: () => mockPurchasesAvailable(),
  restorePurchases: () => mockRestorePurchases(),
}))

jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}))

jest.mock('../tracking', () => ({
  trackPurchaseStarted: (...args: unknown[]) => mockTrackPurchaseStarted(...args),
  trackPurchaseAbandoned: (...args: unknown[]) => mockTrackPurchaseAbandoned(...args),
}))

const user = userEvent.setup()

async function renderOffer(props: ComponentProps<typeof PaywallOffer>) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ToastProvider>
        <PaywallOffer {...props} />
      </ToastProvider>
    </SafeAreaProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPurchasesAvailable.mockReturnValue(true)
  mockRestorePurchases.mockResolvedValue(true)
  mockPurchasePlan.mockResolvedValue(undefined)
})

it('uses the same selected-plan offer on the standing paywall', async () => {
  await renderOffer({ screen: 'hard', onBack: jest.fn() })

  expect(screen.getByRole('header', { name: 'RiceCal Pro' })).toBeOnTheScreen()
  expect(screen.getAllByRole('radio')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Start free trial' })).toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: 'Maybe later' })).toBeNull()
})

it('purchases the selected plan from the one shared button', async () => {
  await renderOffer({ screen: 'hard', onBack: jest.fn() })

  await user.press(screen.getByRole('radio', { name: 'Monthly, Billed every month, RM12.90' }))
  await user.press(screen.getByRole('button', { name: 'Subscribe' }))

  expect(mockPurchasePlan).toHaveBeenCalledWith('monthly')
  expect(mockAwaitEntitlement).toHaveBeenCalledTimes(1)
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/paywall/welcome',
    params: { plan: 'monthly' },
  })
})

it('adds only the onboarding exit to the same offer', async () => {
  const later = jest.fn()
  await renderOffer({ screen: 'intro', onLater: later })

  expect(screen.getAllByRole('radio')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Start free trial' })).toBeOnTheScreen()
  await user.press(screen.getByRole('button', { name: 'Maybe later' }))
  expect(later).toHaveBeenCalledTimes(1)
})

it('restores through the same guarded store flow', async () => {
  await renderOffer({ screen: 'hard', onBack: jest.fn() })

  await user.press(screen.getByRole('button', { name: 'Restore Purchase' }))

  expect(mockRestorePurchases).toHaveBeenCalledTimes(1)
  expect(mockAwaitEntitlement).toHaveBeenCalledTimes(1)
  expect(mockTrack).toHaveBeenCalledWith('Restore Requested', { outcome: 'restored' })
})
