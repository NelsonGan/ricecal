import '@/i18n'
import { act, render, screen } from '@/test-utils'
import { TrialReminderOffer } from '../TrialReminderOffer'
import { markTrialReminderOffered, trialReminderOffered } from '../trialReminderOffered'

const DAY = 24 * 60 * 60 * 1000
let mockUserId = 'u1'
let mockStore: Record<string, unknown> | null = null
let mockPermission = { granted: false, canAskAgain: true }
let mockTourDone = true

jest.mock('expo-router', () => ({ useIsFocused: () => true }))
jest.mock('@/data', () => ({
  useSession: () => ({ userId: mockUserId }),
  useProfile: () => ({ data: {} }),
  useStoreEntitlement: () => ({ data: mockStore }),
}))
jest.mock('@/features/news/useAnnouncementOffer', () => ({
  announcementHasTheFloor: () => false,
  tourOfferedBeforeThisRun: () => mockTourDone,
}))
jest.mock('@/lib/rating', () => ({ ratingAskBooked: () => false }))
jest.mock('@/lib/notificationPermission', () => ({
  notificationPermissionState: async () => mockPermission,
  ensureNotificationPermission: jest.fn(async () => true),
}))

const trial = (overrides: Record<string, unknown> = {}) => ({
  active: true,
  trial: true,
  willRenew: true,
  expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
  trialStartedAt: new Date(Date.now() - 2 * DAY).toISOString(),
  productId: 'com.nelsongan.ricecal.pro.yearly',
  sandbox: false,
  ...overrides,
})

let n = 0
beforeEach(() => {
  jest.useFakeTimers()
  n += 1
  mockUserId = `u${n}`
  mockStore = trial()
  mockPermission = { granted: false, canAskAgain: true }
  mockTourDone = true
})
afterEach(() => jest.useRealTimers())

async function settle() {
  await render(<TrialReminderOffer />)
  await act(async () => {
    jest.advanceTimersByTime(2600)
  })
}

it('asks somebody on a renewing trial with notifications off, once per trial', async () => {
  await settle()
  expect(screen.getByText('Want a reminder before you pay?')).toBeTruthy()
  expect(screen.getByText('Turn on notifications')).toBeTruthy()
  expect(screen.getByText(/we remind you 3 days before\.$/)).toBeTruthy()
  expect(trialReminderOffered(mockUserId, new Date(mockStore?.expiresAt as string))).toBe(true)
})

it('sends somebody who already refused the system prompt to Settings', async () => {
  mockPermission = { granted: false, canAskAgain: false }
  await settle()
  expect(screen.getByText('Open Settings')).toBeTruthy()
})

it('stays away when notifications are on, the trial will not renew, or it was asked already', async () => {
  mockPermission = { granted: true, canAskAgain: true }
  await settle()
  expect(screen.queryByText('Want a reminder before you pay?')).toBeNull()

  mockPermission = { granted: false, canAskAgain: true }
  mockStore = trial({ willRenew: false })
  await settle()
  expect(screen.queryByText('Want a reminder before you pay?')).toBeNull()

  mockStore = trial()
  markTrialReminderOffered(mockUserId, new Date(mockStore.expiresAt as string))
  await settle()
  expect(screen.queryByText('Want a reminder before you pay?')).toBeNull()
})

it('stays away once the reminder could no longer be sent', async () => {
  // Ends tomorrow: three days before is already past.
  mockStore = trial({ expiresAt: new Date(Date.now() + DAY).toISOString() })
  await settle()
  expect(screen.queryByText('Want a reminder before you pay?')).toBeNull()
})

it('waits for the next launch when the tour is offered on this one', async () => {
  mockTourDone = false
  await settle()
  expect(screen.queryByText('Want a reminder before you pay?')).toBeNull()
})
