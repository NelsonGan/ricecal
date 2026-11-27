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
  expect(trialToRemind(store({}))).toEqual({
    start: new Date('2026-11-27T07:00:00Z'),
    end: new Date('2026-12-04T07:00:00Z'),
  })
})

it('stops once the trial is cancelled, paid for, or gone', () => {
  expect(trialToRemind(store({ willRenew: false }))).toBeNull()
  expect(trialToRemind(store({ trial: false }))).toBeNull()
  expect(trialToRemind(store({ active: false }))).toBeNull()
})

it('decides nothing without an answer from the store', () => {
  // Our mirror keeps a cancelled trial at `trial` until it runs out, so it is
  // never used to book a "you will be charged".
  expect(trialToRemind(undefined)).toBeUndefined()
  expect(trialToRemind(null)).toBeUndefined()
})
