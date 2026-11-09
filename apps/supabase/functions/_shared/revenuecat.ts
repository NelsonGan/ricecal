// The pure half of the RevenueCat webhook: what an event MEANS.
//
// Split out of `revenuecat/index.ts` so it can be tested. Everything here is a
// total function over a payload — no network, no database, no Deno globals —
// which is exactly the part worth having tests for, because the mapping from
// RevenueCat's fifteen event types onto our four statuses is where a mistake
// costs somebody the app they have paid for.

export type RevenueCatEvent = {
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  product_id?: string
  period_type?: string
  store?: string
  environment?: string
  entitlement_ids?: string[] | null
  expiration_at_ms?: number | null
  purchased_at_ms?: number | null
  /** When the event happened, which orders deliveries. See `isStale`. */
  event_timestamp_ms?: number | null
  /** On a CANCELLATION: `CUSTOMER_SUPPORT` is a refund. Logged, not trusted. */
  cancel_reason?: string | null
  /** On a TRANSFER: the accounts the purchase left, and the ones it went to. */
  transferred_from?: string[] | null
  transferred_to?: string[] | null
}

/** The entitlement this app sells. An event about anything else is not ours. */
export const ENTITLEMENT = 'pro'

/**
 * Who a sandbox purchase may grant Pro to. A sandbox purchase costs nothing and
 * carries a genuine Supabase user id, so this is the one setting that can hand
 * the paid app out for free. `REVENUECAT_SANDBOX_SUBSCRIBERS` decides:
 *
 *   unset / empty   nobody. Every sandbox event is dropped.
 *   `*`             everybody. See the warning below.
 *   a list of uuids just those accounts.
 *
 * `*` is the current setting, deliberately. Every purchase outside the App
 * Store's own checkout is a sandbox transaction, so an allow-list means the paid
 * app can only be exercised by ids somebody remembered to add. What it costs is
 * that TestFlight testers get Pro without paying: a known trade, to be narrowed
 * when the tester group stops being people you know.
 *
 * Here rather than in the webhook, because two places apply it: the webhook when
 * an event arrives, and `reconcileEntitlement` when it asks RevenueCat directly.
 *
 * Read per call, so changing the secret takes effect on the next invocation.
 */
