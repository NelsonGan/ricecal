import { FREE_DAILY_SCANS, FREE_RECIPES } from '@ricecal/shared'
import { router } from 'expo-router'

import i18n from '@/i18n'
import { type ProFeature, track } from '@/lib/analytics'
import { queryClient } from '@/lib/query'
import type { StoreEntitlement } from '@/lib/revenuecat'
import type { ToastApi } from '@/ui'
import { keys } from './keys'
import type { ScanQuota } from './subscription'

/**
 * The two ways the server refuses, read back off the wire, and the one place that
 * decides what the user is told about each.
 *
 * Both arrive as an HTTP status with a `code` in the body, which supabase-js
 * makes awkward: a non-2xx turns into a `FunctionsHttpError` with `data` null,
 * and the part saying which refusal is only reachable through the response
 * hanging off the error.
 *
 * Classes rather than a string union, because they travel through `.catch()`
 * handlers alongside timeouts and dropped connections.
 */

/** The account is not subscribed, and what it asked for is Pro. */
export class NotEntitledError extends Error {
  /**
   * Which Pro-only thing was refused, as the server named it: the same strings
   * the client's own gate uses, so both kinds of refusal land in the same funnel.
   * Null for an older function that did not send it.
   */
  readonly feature: ProFeature | null

  constructor(feature: ProFeature | null = null) {
    super('This account is not subscribed')
    this.name = 'NotEntitledError'
    this.feature = feature
  }
}

/**
 * The account has spent today's scans. `entitled` decides the message, which is
 * why the server sends it: a free account has something to buy and is shown the
 * paywall, where a Pro account at fifty in one day is asked to get in touch.
 */
export class ScanLimitError extends Error {
  readonly used: number
  readonly limit: number
  readonly entitled: boolean

  constructor(used: number, limit: number, entitled: boolean) {
    super('Daily scan limit reached')
    this.name = 'ScanLimitError'
    this.used = used
    this.limit = limit
    this.entitled = entitled
  }
}

type RefusalBody = {
  code?: string
  feature?: string
  used?: number
  limit?: number
  entitled?: boolean
}

/** The features the server is allowed to name. Anything else is dropped. */
const FEATURES = new Set<ProFeature>(['describe', 'refine', 'read_recipe', 'new_recipe', 'suggest'])

function asFeature(value: unknown): ProFeature | null {
  return typeof value === 'string' && FEATURES.has(value as ProFeature)
    ? (value as ProFeature)
    : null
}

/** The part of a fetch response this file reads. See `asResponse`. */
type RefusalResponse = {
  status: number
  json: () => Promise<unknown>
  clone?: () => RefusalResponse
}

/**
 * The response hanging off a `FunctionsHttpError`, if there is one.
 *
 * Duck-typed. It was `context instanceof Response`, which was always false here:
 * Expo 57 ships its own fetch, and what comes back is a `FetchResponse` that does
 * not subclass the global `Response`. So every 402 and 429 the server sent
 * reached the user as a generic "could not read this one", which looked like the
 * paywall never opening.
 *
 * What this needs is a status and a body, so that is what it asks for.
 */
function asResponse(context: unknown): RefusalResponse | null {
  const candidate = context as Partial<RefusalResponse> | null | undefined
  if (!candidate || typeof candidate !== 'object') return null
  if (typeof candidate.status !== 'number') return null
  if (typeof candidate.json !== 'function') return null
  return candidate as RefusalResponse
}

/**
 * Turns a failed `functions.invoke` into one of the two refusals, or null for an
 * ordinary failure. Null is the common answer and callers keep their existing
 * handling: a timeout is not a refusal, and treating it as one would tell
 * somebody they were out of scans because their train went into a tunnel.
 */
export async function refusalFrom(
  error: unknown,
): Promise<NotEntitledError | ScanLimitError | null> {
  const response = asResponse((error as { context?: unknown })?.context)
  if (!response) return null
  // 402 and 429 are the only two statuses these endpoints use for a refusal.
  // Reading the body of everything else would be a wasted parse on the far
  // more common 401.
  if (response.status !== 402 && response.status !== 429) return null

  let body: RefusalBody
  try {
    // `clone` when it is offered, because the caller's own error handling may read
    // the body too and a body can only be consumed once. Not every implementation has
    // it, and reading directly is correct for those: nothing downstream looks again.
    body = (await (response.clone ? response.clone() : response).json()) as RefusalBody
  } catch {
    return null
  }

  if (body.code === 'not_entitled') return new NotEntitledError(asFeature(body.feature))
  // `ai_limit` was this code's name while the meter counted requests to the model
  // rather than scans. Still accepted, because an app already on a phone meets the
  // new server before it meets the new bundle, and for that hour a refusal it
  // cannot parse is a generic "scan failed" over a paywall the user needed to see.
  if (body.code === 'scan_limit' || body.code === 'ai_limit') {
    return new ScanLimitError(
      Number(body.used ?? 0),
      Number(body.limit ?? 0),
      body.entitled === true,
    )
  }
  return null
}

export type RefusalOptions = {
  /**
   * How to reach the paywall. `replace` is required from inside a modal: `/log`
   * is a `transparentModal`, and a push from within one lands on the stack inside
   * that presentation. Same rule as `useRequirePro`.
   */
  navigate?: 'push' | 'replace'
}

/**
 * Has the store told this device the account is paid up? Read straight out of the
 * query cache, because the one caller is a `catch` handler with no component to
 * hang a hook off; the cache is a module singleton, so this is the same answer
 * `useEntitlement` reads.
 *
 * Matched across every user's entry rather than by id: this file has no session
 * to ask, and the cache is cleared on every account change.
 */
