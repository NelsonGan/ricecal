// Asking RevenueCat directly, for when the webhook never told us.
//
// WHY THIS EXISTS, given that `subscriptions` is supposed to be the mirror.
// Because a mirror filled ONLY by a webhook has a single point of failure with
// no recovery: a delivery that fails past RevenueCat's retries, an event our
// own ordering guard wrongly drops, a sandbox purchase the environment rule
// refuses, or a function that was down for the ninety seconds the event was
// being delivered. Every one of those leaves somebody who has paid being
// refused by the server for ever, with nothing in the system that would ever
// correct it. That is not hypothetical: it is what happened, twice, and the
// second time the account had a live subscription in RevenueCat the whole time.
//
// So the mirror becomes a CACHE rather than the record, and this is the miss
// path. It is asked only when the row says no — which is exactly the moment we
// were about to refuse somebody — so an entitled account never pays for it, and
// a free account reaches it only on a request the client's own gate should have
// caught first.
//
// THE KEY IS THE PUBLIC SDK KEY, and that is not an oversight. RevenueCat's v1
// `GET /subscribers/{id}` is the same call the SDK in the app makes, and it
// accepts the public key precisely because it is a read of one customer. It
// cannot grant anything, it is already in the app binary, and nothing here
// trusts the CLIENT — we ask RevenueCat about an id we resolved from a verified
// JWT, and believe RevenueCat.

/** The entitlement this app sells. Matches `ENTITLEMENT` in the webhook. */
const ENTITLEMENT = 'pro'

/** RevenueCat is a third party on a request path; it does not get to hang. */
const TIMEOUT_MS = 4_000

export type StoreSubscriber = {
  /** Is the `pro` entitlement live right now, grace period included? */
  active: boolean
  /** Null means nothing to expire, which is what lifetime looks like. */
  expiresAt: string | null
  productId: string | null
  /** A sandbox purchase is free, and must not grant the real thing. */
  sandbox: boolean
  /** Whether this period is the introductory free trial. */
  trial: boolean
  /** `app_store`, `play_store`, `promotional`, `test_store`… */
  store: string | null
}

/** Exported so the tests can build a payload the compiler agrees with. */
export type V1Entitlement = {
  expires_date?: string | null
  grace_period_expires_date?: string | null
  product_identifier?: string | null
}

export type V1Subscription = {
  is_sandbox?: boolean
  period_type?: string | null
  store?: string | null
}

export type V1Response = {
  subscriber?: {
    entitlements?: Record<string, V1Entitlement | undefined>
    subscriptions?: Record<string, V1Subscription | undefined>
    non_subscriptions?: Record<string, unknown>
  }
}

const isLive = (iso: string | null | undefined, now: number): boolean =>
  typeof iso === 'string' && Number.isFinite(Date.parse(iso)) && Date.parse(iso) > now

/**
 * What RevenueCat currently says about one customer.
 *
 * NULL MEANS WE COULD NOT ASK, and the caller must not read it as "no". No key
 * configured, a timeout, a 500 from RevenueCat: every one of those leaves the
 * mirror's own verdict standing, which is a refusal. That is the same direction
 * `isEntitled` already fails in and the same reasoning — an outage that handed
 * the Pro features to everybody is the expensive way to be wrong.
 *
 * Exported separately from the parsing below so the shaping can be tested
 * without a network.
 */
export async function fetchSubscriber(appUserId: string): Promise<StoreSubscriber | null> {
  const key = Deno.env.get('REVENUECAT_API_KEY')
  if (!key) {
    console.warn('[revenuecat-api] REVENUECAT_API_KEY is not set; cannot reconcile')
    return null
  }

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      console.warn(`[revenuecat-api] ${response.status} asking about ${appUserId}`)
      return null
    }
    return subscriberFrom((await response.json()) as V1Response)
  } catch (error) {
    console.warn('[revenuecat-api] could not reach RevenueCat:', (error as Error).message)
    return null
  }
}

/**
 * Reads the v1 subscriber payload into the four facts this app needs.
 *
 * THE GRACE PERIOD COUNTS. A subscription whose payment is being retried has an
 * `expires_date` in the past and a `grace_period_expires_date` in the future,
 * and the store still considers it live — refusing there would take the app away
 * from somebody Apple is in the middle of charging.
 *
 * A MISSING `expires_date` IS LIFETIME, not an error: a non-renewing purchase
 * has nothing to expire, so the absence of a date is the strongest possible
 * claim to access rather than the weakest. Same rule, and same trap, as
 * `current_period_end` in the mirror.
 */
export function subscriberFrom(payload: V1Response, now: number = Date.now()): StoreSubscriber {
  const entitlement = payload?.subscriber?.entitlements?.[ENTITLEMENT]
  const absent: StoreSubscriber = {
    active: false,
    expiresAt: null,
    productId: null,
    sandbox: false,
    trial: false,
    store: null,
  }
  if (!entitlement) return absent

  const expires = entitlement.expires_date ?? null
  // Present and in the past is over — unless a grace period is still running.
  const lapsed =
    typeof expires === 'string' &&
    !isLive(expires, now) &&
    !isLive(entitlement.grace_period_expires_date, now)
  if (lapsed) return absent

  const productId = entitlement.product_identifier ?? null
  // `subscriptions` is keyed by product id, so the entitlement names its own
  // row. A one-off purchase has no entry there at all, which is why every field
  // read off it is optional rather than assumed.
  const subscription = productId ? payload?.subscriber?.subscriptions?.[productId] : undefined

  return {
    active: true,
    expiresAt: expires,
    productId,
    sandbox: subscription?.is_sandbox === true,
    trial: (subscription?.period_type ?? '').toLowerCase() === 'trial',
    store: subscription?.store ?? null,
  }
}
