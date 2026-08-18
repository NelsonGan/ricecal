import { assertEquals } from 'jsr:@std/assert@^1'

import { entitledBy } from './entitlement.ts'

/**
 * The rule that decides whether a request reaches the model.
 *
 * Worth testing rather than reading, because the two halves fail in opposite
 * directions and both are expensive: a status read too loosely hands the model
 * to somebody who has not paid, and a date read too strictly refuses the one
 * plan that never expires. `isEntitledRow` in the client's
 * `data/subscription.ts` is the same rule and is tested against the same cases;
 * they cannot import each other across the Deno / React Native line, so this
 * pair of files is what keeps them honest.
 */

const NOW = new Date('2026-08-18T00:00:00Z')
const LATER = '2026-09-18T00:00:00Z'
const EARLIER = '2026-07-18T00:00:00Z'

Deno.test('a running period on an entitled status is entitled', () => {
  assertEquals(entitledBy({ status: 'active', current_period_end: LATER }, NOW), true)
  assertEquals(entitledBy({ status: 'trial', current_period_end: LATER }, NOW), true)
})

Deno.test('an expiry in the past refuses, whatever the status claims', () => {
  // The whole point. A row goes on SAYING `active` after an EXPIRATION that was
  // never delivered, or was delivered and wrongly discarded — which is what
  // happened to two revoked promotional grants. Read on the status alone, that
  // account reaches the model for ever; read with the date, only until the
  // period it actually paid for runs out.
  assertEquals(entitledBy({ status: 'active', current_period_end: EARLIER }, NOW), false)
  assertEquals(entitledBy({ status: 'trial', current_period_end: EARLIER }, NOW), false)
})

Deno.test('no expiry is lifetime, not an expired one', () => {
  // Lifetime is bought once and renews never, so RevenueCat sends no expiry and
  // the column is null by design. Read the other way round, this rule would
  // refuse the only plan that cannot lapse — and refuse it permanently.
  assertEquals(entitledBy({ status: 'active', current_period_end: null }, NOW), true)
  assertEquals(entitledBy({ status: 'active' }, NOW), true)
})

Deno.test('the statuses that are not entitlement stay out', () => {
  assertEquals(entitledBy({ status: 'expired', current_period_end: LATER }, NOW), false)
  // Billing retry is a stumble the app names rather than a subscription, and it
  // must not unlock anything even while the store is still trying the card.
  assertEquals(entitledBy({ status: 'billing_retry', current_period_end: LATER }, NOW), false)
  assertEquals(entitledBy({ status: 'none' }, NOW), false)
})

Deno.test('a missing row is "no", not an error', () => {
  // Most accounts have never subscribed, and `maybeSingle` says so with a null
  // rather than a 406.
  assertEquals(entitledBy(null, NOW), false)
  assertEquals(entitledBy(undefined, NOW), false)
  assertEquals(entitledBy({}, NOW), false)
})

Deno.test('the boundary refuses rather than granting one last request', () => {
  // Exactly at the expiry the period is over. Granting on equality would hand
  // out a model call on a subscription that has ended, and there is no reading
  // of "expires at 09:00" under which 09:00 is still inside it.
  assertEquals(entitledBy({ status: 'active', current_period_end: NOW.toISOString() }, NOW), false)
})