function storeSaysPaid(): boolean {
  return queryClient
    .getQueriesData<StoreEntitlement | null>({ queryKey: keys.storeEntitlementAll() })
    .some(([, value]) => value?.active === true)
}

/**
 * The refusal a free account is about to get, worked out before the request.
 *
 * The ceiling stays the server's, since a client-side count is wrong the first
 * time the phone is offline. But a shutter press that uploads a photograph and
 * then answers with a paywall has spent the user's time to say something this
 * device already knew, so the quota the camera panel is already drawing its "2
 * scans left" line from is read once more at the tap.
 *
 * Null whenever the answer is not certain. The server is what refuses; this only
 * declines to make a request it knows the answer to.
 */
export function scanLimitAhead(quota: ScanQuota | undefined): ScanLimitError | null {
  if (!quota || quota.entitled || quota.remaining > 0) return null
  return new ScanLimitError(quota.used, quota.dailyLimit, quota.entitled)
}

/**
 * The sentence for a refused feature, naming the feature.
 *
 * It used to be one sentence for all of them, on the argument that left this app
 * with a single paywall rather than a variant per button. That holds for the
 * screen and not for the toast: the paywall cannot say which button was pressed,
 * and "that one" points at something the user cannot see.
 *
 * Keyed by the same `ProFeature` the funnel breaks down by, so the sentence and
 * the `Paywall Shown` event beside it cannot name two different things.
 *
 * `i18n.t` rather than a `t` from a hook, because one of the two callers is a
 * `catch` handler with no component to hang `useTranslation` off.
 *
 * Every number the sentences might want is handed over whether or not the line
 * has a slot for it, as `PlanTable` does: a per-feature map of which figure each
 * line needs is a second place to keep in step, and getting it wrong prints
 * "{{recipes}}" in a toast.
 */
export function proFeatureTitle(feature: ProFeature): string {
  return i18n.t(`paywall:limit.feature.${feature}`, { recipes: FREE_RECIPES })
}

/**
 * Say what happened, then show the price. The one place that does both, exported
 * because the recipe screens reach the same ending through a Postgres trigger
 * rather than an edge function.
 *
 * From the top, always, which is why this is a function rather than two lines at
 * each call site: the paywall's buy button is a footer at the bottom and a toast
 * defaults to the bottom too, so the sentence landed on the button.
 */
export function openPaywall(
  toast: ToastApi,
  options: {
    title: string
    /** A second, quieter line under the title. See `announceRefusal`. */
    description?: string
    tone?: 'warning' | 'error'
    feature: ProFeature
  } & RefusalOptions,
): void {
  const { title, description, tone = 'warning', feature, navigate = 'push' } = options
  toast.show({ title, description, tone, placement: 'top' })
  // `screen: 'hard'` and the feature that was refused, exactly as `useRequirePro`
  // reports its own refusals. A limit reached on the server and a button gated in
  // the app are the same event to the funnel, and splitting them would make the
  // paywall look half as effective as it is.
  track('Paywall Shown', { screen: 'hard', trigger: feature })
  if (navigate === 'replace') router.replace('/paywall')
  else router.push('/paywall')
}

/**
 * Says what happened, and opens the paywall when there is something to buy.
 *
 * One place, because the four call sites were four copies of the same two
 * branches and had already drifted: one toasted and the others were silent.
 *
 * The toast and the paywall together. The paywall alone reads as the app having
 * decided to sell something with no statement of what failed; the toast alone
 * leaves somebody to find the way to fix it.
 *
 * The exception is a paying account at the daily ceiling, which has nothing to
 * buy, so it gets the message and no paywall.
 *
 * Returns true when it handled the error, so a caller reads as a single early
 * return in its `catch`.
 */
export function announceRefusal(
  toast: ToastApi,
  error: unknown,
  feature: ProFeature,
  options: RefusalOptions = {},
): error is NotEntitledError | ScanLimitError {
  const { navigate = 'push' } = options

  if (error instanceof ScanLimitError) {
    if (error.entitled) {
      toast.show({ title: i18n.t('paywall:limit.proReached'), tone: 'error' })
      return true
    }
    // The store says they have paid and the server has not heard yet, which is the
    // seconds between a purchase settling and the webhook writing the row. Selling
    // the app to somebody who bought it a moment ago is the worst answer available,
    // so they get told to wait rather than to pay.
    if (storeSaysPaid()) {
      toast.show({ title: i18n.t('paywall:limit.confirming'), tone: 'warning' })
      return true
    }
    // The server's figure, not the constant. They agree, and when they do not it is
    // because the ceiling moved and this bundle has not caught up, in which case the
    // number that refused the request is the honest one to print. `count` also drives
    // the plural, so a ceiling of one reads properly if it is ever set there.
    openPaywall(toast, {
      title: i18n.t('paywall:limit.freeReached', { count: error.limit || FREE_DAILY_SCANS }),
      tone: 'warning',
      feature,
      navigate,
    })
    return true
  }
  if (error instanceof NotEntitledError) {
    // Same exception, same reason: a lapsed-looking mirror over a store that
    // says otherwise is our record being behind, not the user being unpaid.
    if (storeSaysPaid()) {
      toast.show({ title: i18n.t('paywall:limit.confirming'), tone: 'warning' })
      return true
    }
    // The feature the server named, when it named one. A refusal that started on the
    // server and one a button caught first should read identically, and the server
    // knows what it refused better than the call site does. Why the subscription said
    // no goes underneath: which button was pressed is what the user needs.
    const refused = error.feature ?? feature
    openPaywall(toast, {
      title: proFeatureTitle(refused),
      description: i18n.t('paywall:limit.notEntitledDetail'),
      tone: 'warning',
      feature: refused,
      navigate,
    })
    return true
  }
  return false
}
