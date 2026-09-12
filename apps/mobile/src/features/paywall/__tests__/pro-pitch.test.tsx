import '@/i18n'
import { render, screen, userEvent } from '@/test-utils'
import { ProPitch } from '../ProPitch'

const mockOpenLegal = jest.fn()
const mockPlanPrices = {
  yearly: { priceString: 'RM99.90', perMonthString: 'RM8.33', freeTrialEligible: true },
  monthly: { priceString: 'RM12.90', freeTrialEligible: false },
  lifetime: { priceString: 'RM299.90', freeTrialEligible: false },
  yearlySavingPercent: 35,
}
let mockPrices: typeof mockPlanPrices | undefined = mockPlanPrices

jest.mock('@/data', () => ({
  usePlanPrices: () => ({ data: mockPrices }),
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

it('shows one selected-plan offer with the comparison beneath it', async () => {
  await render(<ProPitch plan="yearly" onPlanChange={jest.fn()} onRestore={jest.fn()} />)

  expect(screen.queryByText('No limits with RiceCal Pro')).toBeNull()
  expect(screen.getByText('Choose your plan')).toBeOnTheScreen()
  expect(screen.getByText('Everything in Pro')).toBeOnTheScreen()
  expect(screen.getByText('See exactly what unlocks when you upgrade')).toBeOnTheScreen()
  expect(
    screen.getByRole('radio', {
      name: 'Yearly, SAVE 35%, Billed every year, RM99.90, RM8.33 a month',
    }),
  ).toBeSelected()
})

it('keeps the reassurance neutral instead of presenting it as a benefit', async () => {
  await render(<ProPitch plan="yearly" onPlanChange={jest.fn()} onRestore={jest.fn()} />)

  expect(screen.getByText('No commitment, cancel any time')).toHaveProp(
    'className',
    expect.stringContaining('text-muted'),
  )
})

it('hands a newly selected plan back to the shared purchase flow', async () => {
  const change = jest.fn()
  await render(<ProPitch plan="yearly" onPlanChange={change} onRestore={jest.fn()} />)

  await user.press(screen.getByRole('radio', { name: 'Monthly, Billed every month, RM12.90' }))

  expect(change).toHaveBeenCalledWith('monthly')
})

it('uses lifetime copy for a one-off purchase', async () => {
  await render(<ProPitch plan="lifetime" onPlanChange={jest.fn()} onRestore={jest.fn()} />)

  expect(screen.getByText('One payment, refundable through the store')).toBeOnTheScreen()
  expect(
    screen.getByText('One payment of RM299.90. No subscription, no renewal.'),
  ).toBeOnTheScreen()
})

it('keeps restore and legal links at the end of the offer', async () => {
  const restore = jest.fn()
  await render(<ProPitch plan="yearly" onPlanChange={jest.fn()} onRestore={restore} />)

  await user.press(screen.getByText('Restore Purchase'))
  expect(restore).toHaveBeenCalledTimes(1)

  await user.press(screen.getByText('Terms'))
  expect(mockOpenLegal).toHaveBeenCalledWith('https://ricecal.app/terms')

  await user.press(screen.getByText('Privacy'))
  expect(mockOpenLegal).toHaveBeenCalledWith('https://ricecal.app/privacy')
})

it('shows no guessed price or terms while the store is loading', async () => {
  mockPrices = undefined
  await render(<ProPitch plan="yearly" onPlanChange={jest.fn()} onRestore={jest.fn()} />)

  expect(screen.queryByText(/Price shown before purchase/i)).toBeNull()
  expect(screen.queryByText(/Free for 7 days/i)).toBeNull()
  expect(screen.getByRole('radio', { name: 'Yearly, Billed every year, —' })).toBeOnTheScreen()
})

it('blocks plan and restore actions while the store is opening', async () => {
  const change = jest.fn()
  const restore = jest.fn()
  await render(<ProPitch disabled plan="yearly" onPlanChange={change} onRestore={restore} />)

  const monthly = screen.getByRole('radio', {
    name: 'Monthly, Billed every month, RM12.90',
  })
  const restoreLink = screen.getByRole('button', { name: 'Restore Purchase' })

  expect(monthly).toBeDisabled()
  expect(restoreLink).toBeDisabled()
  await user.press(monthly)
  await user.press(restoreLink)
  expect(change).not.toHaveBeenCalled()
  expect(restore).not.toHaveBeenCalled()
})
