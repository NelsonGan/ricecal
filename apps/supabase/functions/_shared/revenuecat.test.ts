import { assertEquals } from 'jsr:@std/assert@^1'

import { at, planOf, type RevenueCatEvent, statusFor } from './revenuecat.ts'

const event = (partial: Partial<RevenueCatEvent>): RevenueCatEvent => partial

Deno.test('planOf reads the plan out of either store’s spelling', () => {
  // Apple sends a reverse-DNS product id; Play sends `productId:basePlanId`.
  // Both have to land on the same three words.
  assertEquals(planOf('com.nelsongan.ricecal.pro.monthly'), 'monthly')
  assertEquals(planOf('com.nelsongan.ricecal.pro.yearly'), 'yearly')
  assertEquals(planOf('com.nelsongan.ricecal.pro.lifetime'), 'lifetime')
  assertEquals(planOf('ricecal_pro_monthly:monthly'), 'monthly')
  assertEquals(planOf('ricecal_pro_yearly:yearly'), 'yearly')
  assertEquals(planOf('ricecal_pro_lifetime'), 'lifetime')
})

Deno.test('planOf answers null rather than guessing', () => {
  // An unknown product still grants access — the status decides that — so
  // failing to name it must not fail to record it.
  assertEquals(planOf('com.nelsongan.ricecal.something.else'), null)
  assertEquals(planOf(undefined), null)
  assertEquals(planOf(''), null)
})

Deno.test('planOf puts lifetime ahead of the period words', () => {
  // A one-off product whose id happens to carry a period word must not read as
  // a subscription: "lifetime" is checked first for exactly this.
  assertEquals(planOf('ricecal_pro_lifetime_1year_bonus'), 'lifetime')
})

Deno.test('a purchase in its trial period is a trial, not an active plan', () => {
  assertEquals(statusFor(event({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL' })), 'trial')
  assertEquals(statusFor(event({ type: 'INITIAL_PURCHASE', period_type: 'NORMAL' })), 'active')
  // A renewal is where a trial becomes a paying subscription.
  assertEquals(statusFor(event({ type: 'RENEWAL', period_type: 'NORMAL' })), 'active')
})

Deno.test('CANCELLATION does not end anything', () => {
  // The expensive one to get wrong. In RevenueCat this means auto-renew was
  // turned off, and the user keeps what they paid for until EXPIRATION
  // arrives. Reading it as an ending takes the app away from somebody who has
  // paid for another three weeks of it.
  assertEquals(statusFor(event({ type: 'CANCELLATION' })), null)
})

Deno.test('the endings and the stumbles are told apart', () => {
  assertEquals(statusFor(event({ type: 'EXPIRATION' })), 'expired')
  assertEquals(statusFor(event({ type: 'SUBSCRIPTION_PAUSED' })), 'expired')
  // Billing retry is still entitled as far as the stores are concerned, but it
  // is its own status so the app can say what is wrong.
  assertEquals(statusFor(event({ type: 'BILLING_ISSUE' })), 'billing_retry')
})

Deno.test('a one-off purchase is active with no period', () => {
  assertEquals(statusFor(event({ type: 'NON_RENEWING_PURCHASE' })), 'active')
})

Deno.test('TRANSFER is ignored rather than credited to a guess', () => {
  // It names the two ends in `transferred_from` / `transferred_to`, not in
  // `app_user_id`, so acting on it would grant the app to whichever end the
  // caller's fallback landed on — half the time the account that just gave the
  // subscription up.
  assertEquals(statusFor(event({ type: 'TRANSFER', period_type: 'NORMAL' })), null)
})

Deno.test('events that say nothing about entitlement change nothing', () => {
  assertEquals(statusFor(event({ type: 'TEST' })), null)
  assertEquals(statusFor(event({ type: 'SUBSCRIBER_ALIAS' })), null)
  // An event type RevenueCat adds later must not be read as a downgrade.
  assertEquals(statusFor(event({ type: 'SOMETHING_NEW_IN_2027' })), null)
  assertEquals(statusFor(event({})), null)
})

Deno.test('at() survives a missing expiry', () => {
  // Lifetime purchases carry none, and a NaN would land in a timestamptz
  // column as an error rather than as "no expiry".
  assertEquals(at(null), null)
  assertEquals(at(undefined), null)
  assertEquals(at(Number.NaN), null)
  assertEquals(at(0), '1970-01-01T00:00:00.000Z')
})
