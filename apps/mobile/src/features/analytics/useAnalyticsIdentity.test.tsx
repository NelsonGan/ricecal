import { render } from '@testing-library/react-native'
import { setPersonProps, setSuperProps } from '@/lib/analytics'
import { useAnalyticsIdentity } from './useAnalyticsIdentity'

const mockAccount = {
  userId: 'first',
  profile: { onboarded_at: '2026-09-01', activity_level: 'light', referral_source: 'friend' },
  reminders: [{ reminder_enabled: true }],
  entitlement: { entitled: true, loading: false, unknown: false },
}

jest.mock('@/data', () => ({
  useSession: () => ({ userId: mockAccount.userId }),
  useProfile: () => ({ data: mockAccount.profile }),
  useMealTimes: () => ({ data: mockAccount.reminders }),
  useEntitlement: () => mockAccount.entitlement,
  fromDbActivity: (value: string) => value,
}))
jest.mock('@/lib/analytics', () => ({ setPersonProps: jest.fn(), setSuperProps: jest.fn() }))

function Probe() {
  useAnalyticsIdentity()
  return null
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAccount.userId = 'first'
  mockAccount.entitlement = { entitled: true, loading: false, unknown: false }
})

it('writes profile, reminders and known entitlement for a new account with identical answers', async () => {
  const view = await render(<Probe />)
  jest.clearAllMocks()
  mockAccount.userId = 'second'
  await view.rerender(<Probe />)
  expect(setPersonProps).toHaveBeenCalledWith(
    expect.objectContaining({ referral_source: 'friend' }),
  )
  expect(setPersonProps).toHaveBeenCalledWith({ meal_reminders: 1 })
  expect(setSuperProps).toHaveBeenCalledWith({ entitled: true })
})

it('does not resend unchanged properties for the same account', async () => {
  const view = await render(<Probe />)
  jest.clearAllMocks()
  mockAccount.profile = { ...mockAccount.profile }
  mockAccount.reminders = [...mockAccount.reminders]
  await view.rerender(<Probe />)
  expect(setPersonProps).not.toHaveBeenCalled()
  expect(setSuperProps).not.toHaveBeenCalled()
})

it('does not label an unknown new account as free', async () => {
  const view = await render(<Probe />)
  jest.clearAllMocks()
  mockAccount.userId = 'second'
  mockAccount.entitlement = { entitled: false, loading: false, unknown: true }
  await view.rerender(<Probe />)
  expect(setSuperProps).not.toHaveBeenCalled()
})
