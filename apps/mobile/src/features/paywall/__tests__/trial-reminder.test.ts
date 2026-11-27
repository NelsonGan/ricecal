import type { StoreEntitlement } from '@/lib/revenuecat'
import { trialToRemind } from '../trial'

const store = (overrides: Partial<StoreEntitlement>): StoreEntitlement => ({
  active: true,
  trial: true,
  expiresAt: '2026-12-04T07:00:00Z',
  trialStartedAt: '2026-11-27T07:00:00Z',
  productId: 'com.nelsongan.ricecal.pro.yearly',
  willRenew: true,
  sandbox: false,
  ...overrides,
})

it('reminds about a trial the store will charge for', () => {
  expect(trialToRemind(store({}), undefined)).toEqual({
    start: new Date('2026-11-27T07:00:00Z'),
    end: new Date('2026-12-04T07:00:00Z'),
  })
})

it('stops once the trial is cancelled, paid for, or gone', () => {
  expect(trialToRemind(store({ willRenew: false }), undefined)).toBeNull()
  expect(trialToRemind(store({ trial: false }), undefined)).toBeNull()
  expect(trialToRemind(store({ active: false }), undefined)).toBeNull()
})

it('falls back on the mirror when there is no store to ask', () => {
  expect(trialToRemind(null, { status: 'trial', trial_ends_at: '2026-12-04T07:00:00Z' })).toEqual({
    start: null,
    end: new Date('2026-12-04T07:00:00Z'),
  })
  expect(
    trialToRemind(null, { status: 'cancelled', trial_ends_at: '2026-12-04T07:00:00Z' }),
  ).toBeNull()
  expect(trialToRemind(null, null)).toBeNull()
})

it('decides nothing until both sources have answered', () => {
  expect(trialToRemind(undefined, null)).toBeUndefined()
  expect(trialToRemind(null, undefined)).toBeUndefined()
})
