import { FREE_DAILY_SCANS } from '@ricecal/shared'
import { router } from 'expo-router'

import i18n from '@/i18n'
import { type ProFeature, track } from '@/lib/analytics'
import type { ToastApi } from '@/ui'

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
  const response = (error as { context?: unknown })?.context
  if (!(response instanceof Response)) return null
  // 402 and 429 are the only two statuses these endpoints use for a refusal.
  // Reading the body of everything else would be a wasted parse on the far
  // more common 401.
  if (response.status !== 402 && response.status !== 429) return null

  let body: RefusalBody
  try {
    // `clone` because the caller's own error handling may read it too, and a
    // Response body can only be consumed once.
    body = (await response.clone().json()) as RefusalBody
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
): error is NotEntitledError | ScanLimitError {
  if (error instanceof ScanLimitError) {
    if (error.entitled) {
      toast.show({ title: i18n.t('paywall:limit.proReached'), tone: 'error' })
      return true
    }
    // The SERVER's figure, not the constant. They agree, and when they ever do
    // not it is because the ceiling moved and this bundle has not caught up —
    // in which case the number that refused the request is the honest one to
    // print. `count` also drives the plural, so a ceiling of one reads properly
    // if it is ever set there.
    toast.show({
      title: i18n.t('paywall:limit.freeReached', { count: error.limit || FREE_DAILY_SCANS }),
      tone: 'warning',
    })
    // `screen: 'hard'` and the feature that was refused, exactly as
    // `useRequirePro` reports its own refusals — a limit reached on the server
    // and a button gated in the app are the same event to the funnel, and
    // splitting them would make the paywall look half as effective as it is.
    track('Paywall Shown', { screen: 'hard', trigger: feature })
    router.push('/paywall')
    return true
  }
  if (error instanceof NotEntitledError) {
    toast.show({ title: i18n.t('paywall:limit.notEntitled'), tone: 'warning' })
    track('Paywall Shown', { screen: 'hard', trigger: error.feature ?? feature })
    router.push('/paywall')
    return true
  }
  return false
}
