import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { ProPitch } from '../ProPitch'

/**
 * The standing paywall has no selected plan and no second purchase button.
 * Each price card is the action it describes, while restore and privacy remain
 * quiet links below the choices.
 */

const mockOpenLegal = jest.fn()
const mockPlanPrices = {
  yearly: { priceString: 'RM99.90', perMonthString: 'RM8.33', freeTrialEligible: true },
  monthly: { priceString: 'RM12.90', freeTrialEligible: false },
  lifetime: { priceString: 'RM299.90', freeTrialEligible: false },
  yearlySavingPercent: 35,
}
let mockPrices: typeof mockPlanPrices | undefined = mockPlanPrices

jest.mock('@/data', () => ({
  usePlanPrices: () => ({
    data: mockPrices,
  }),
}))

jest.mock('@/lib/legal', () => ({
  PRIVACY_URL: 'https://ricecal.app/privacy',
  TERMS_URL: 'https://ricecal.app/terms',
  openLegal: (url: string) => mockOpenLegal(url),
}))

const user = userEvent.setup()

beforeEach(() => {
  jest.clearAllMocks()
  mockPrices = mockPlanPrices
})

it('makes each plan card its purchase action', async () => {
  const purchase = jest.fn()
  await render(<ProPitch mode="purchase" onPlanPurchase={purchase} onRestore={jest.fn()} />)

  await user.press(screen.getByRole('button', { name: 'Monthly, RM12.90 a month.' }))

  expect(purchase).toHaveBeenCalledWith('monthly')
  expect(screen.queryByText('Subscribe')).toBeNull()
})

it('keeps purchase terms and legal links on direct-action cards', async () => {
  const restore = jest.fn()
  await render(<ProPitch mode="purchase" onPlanPurchase={jest.fn()} onRestore={restore} />)

  expect(screen.getByText('Free for 7 days, then RM99.90 a year.')).toBeOnTheScreen()
  expect(screen.getByText('RM12.90 a month.')).toBeOnTheScreen()
  expect(
    screen.getByText('One payment of RM299.90. No subscription, no renewal.'),
  ).toBeOnTheScreen()
  expect(screen.getByText('Restore Purchase')).toBeOnTheScreen()
  expect(screen.getByText('Terms')).toBeOnTheScreen()
  expect(screen.getByText('Privacy Policy')).toBeOnTheScreen()

  await user.press(screen.getByText('Restore Purchase'))
  expect(restore).toHaveBeenCalledTimes(1)

  await user.press(screen.getByText('Terms'))
  expect(mockOpenLegal).toHaveBeenCalledWith('https://ricecal.app/terms')

  await user.press(screen.getByText('Privacy Policy'))
  expect(mockOpenLegal).toHaveBeenCalledWith('https://ricecal.app/privacy')
})

it('does not add placeholder terms while store prices are loading', async () => {
  mockPrices = undefined
  await render(<ProPitch mode="purchase" onPlanPurchase={jest.fn()} onRestore={jest.fn()} />)

  expect(screen.queryByText(/Price shown before purchase/i)).toBeNull()
  expect(screen.getByRole('button', { name: 'Yearly, Billed every year, —' })).toBeOnTheScreen()
})

it('blocks a second purchase while the store is opening', async () => {
  const purchase = jest.fn()
  await render(
    <ProPitch
      mode="purchase"
      purchasingPlan="monthly"
      onPlanPurchase={purchase}
      onRestore={jest.fn()}
    />,
  )

  const yearly = screen.getByRole('button', {
    name: 'Yearly, SAVE 35%, Free for 7 days, then RM99.90 a year., RM8.33 a month',
  })
  const monthly = screen.getByRole('button', { name: 'Monthly, RM12.90 a month.' })

  expect(yearly).toBeDisabled()
  expect(monthly.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
  await user.press(yearly)
  expect(purchase).not.toHaveBeenCalled()
})

it('blocks plan and restore actions while a restore is opening the store', async () => {
  const purchase = jest.fn()
  const restore = jest.fn()
  await render(<ProPitch mode="purchase" restoring onPlanPurchase={purchase} onRestore={restore} />)

  const yearly = screen.getByRole('button', {
    name: 'Yearly, SAVE 35%, Free for 7 days, then RM99.90 a year., RM8.33 a month',
  })
  const restoreLink = screen.getByRole('button', { name: 'Restore Purchase' })

  expect(yearly).toBeDisabled()
  expect(restoreLink).toBeDisabled()
  await user.press(yearly)
  await user.press(restoreLink)
  expect(purchase).not.toHaveBeenCalled()
  expect(restore).not.toHaveBeenCalled()
})
