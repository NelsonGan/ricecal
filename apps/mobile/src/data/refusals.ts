import { FREE_DAILY_SCANS } from '@ricecal/shared'
import { router } from 'expo-router'

import i18n from '@/i18n'
import { type ProFeature, track } from '@/lib/analytics'
import { queryClient } from '@/lib/query'
import type { StoreEntitlement } from '@/lib/revenuecat'
import type { ToastApi } from '@/ui'
import { keys } from './keys'
import type { ScanQuota } from './subscription'

/**
 * The two ways the server refuses, read back off the wire — and the one place
 * that decides what the user is told about each.
 *
 * Both arrive as an HTTP status with a `code` in the body, which is the one
 * shape supabase-js makes awkward: a non-2xx turns into a `FunctionsHttpError`
 * with `data` null, and the body — the part that says WHICH refusal — is only
 * reachable through the response hanging off the error. Every caller that
 * needs to tell "this needs Pro" from "you have used today's scans" would
 * otherwise reimplement that, so it is done once here.
 *
 * These exist as classes rather than as a string union because they travel
 * through `.catch()` handlers alongside timeouts and dropped connections, and
 * `instanceof` is the only test that stays honest when an error has been
 * through a promise chain.
 */

/** The account is not subscribed, and what it asked for is Pro. */
export class NotEntitledError extends Error {
  /**
   * Which Pro-only thing was refused, as the server named it.
   *
   * The same strings the client's own gate uses, so a refusal that started on
   * the server lands in the same funnel as one the button caught first. Null
   * for an older function that did not send it.
   */
  readonly feature: ProFeature | null

  constructor(feature: ProFeature | null = null) {
    super('This account is not subscribed')
    this.name = 'NotEntitledError'
    this.feature = feature
  }
}

/**
 * The account has spent today's scans.
 *
 * `entitled` is what decides the message, and it is the reason the server sends
 * it: a free account that has used its three has something to buy and is shown
 * the paywall, while a Pro account that has reached fifty in one day has not,
 * and is asked to get in touch. The numbers alone cannot tell those apart —
 * only somebody who knows both ceilings could read "50" as the paid one.
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
 * DUCK-TYPED, AND THIS IS NOT FUSSINESS. It was `context instanceof Response`,
 * which is the obvious spelling and was ALWAYS FALSE in this app: Expo 57 ships
 * its own fetch, and what comes back is a `FetchResponse` that does not
 * subclass the global `Response`. So this function returned null for every
 * refusal there has ever been, and every 402 and 429 the server sent —
 * "you have used today's three scans", "this one needs Pro" — reached the user
 * as a generic "could not read this one" with no toast and no paywall. The
 * server was refusing correctly and the app was mistranslating it, which is why
 * it looked like the paywall never opened.
 *
 * An `instanceof` against a class the runtime may swap is the wrong test for a
 * value that arrives from a library. What this actually needs is a status and a
 * body, so that is what it asks for.
 */
function asResponse(context: unknown): RefusalResponse | null {
  const candidate = context as Partial<RefusalResponse> | null | undefined
  if (!candidate || typeof candidate !== 'object') return null
  if (typeof candidate.status !== 'number') return null
  if (typeof candidate.json !== 'function') return null
  return candidate as RefusalResponse
}

/**
 * Turns a failed `functions.invoke` into one of the two refusals, or null when
 * it is an ordinary failure.
 *
 * Null is the common answer and callers must keep their existing handling for
 * it: a timeout and a dropped connection are not refusals, and treating them
 * as one would tell somebody they were out of scans because their train went
 * into a tunnel.
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
    // `clone` when it is offered, because the caller's own error handling may
    // read the body too and a body can only be consumed once. Not every
    // implementation has it — see `asResponse` — and reading directly is
    // correct for those: nothing downstream of here looks at it again.
    body = (await (response.clone ? response.clone() : response).json()) as RefusalBody
  } catch {
    return null
  }

  if (body.code === 'not_entitled') return new NotEntitledError(asFeature(body.feature))
  // `ai_limit` was this code's name while the meter counted requests to the
  // model rather than scans. Still accepted, because an app already on a phone
  // meets the new server before it meets the new bundle, and for that hour a
  // refusal it cannot parse is a generic "scan failed" over a paywall the user
  // needed to see.
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
   * How to reach the paywall, and it depends on what is refusing.
   *
   * `replace` is required from inside a MODAL — `/log` is a `transparentModal`,
   * and a push from within one lands on the stack that lives INSIDE that
   * presentation, so the paywall comes up stacked on the sheet with the sheet's
   * own scrim still over the app. Same rule, and the same reason, as
   * `useRequirePro`.
   */
  navigate?: 'push' | 'replace'
}

