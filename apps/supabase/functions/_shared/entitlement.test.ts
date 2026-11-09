import { assertEquals, assertRejects } from 'jsr:@std/assert@^1'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  entitledBy,
  forgetFailedChecks,
  LIFETIME_RECHECK_MS,
  lifetimeDueForCheck,
  reconcileEntitlement,
  stillEntitled,
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
  const lifetime = { plan: 'lifetime', current_period_end: null, rc_app_user_id: 'rc' }
  assertEquals(lifetimeDueForCheck({ ...lifetime, updated_at: fresh }, NOW), false)
  assertEquals(lifetimeDueForCheck({ ...lifetime, updated_at: stale }, NOW), true)
  // No timestamp is due rather than exempt.
  assertEquals(lifetimeDueForCheck(lifetime, NOW), true)
  // A lifetime product `planOf` cannot name is still lifetime: no end date
  // from RevenueCat means a one-off purchase.
  assertEquals(lifetimeDueForCheck({ ...lifetime, plan: null, updated_at: stale }, NOW), true)
  // A row with an end date is bounded by it already.
  assertEquals(
    lifetimeDueForCheck({ ...lifetime, current_period_end: LATER, updated_at: stale }, NOW),
    false,
  )
  // A Pro row granted by hand has no RevenueCat id and no purchase behind it.
  // Asking RevenueCat would take it away, so it is never asked about.
  assertEquals(
    lifetimeDueForCheck({ plan: 'yearly', current_period_end: null, updated_at: stale }, NOW),
    false,
  )
  assertEquals(lifetimeDueForCheck(null, NOW), false)
})

// --- syncFromStore, against a fake table and a stubbed RevenueCat ---------------

type Row = Record<string, unknown>
type Write = { kind: 'update' | 'upsert' | 'insert'; values: Row }

/**
 * Just enough of the supabase-js builder for `syncFromStore`, over one row.
 * `clashes` writes are refused as if another writer had changed the row first.
 */
function fakeDb(initial: Row | null, clashes = 0) {
  let row: Row | null = initial ? { updated_at: '2026-08-01T00:00:00.000Z', ...initial } : null
  let refusals = clashes
  const writes: Write[] = []
  const conditional = (values: Row) => {
    let expected: unknown = Symbol('unset')
    const query = {
      eq: (column: string, value: unknown) => {
        if (column === 'updated_at') expected = value
        return query
      },
      select: async () => {
        if (!row || refusals > 0 || (expected !== row.updated_at && typeof expected !== 'symbol')) {
          refusals = Math.max(0, refusals - 1)
          return { data: [], error: null }
        }
        writes.push({ kind: 'update', values })
        row = { ...row, ...values }
        return { data: [{ user_id: 'x' }], error: null }
      },
    }
    return query
  }
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (values: Row) => conditional(values),
      insert: async (values: Row) => {
        if (row || refusals > 0) {
          refusals = Math.max(0, refusals - 1)
          return { error: { code: '23505', message: 'duplicate key' } }
        }
        writes.push({ kind: 'insert', values })
        row = values
        return { error: null }
      },
      upsert: async (values: Row) => {
        writes.push({ kind: 'upsert', values })
        row = { ...row, ...values }
        return { error: null }
      },
    }),
  }
  return { db: db as unknown as SupabaseClient, writes }
}

/** How many times the stubbed RevenueCat has been asked. */
let revenueCatCalls = 0

