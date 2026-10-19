import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

import { reportMessage } from './errors'

/**
 * Requests that never reached the server while the phone said it was online.
 *
 * A user on mobile data could reach PostHog but not Supabase for a whole
 * morning. Nothing arrived in the Supabase logs, not even the token refresh, and
 * nothing on the phone said why. The phone knew: Expo's `fetch` puts the
 * platform's reason in the error it throws ("Could not connect to the server.",
 * a hostname that could not be found, a TLS failure). This sends it somewhere a
 * developer can read it.
 */

/** Hosts already reported this launch. One report says it; twenty say nothing more. */
const reported = new Set<string>()

/**
 * The host and the first three path segments of a URL. Never the query string:
 * the catalogue's carries the typed search and the photo URLs carry signatures.
 * Three segments is `/rest/v1/<table>` or `/functions/v1/<name>`, and stops
 * before a storage path that names a user.
 */
export function requestTarget(url: string): { host: string; path: string } | null {
  const match = /^https?:\/\/([^/?#]+)(\/[^?#]*)?/i.exec(url)
  if (!match) return null
  const path = (match[2] ?? '/').split('/').slice(0, 4).join('/') || '/'
  return { host: match[1], path }
}

/**
 * The platform's reason, without the native stack Expo appends after it.
 * Bounded, because it is filed as context and context is short scalars.
 */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(' (at ')[0].slice(0, 200) || 'no reason given'
}

/**
 * Whether the request was called off by whoever sent it, rather than lost.
 *
 * Expo's fetch never throws an `AbortError`. It throws its own `FetchError`:
 * "fetch failed: The operation was aborted." for a signal that had already
 * fired, and "fetch failed: FetchRequestCanceledException: Fetch request has
 * been canceled" for one that fired in flight. So a check on the name alone let
 * every cancelled query through as "could not reach", and the report it filed
 * used up the host's one report for the launch. The signal is the witness that
 * works on a phone.
 *
 * A caller's own time limit counts as calling it off too. `socialEntryPost`
 * gives up after two seconds by design, and on React Native's `AbortController`
 * that abort carries no reason to tell it apart from any other.
 */
export function callerCancelled(error: unknown, signal?: AbortSignal | null): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError' || signal?.aborted === true
}

/**
 * When each host last lost a request, with nothing from it answered since.
 *
 * One lost request is not a host that cannot be reached. iOS keeps a connection
 * open between requests, and after the app has sat idle or spent a while in the
 * background it can send the next request down one the other end has dropped.
 * That request fails ("The network connection was lost.") and the next one, on
 * a fresh connection, is answered. A request the app was suspended in the middle
 * of fails the same way when it wakes. On 1.1.0 those were nearly every report,
 * from about one phone in six a day, with the app talking to Supabase again
 * straight after.
 */
const lostSince = new Map<string, number>()

/**
 * How long a lost request waits for a second to confirm it. Longer than the
 * platform's own 60-second timeout plus react-query's retries, so a host that
 * swallows requests whole can still be confirmed. Short enough that a blip
 * before a spell in the background and another after it are not one outage.
 */
const CONFIRM_WITHIN_MS = 5 * 60_000

/** Something came back from `url`'s host, whatever the status, so it can be reached. */
export function noteResponse(url: string): void {
  const target = requestTarget(url)
  if (target) lostSince.delete(target.host)
}

/**
 * Reports that requests to `url`'s host are not going through, once per host per
 * launch.
 *
 * Not on the first lost request but on the next, and only when that one was
 * sent after the first had failed: it had a connection of its own and still got
 * nothing back. Requests that went out together on one dead connection fail
 * together and confirm nothing. An answer in between (`noteResponse`) starts it
 * over.
 *
 * Skipped while the phone is offline: supabase-js sends its token refresh with
 * no connection too, and a phone in a tunnel is not news. What is worth hearing
 * about is a phone that says it is online and still cannot reach us. Skipped
 * too for a request its caller cancelled; see `callerCancelled`.
 *
 * Never throws and is never awaited by the request that failed.
 */
export async function reportNetworkFailure(
  url: string,
  error: unknown,
  sentAt: number,
  signal?: AbortSignal | null,
): Promise<void> {
  try {
    if (callerCancelled(error, signal)) return
    if (!onlineManager.isOnline()) return
    const target = requestTarget(url)
    if (!target || reported.has(target.host)) return

    const failedAt = Date.now()
    const since = lostSince.get(target.host)
    if (since === undefined || failedAt - since > CONFIRM_WITHIN_MS) {
      lostSince.set(target.host, failedAt)
      return
    }
    if (sentAt <= since) return
    reported.add(target.host)

    const state = await NetInfo.fetch()
    reportMessage(`[network] could not reach ${target.host}`, {
      network_path: target.path,
      network_reason: failureReason(error),
      network_type: state.type,
      network_reachable: String(state.isInternetReachable),
      network_down_ms: failedAt - since,
    })
  } catch {
    // Reporting must never be the second failure.
  }
}

/** For tests: forget which hosts have been reported or have lost a request. */
export function resetNetworkReports(): void {
  reported.clear()
  lostSince.clear()
}