/**
 * Has the STORE told this device the account is paid up?
 *
 * Read straight out of the query cache rather than through a hook, because the
 * one caller is a `catch` handler in a mutation and there is no component to
 * hang a hook off. The cache is a module singleton, so this is the same answer
 * `useEntitlement` is reading a few lines away on screen.
 *
 * Matched across every user's entry rather than by id: this file has no session
 * to ask, the cache is cleared on every account change, and one entry is all
 * there ever is.
 */
function storeSaysPaid(): boolean {
  return queryClient
    .getQueriesData<StoreEntitlement | null>({ queryKey: keys.storeEntitlementAll() })
    .some(([, value]) => value?.active === true)
}

/**
 * The refusal a free account is ABOUT to get, worked out before the request.
 *
 * WHY BOTH ENDS. The ceiling is the server's and stays the server's — a count
 * kept in the client is wrong the first time the phone is offline or a second
 * device scans. But a shutter press that uploads a photograph, waits for a
 * round trip and then answers with a paywall has spent the user's time and our
 * bandwidth to tell them something this device already knew, and left a failed
 * row on the diary saying so. So the quota the camera panel is ALREADY drawing
 * its "2 scans left" line from is read once more at the tap.
 *
 * Null whenever the answer is not certain: no count yet, a Pro account, or
 * anything left. The server is what actually refuses, and this only ever
 * declines to make a request it knows the answer to.
 */
export function scanLimitAhead(quota: ScanQuota | undefined): ScanLimitError | null {
  if (!quota || quota.entitled || quota.remaining > 0) return null
  return new ScanLimitError(quota.used, quota.dailyLimit, quota.entitled)
}

/**
 * SAY WHAT HAPPENED, THEN SHOW THE PRICE. The one place that does both.
 *
 * Exported because the recipe screens reach the same ending by another route —
 * a trigger in Postgres refusing a fourth recipe, rather than an edge function
 * refusing a scan — and they were open-coding this three-line sequence, which
 * is how the two drifted the last time the copy moved.
 *
 * FROM THE TOP, ALWAYS, and that is the whole reason this is a function rather
 * than two lines at each call site. The paywall's buy button is a footer, at the
 * bottom of the screen, and a toast defaults to the bottom too — so the sentence
 * explaining why somebody needs Pro landed squarely on the button for buying it.
 * Every toast that opens this screen comes from the other edge.
 */
export function openPaywall(
  toast: ToastApi,
  options: { title: string; tone?: 'warning' | 'error'; feature: ProFeature } & RefusalOptions,
): void {
  const { title, tone = 'warning', feature, navigate = 'push' } = options
  toast.show({ title, tone, placement: 'top' })
  // `screen: 'hard'` and the feature that was refused, exactly as
  // `useRequirePro` reports its own refusals — a limit reached on the server
  // and a button gated in the app are the same event to the funnel, and
  // splitting them would make the paywall look half as effective as it is.
  track('Paywall Shown', { screen: 'hard', trigger: feature })
  if (navigate === 'replace') router.replace('/paywall')
  else router.push('/paywall')
}

/**
 * Says what happened, and opens the paywall when there is something to buy.
 *
 * ONE PLACE, because there are four call sites — a snapped plate, a typed one,
 * a correction and a recipe read — and they were four copies of the same two
 * branches. They had drifted already: one toasted and the others were silent
 * about the same refusal.
 *
 * THE TOAST AND THE PAYWALL TOGETHER, not one or the other. The paywall alone
 * appearing after a shutter press reads as the app having decided to sell
 * something, with no statement of what just failed; the toast alone tells
 * somebody they have run out and leaves them to go and find the way to fix it.
 * The toast says what happened and the screen behind it says what it costs.
 *
 * The exception is a PAYING account that has hit the daily ceiling. There is
 * nothing to sell it, so it gets the message and no paywall — showing one to
 * somebody who has already paid is the worst thing this app can do with a
 * refusal.
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
    // THE STORE SAYS THEY HAVE PAID and the server has not heard yet, which is
    // the seconds between a purchase settling and the webhook writing the row.
    // Selling the app to somebody who bought it a moment ago is the worst
    // answer available here, so they get told to wait rather than to pay.
    if (storeSaysPaid()) {
      toast.show({ title: i18n.t('paywall:limit.confirming'), tone: 'warning' })
      return true
    }
    // The SERVER's figure, not the constant. They agree, and when they ever do
    // not it is because the ceiling moved and this bundle has not caught up —
    // in which case the number that refused the request is the honest one to
    // print. `count` also drives the plural, so a ceiling of one reads properly
    // if it is ever set there.
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
    openPaywall(toast, {
      title: i18n.t('paywall:limit.notEntitled'),
      tone: 'warning',
      feature: error.feature ?? feature,
      navigate,
    })
    return true
  }
  return false
}