export function sandboxPolicy(): '*' | Set<string> {
  const raw = (Deno.env.get('REVENUECAT_SANDBOX_SUBSCRIBERS') ?? '').trim()
  if (raw === '*') return '*'
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** May a sandbox purchase grant this account? */
export function sandboxAllowed(appUserId: string): boolean {
  const policy = sandboxPolicy()
  return policy === '*' || policy.has(appUserId.toLowerCase())
}

export const at = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null

/**
 * Did Postgres refuse the subscription because its Supabase account is gone?
 *
 * The SQLSTATE alone means any foreign-key violation. Keep the named constraint
 * beside it so adding another relation to `subscriptions` cannot turn a real
 * integrity failure into a webhook we acknowledge and silently discard.
 */
export function accountNoLongerExists(error: { code?: string; message?: string }): boolean {
  return error.code === '23503' && (error.message ?? '').includes('"subscriptions_user_id_fkey"')
}

/**
 * Which of our three plans a store product is.
 *
 * Matched on the SUFFIX rather than on the full identifier, because the two
 * stores spell the same plan differently and always will:
 * `com.nelsongan.ricecal.pro.yearly` on Apple, `ricecal_pro_yearly:yearly` on
 * Play, where the tail after the colon is the base plan. A table of every
 * spelling would need editing every time a store product is added; the word is
 * the part that carries the meaning.
 *
 * Null when nothing matches, which is written as null rather than guessed. The
 * plan is display only — entitlement comes from the status — so an unknown
 * product still grants access and merely fails to name itself.
 */
export function planOf(productId: string | undefined): 'monthly' | 'yearly' | 'lifetime' | null {
  const id = (productId ?? '').toLowerCase()
  if (id.includes('lifetime')) return 'lifetime'
  if (id.includes('year') || id.includes('annual')) return 'yearly'
  if (id.includes('month')) return 'monthly'
  return null
}

/**
 * What an event does to the stored status, or null to leave it alone.
 *
 * CANCELLATION IS NOT AN ENDING. In RevenueCat it means auto-renew was turned
 * off, and the user keeps what they paid for until the period runs out — an
 * EXPIRATION event follows when it actually does. Treating it as the end would
 * take the app away from somebody who has paid for another three weeks of it,
 * which is the single most expensive way to be wrong here.
 */
export function statusFor(
  event: RevenueCatEvent,
): 'trial' | 'active' | 'expired' | 'billing_retry' | null {
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'NON_RENEWING_PURCHASE':
      return event.period_type === 'TRIAL' ? 'trial' : 'active'

    case 'EXPIRATION':
    // A paused subscription is not a current one: Play stops billing and the
    // user stops having the app until it resumes, which arrives as its own
    // RENEWAL.
    case 'SUBSCRIPTION_PAUSED':
      return 'expired'

    case 'BILLING_ISSUE':
      return 'billing_retry'

    // TEST is the dashboard's "send test event" button and SUBSCRIBER_ALIAS is
    // two ids being merged. Neither says anything new about entitlement, and
    // answering 200 keeps RevenueCat from retrying something we ignored.
    //
    // CANCELLATION and TRANSFER have no status of their own either: one can
    // mean "still paid up" or "refunded", the other names its accounts outside
    // `app_user_id`. The webhook settles both by asking RevenueCat about each
    // account (`needsStoreCheck`) before it ever calls this.
    default:
      return null
  }
}

/**
 * Events whose meaning only RevenueCat's current answer can settle, so the
 * webhook asks RevenueCat about the account instead of reading the event.
 *
 * CANCELLATION is both "auto-renew turned off, access until the period ends"
 * and "refunded". RevenueCat's docs promise no EXPIRATION after a refunded
 * one-off purchase, and a lifetime row has no end date to run out, so ignoring
 * the event left every refunded lifetime purchase on Pro for good. Asking
 * covers both readings: an unsubscribed renewal is still live there until its
 * period ends, and a refund is not.
 *
 * TRANSFER moves a purchase between accounts and says so only in
 * `transferred_from` and `transferred_to`. Ignoring it left every account the
 * purchase left on Pro, so one lifetime purchase restored onto account after
 * account made each of them Pro for good.
 */
export function needsStoreCheck(event: RevenueCatEvent): boolean {
  return event.type === 'CANCELLATION' || event.type === 'TRANSFER'
}

/** Both ends of a TRANSFER, deduplicated, as RevenueCat named them. */
export function transferParties(event: RevenueCatEvent): string[] {
  const ids = [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))]
}

/**
 * Has this event been overtaken by one we have already applied? RevenueCat
 * retries with a backoff, so an EXPIRATION held up by a failed delivery can land
 * after the RENEWAL that superseded it.
 *
 * Ordered by when the event happened, which is the second attempt at this. The
 * first compared the event's expiry against the stored `current_period_end`,
 * which is the same test only while every ending is the natural one: a refund, a
 * support cancellation and a revoked grant all end a subscription inside the
 * period it had paid for, so every one looked stale and was dropped.
 *
 * Both unknowns apply the event rather than dropping it, because discarding a
 * real event to protect against a hypothetical ordering is the worse trade.
 * Equal timestamps apply too, so a redelivery rewrites the same values.
 */
export function isStale(event: RevenueCatEvent, lastEventAt: string | null | undefined): boolean {
  if (!lastEventAt) return false
  const happened = event.event_timestamp_ms
  if (typeof happened !== 'number' || !Number.isFinite(happened)) return false
  return happened < new Date(lastEventAt).getTime()
}
