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
}

/** The entitlement this app sells. An event about anything else is not ours. */
export const ENTITLEMENT = 'pro'

export const at = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null

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

    // TEST is the dashboard's "send test event" button, SUBSCRIBER_ALIAS is
    // two ids being merged, CANCELLATION is covered above. None of them says
    // anything new about entitlement, and answering 200 keeps RevenueCat from
    // retrying something we deliberately ignored.
    //
    // TRANSFER is here DELIBERATELY, and it is the one that took thinking
    // about. It moves a purchase between app_user_ids, and it describes that
    // move in `transferred_from` / `transferred_to` rather than in
    // `app_user_id` — which the caller has already fallen back to
    // `original_app_user_id` to fill in. Granting on it would therefore credit
    // whichever of the two ends that fallback happened to land on, and half
    // the time that is the account the subscription just left. Ignoring it
    // costs the receiving account nothing lasting: the next renewal or restore
    // says who owns it, in a payload that is unambiguous about it.
    default:
      return null
  }
}

/**
 * Has this event been overtaken by one we have already applied?
 *
 * RevenueCat retries with a backoff, so deliveries do not arrive in the order
 * things happened: an EXPIRATION held up by a failed delivery can land after
 * the RENEWAL that superseded it, and applied blind it takes the app away from
 * somebody who has just paid for another month.
 *
 * ORDERED BY WHEN THE EVENT HAPPENED, and this is the second attempt at it. The
 * first compared the event's expiry against the stored `current_period_end` and
 * dropped anything that ended sooner — which is the same test as "is this
 * stale" only while every ending is the natural one. It is not: a refund, a
 * support cancellation and a revoked promotional grant all end a subscription
 * inside the period it had already paid for. Every one of them looked stale,
 * every one was dropped, and the account stayed entitled with nothing further
 * coming to correct it.
 *
 * BOTH UNKNOWNS APPLY THE EVENT rather than dropping it. A row with no
 * `last_event_at` predates the column or was corrected by hand; a payload with
 * no `event_timestamp_ms` is one we cannot place. Refusing either
 * would mean discarding a real event to protect against a hypothetical
 * ordering, and the event in hand is the better evidence.
 *
 * Equal timestamps apply too, so a redelivery of the event we already have
 * rewrites the same row with the same values rather than being turned away.
 */
export function isStale(event: RevenueCatEvent, lastEventAt: string | null | undefined): boolean {
  if (!lastEventAt) return false
  const happened = event.event_timestamp_ms
  if (typeof happened !== 'number' || !Number.isFinite(happened)) return false
  return happened < new Date(lastEventAt).getTime()
}
