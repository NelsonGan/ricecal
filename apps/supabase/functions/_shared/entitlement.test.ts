import { assertEquals } from 'jsr:@std/assert@^1'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  entitledBy,
  LIFETIME_RECHECK_MS,
  lifetimeDueForCheck,
  syncFromStore,
} from './entitlement.ts'

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

Deno.test('a lifetime row is re-checked once a week, and nothing else is', () => {
  const fresh = new Date(NOW.getTime() - LIFETIME_RECHECK_MS + 60_000).toISOString()
  const stale = new Date(NOW.getTime() - LIFETIME_RECHECK_MS - 60_000).toISOString()
  assertEquals(lifetimeDueForCheck({ current_period_end: null, updated_at: fresh }, NOW), false)
  assertEquals(lifetimeDueForCheck({ current_period_end: null, updated_at: stale }, NOW), true)
  // No timestamp is due rather than exempt.
  assertEquals(lifetimeDueForCheck({ current_period_end: null }, NOW), true)
  // A row with an end date is bounded by it already.
  assertEquals(lifetimeDueForCheck({ current_period_end: LATER, updated_at: stale }, NOW), false)
  assertEquals(lifetimeDueForCheck(null, NOW), false)
})

// --- syncFromStore, against a fake table and a stubbed RevenueCat ---------------

type Row = Record<string, unknown>
type Write = { kind: 'update' | 'upsert'; values: Row }

/** Just enough of the supabase-js builder for `syncFromStore`. */
function fakeDb(row: Row | null) {
  const writes: Write[] = []
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (values: Row) => ({
        eq: async () => {
          writes.push({ kind: 'update', values })
          return { error: null }
        },
      }),
      upsert: async (values: Row) => {
        writes.push({ kind: 'upsert', values })
        return { error: null }
      },
    }),
  }
  return { db: db as unknown as SupabaseClient, writes }
}

/** Runs `fn` with RevenueCat answering `body`, or failing when it is null. */
async function withRevenueCat<T>(body: unknown | null, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch
  const hadKey = Deno.env.get('REVENUECAT_API_KEY')
  Deno.env.set('REVENUECAT_API_KEY', 'test-key')
  globalThis.fetch = (async () =>
    body === null
      ? new Response('unavailable', { status: 503 })
      : new Response(JSON.stringify(body), { status: 200 })) as typeof fetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = realFetch
    if (hadKey === undefined) Deno.env.delete('REVENUECAT_API_KEY')
    else Deno.env.set('REVENUECAT_API_KEY', hadKey)
  }
}

const USER = '33333333-3333-4333-8333-333333333333'
const LIFETIME = {
  subscriber: {
    entitlements: { pro: { expires_date: null, product_identifier: 'ricecal_pro_lifetime' } },
    non_subscriptions: { ricecal_pro_lifetime: [{}] },
  },
}
const REFUNDED = { subscriber: { entitlements: {}, non_subscriptions: {} } }

Deno.test('a refunded lifetime purchase is expired, not left on Pro', async () => {
  const { db, writes } = fakeDb({ last_event_at: '2026-08-01T00:00:00.000Z' })
  const verdict = await withRevenueCat(REFUNDED, () =>
    syncFromStore(db, USER, '2026-08-17T00:00:00.000Z'),
  )
  assertEquals(verdict, 'not_entitled')
  assertEquals(writes.length, 1)
  assertEquals(writes[0].kind, 'update')
  assertEquals(writes[0].values.status, 'expired')
  assertEquals(writes[0].values.last_event_at, '2026-08-17T00:00:00.000Z')
  assertEquals(
    entitledBy(writes[0].values as { status: string; current_period_end: string }),
    false,
  )
})

Deno.test('a lifetime purchase RevenueCat still honours stays Pro', async () => {
  const { db, writes } = fakeDb({ last_event_at: null })
  const verdict = await withRevenueCat(LIFETIME, () => syncFromStore(db, USER))
  assertEquals(verdict, 'entitled')
  assertEquals(writes.length, 1)
  assertEquals(writes[0].kind, 'upsert')
  assertEquals(writes[0].values.status, 'active')
  assertEquals(writes[0].values.current_period_end, null)
  assertEquals(writes[0].values.plan, 'lifetime')
})

Deno.test('RevenueCat being unreachable changes nothing and says so', async () => {
  const { db, writes } = fakeDb({ last_event_at: null })
  const verdict = await withRevenueCat(null, () => syncFromStore(db, USER))
  assertEquals(verdict, null)
  assertEquals(writes.length, 0)
})

Deno.test('an account with no row is not given one to say it is not entitled', async () => {
  const { db, writes } = fakeDb(null)
  const verdict = await withRevenueCat(REFUNDED, () => syncFromStore(db, USER))
  assertEquals(verdict, 'not_entitled')
  assertEquals(writes.length, 0)
})

Deno.test('an older event does not move the ordering backwards', async () => {
  const { db, writes } = fakeDb({ last_event_at: '2026-08-17T00:00:00.000Z' })
  await withRevenueCat(REFUNDED, () => syncFromStore(db, USER, '2026-08-01T00:00:00.000Z'))
  assertEquals(writes[0].values.last_event_at, '2026-08-17T00:00:00.000Z')
})
