import { assertEquals } from 'jsr:@std/assert@^1'

import {
  subscriberFrom,
  type V1Entitlement,
  type V1Response,
  type V1Subscription,
} from './revenuecat-api.ts'

/**
 * Reading RevenueCat's own answer about one customer.
 *
 * This is the half of the paid path that has no webhook in front of it, which
 * is exactly why it is worth testing: it is what decides whether an account
 * whose delivery was lost gets the app back, and every way of getting it wrong
 * is either "a paying customer stays refused" or "the app is free".
 */

const NOW = Date.parse('2026-08-20T00:00:00Z')
const later = '2026-09-01T00:00:00Z'
const earlier = '2026-08-01T00:00:00Z'

const payload = (
  entitlement: V1Entitlement | null,
  subscriptions: Record<string, V1Subscription> = {},
): V1Response => ({
  subscriber: {
    entitlements: entitlement ? { pro: entitlement } : {},
    subscriptions,
  },
})

Deno.test('a live entitlement is read with its product and store', () => {
  const read = subscriberFrom(
    payload(
      { expires_date: later, product_identifier: 'com.nelsongan.ricecal.pro.monthly' },
      {
        'com.nelsongan.ricecal.pro.monthly': {
          is_sandbox: false,
          period_type: 'normal',
          store: 'app_store',
        },
      },
    ),
    NOW,
  )

  assertEquals(read.active, true)
  assertEquals(read.expiresAt, later)
  assertEquals(read.productId, 'com.nelsongan.ricecal.pro.monthly')
  assertEquals(read.store, 'app_store')
  assertEquals(read.sandbox, false)
  assertEquals(read.trial, false)
})

Deno.test('no pro entitlement is not entitled', () => {
  assertEquals(subscriberFrom(payload(null), NOW).active, false)
  // Somebody else's entitlement unlocks nothing, however live it is.
  assertEquals(
    subscriberFrom({ subscriber: { entitlements: { other: { expires_date: later } } } }, NOW)
      .active,
    false,
  )
})

Deno.test('an expiry in the past is over', () => {
  assertEquals(subscriberFrom(payload({ expires_date: earlier }), NOW).active, false)
})

Deno.test('a billing grace period is still access', () => {
  // Apple is retrying the card. The store still considers the subscription
  // live, and refusing here would take the app away mid-charge.
  const read = subscriberFrom(
    payload({ expires_date: earlier, grace_period_expires_date: later }),
    NOW,
  )
  assertEquals(read.active, true)
})

Deno.test('no expiry at all is lifetime, not lapsed', () => {
  // A non-renewing purchase has nothing to expire, so the ABSENCE of a date is
  // the strongest claim to access rather than the weakest. Read the other way
  // round this refuses the one plan that cannot lapse — the same trap
  // `current_period_end` sets in the mirror.
  const read = subscriberFrom(
    payload({ expires_date: null, product_identifier: 'ricecal_pro_lifetime' }),
    NOW,
  )
  assertEquals(read.active, true)
  assertEquals(read.expiresAt, null)
})

Deno.test('a sandbox purchase says so', () => {
  // The caller applies the policy; this only has to report it honestly. Read as
  // false, a free sandbox purchase would grant the paid app to anybody with a
  // sandbox Apple ID.
  const read = subscriberFrom(
    payload({ expires_date: later, product_identifier: 'p' }, { p: { is_sandbox: true } }),
    NOW,
  )
  assertEquals(read.sandbox, true)
})

Deno.test('a trial period is named', () => {
  const read = subscriberFrom(
    payload({ expires_date: later, product_identifier: 'p' }, { p: { period_type: 'TRIAL' } }),
    NOW,
  )
  assertEquals(read.trial, true)
})

Deno.test('a payload with nothing in it does not throw', () => {
  // RevenueCat answering something unexpected must read as "not entitled"
  // rather than as an exception on a request path.
  assertEquals(subscriberFrom({}, NOW).active, false)
  assertEquals(subscriberFrom({ subscriber: {} }, NOW).active, false)
})