/** Runs `fn` with RevenueCat answering `body`, or failing when it is null. */
async function withRevenueCat<T>(body: unknown | null, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch
  const hadKey = Deno.env.get('REVENUECAT_API_KEY')
  Deno.env.set('REVENUECAT_API_KEY', 'test-key')
  globalThis.fetch = (async () => {
    revenueCatCalls += 1
    return body === null
      ? new Response('unavailable', { status: 503 })
      : new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
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
const ACTIVE_LIFETIME_ROW = {
  status: 'active',
  plan: 'lifetime',
  current_period_end: null,
  store: 'app_store',
  last_event_at: '2026-08-01T00:00:00.000Z',
}

Deno.test('a refunded lifetime purchase is expired, not left on Pro', async () => {
  const { db, writes } = fakeDb(ACTIVE_LIFETIME_ROW)
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

Deno.test('a lifetime purchase RevenueCat still honours stays Pro, and keeps its store', async () => {
  const { db, writes } = fakeDb(ACTIVE_LIFETIME_ROW)
  const verdict = await withRevenueCat(LIFETIME, () => syncFromStore(db, USER))
  assertEquals(verdict, 'entitled')
  assertEquals(writes.length, 1)
  assertEquals(writes[0].values.status, 'active')
  assertEquals(writes[0].values.current_period_end, null)
  assertEquals(writes[0].values.plan, 'lifetime')
  // RevenueCat names no store for a one-off purchase; the recorded one stays.
  assertEquals('store' in writes[0].values, false)
})

Deno.test('RevenueCat being unreachable changes nothing and says so', async () => {
  const { db, writes } = fakeDb(ACTIVE_LIFETIME_ROW)
  const verdict = await withRevenueCat(null, () => syncFromStore(db, USER))
  assertEquals(verdict, null)
  assertEquals(writes.length, 0)
})

Deno.test('a row that is not entitled is left with the period it really paid for', async () => {
  // No row at all, and one already expired at its real period end: neither has
  // anything to take away, and rewriting the end date would move the boundary
  // retention reads.
  for (const row of [null, { status: 'expired', plan: 'yearly', current_period_end: EARLIER }]) {
    const { db, writes } = fakeDb(row)
    const verdict = await withRevenueCat(REFUNDED, () => syncFromStore(db, USER))
    assertEquals(verdict, 'not_entitled')
    assertEquals(writes.length, 0)
  }
})

Deno.test('an older event does not move the ordering backwards', async () => {
  const { db, writes } = fakeDb({
    ...ACTIVE_LIFETIME_ROW,
    last_event_at: '2026-08-17T00:00:00.000Z',
  })
  await withRevenueCat(REFUNDED, () => syncFromStore(db, USER, '2026-08-01T00:00:00.000Z'))
  // The refund is applied, and the newer stamp the row already had is left alone.
  assertEquals(writes[0].values.status, 'expired')
  assertEquals('last_event_at' in writes[0].values, false)
})

Deno.test('a write that loses to another writer asks again, and gives up after that', async () => {
  const once = fakeDb(ACTIVE_LIFETIME_ROW, 1)
  assertEquals(await withRevenueCat(REFUNDED, () => syncFromStore(once.db, USER)), 'not_entitled')
  assertEquals(once.writes.length, 1)

  const always = fakeDb(ACTIVE_LIFETIME_ROW, 5)
  await assertRejects(() => withRevenueCat(REFUNDED, () => syncFromStore(always.db, USER)))
  assertEquals(always.writes.length, 0)
})

Deno.test('a refund on a row at billing retry expires it, and keeps its real end date', async () => {
  const row = { status: 'billing_retry', plan: 'yearly', current_period_end: EARLIER }
  const { db, writes } = fakeDb(row)
  assertEquals(
    await withRevenueCat(REFUNDED, () => syncFromStore(db, USER, '2026-08-17T00:00:00.000Z')),
    'not_entitled',
  )
  assertEquals(writes.length, 1)
  assertEquals(writes[0].values.status, 'expired')
  assertEquals('current_period_end' in writes[0].values, false)
  assertEquals(writes[0].values.last_event_at, '2026-08-17T00:00:00.000Z')
})

Deno.test('a newer event on an expired row still moves the ordering on', async () => {
  // Without it, an older RENEWAL delivered afterwards would not look stale and
  // would make the refunded account Pro again.
  const row = { status: 'expired', current_period_end: EARLIER, last_event_at: EARLIER }
  const { db, writes } = fakeDb(row)
  await withRevenueCat(REFUNDED, () => syncFromStore(db, USER, '2026-08-17T00:00:00.000Z'))
  assertEquals(writes.length, 1)
  assertEquals(writes[0].values.last_event_at, '2026-08-17T00:00:00.000Z')
  assertEquals('status' in writes[0].values, false)
})

Deno.test('the miss path only ever writes "entitled"', async () => {
  const refused = fakeDb({ status: 'expired', current_period_end: EARLIER })
  assertEquals(await withRevenueCat(REFUNDED, () => reconcileEntitlement(refused.db, USER)), false)
  assertEquals(refused.writes.length, 0)

  const missing = fakeDb(null)
  assertEquals(await withRevenueCat(LIFETIME, () => reconcileEntitlement(missing.db, USER)), true)
  assertEquals(
    missing.writes.map((write) => write.kind),
    ['insert'],
  )

  const unreachable = fakeDb(null)
  assertEquals(await withRevenueCat(null, () => reconcileEntitlement(unreachable.db, USER)), false)
  assertEquals(unreachable.writes.length, 0)
})

const DUE_LIFETIME_ROW = {
  ...ACTIVE_LIFETIME_ROW,
  rc_app_user_id: USER,
  updated_at: '2026-01-01T00:00:00.000Z',
}

Deno.test('stillEntitled takes Pro away only on a definite "no"', async () => {
  forgetFailedChecks()
  const refunded = fakeDb(DUE_LIFETIME_ROW)
  assertEquals(
    await withRevenueCat(REFUNDED, () => stillEntitled(refunded.db, USER, DUE_LIFETIME_ROW)),
    false,
  )
  const honoured = fakeDb(DUE_LIFETIME_ROW)
  assertEquals(
    await withRevenueCat(LIFETIME, () => stillEntitled(honoured.db, USER, DUE_LIFETIME_ROW)),
    true,
  )
  // Not due: not even asked.
  revenueCatCalls = 0
  const fresh = { ...DUE_LIFETIME_ROW, updated_at: new Date().toISOString() }
  assertEquals(
    await withRevenueCat(REFUNDED, () => stillEntitled(fakeDb(fresh).db, USER, fresh)),
    true,
  )
  assertEquals(revenueCatCalls, 0)
})

Deno.test('an unreachable RevenueCat is asked about an account once an hour, not every request', async () => {
  forgetFailedChecks()
  const { db } = fakeDb(DUE_LIFETIME_ROW)
  revenueCatCalls = 0
  assertEquals(await withRevenueCat(null, () => stillEntitled(db, USER, DUE_LIFETIME_ROW)), true)
  assertEquals(revenueCatCalls, 1)
  // Within the hour: the row stands, and RevenueCat is not asked again.
  assertEquals(
    await withRevenueCat(REFUNDED, () => stillEntitled(db, USER, DUE_LIFETIME_ROW)),
    true,
  )
  assertEquals(revenueCatCalls, 1)
  // Forgotten (an hour later, or a fresh instance): asked, and the refund lands.
  forgetFailedChecks()
  assertEquals(
    await withRevenueCat(REFUNDED, () => stillEntitled(db, USER, DUE_LIFETIME_ROW)),
    false,
  )
  assertEquals(revenueCatCalls, 2)
})

Deno.test('a refund that arrives before its purchase is remembered, so the purchase is stale', async () => {
  const { db, writes } = fakeDb(null)
  await withRevenueCat(REFUNDED, () => syncFromStore(db, USER, '2026-08-17T00:00:00.000Z'))
  assertEquals(writes.length, 1)
  assertEquals(writes[0].kind, 'insert')
  assertEquals(writes[0].values.status, 'expired')
  assertEquals(writes[0].values.last_event_at, '2026-08-17T00:00:00.000Z')
})
