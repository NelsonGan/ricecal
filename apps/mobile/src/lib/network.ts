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
 * Reports that a request to `url` did not go through, once per host per launch.
 *
 * Skipped while the phone is offline: supabase-js sends its token refresh with
 * no connection too, and a phone in a tunnel is not news. What is worth hearing
 * about is a phone that says it is online and still cannot reach us.
 *
 * Never throws and is never awaited by the request that failed.
 */
export async function reportNetworkFailure(url: string, error: unknown): Promise<void> {
  try {
    if (!onlineManager.isOnline()) return
    const target = requestTarget(url)
    if (!target || reported.has(target.host)) return
    reported.add(target.host)

    const state = await NetInfo.fetch()
    reportMessage(`[network] could not reach ${target.host}`, {
      network_path: target.path,
      network_reason: failureReason(error),
      network_type: state.type,
      network_reachable: String(state.isInternetReachable),
    })
  } catch {
    // Reporting must never be the second failure.
  }
}

/** For tests: forget which hosts have been reported. */
export function resetNetworkReports(): void {
  reported.clear()
}
