/** How long after following a reset link its session may set a password unasked. */
const RECOVERY_WINDOW_S = 15 * 60

/**
 * Whether this session came from a password-reset link, recently.
 *
 * Being signed in is not that. `new-password` drops its code field when there is
 * a session, on the reasoning that a session there came from the reset link, and
 * `auth/[action]` sent any session that arrived on `ricecal://auth/reset` to it.
 * A signed-in phone could open that URL with no code at all and set a new
 * password with no proof, which made the current password the change form asks
 * for a check anybody could walk around.
 *
 * Supabase stamps how a session was obtained into the token's `amr` claim, and a
 * session exchanged from a reset link says `recovery` (checked against the local
 * stack: a password sign-in says `password`, a typed code says `otp`). The claim
 * survives refreshes, so it has to be recent as well.
 *
 * Read off the token without verifying it, which is fine for what this is: a
 * gate in the app's own flow, with the server's signature behind every request.
 */
export function isFreshRecovery(
  session: { access_token?: string } | null | undefined,
  now = Date.now(),
): boolean {
  const payload = session?.access_token?.split('.')[1]
  if (!payload) return false
  try {
    const padded = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const { amr } = JSON.parse(atob(padded)) as { amr?: { method?: string; timestamp?: number }[] }
    return (amr ?? []).some(
      (entry) =>
        entry.method === 'recovery' &&
        typeof entry.timestamp === 'number' &&
        now / 1000 - entry.timestamp < RECOVERY_WINDOW_S,
    )
  } catch {
    return false
  }
}
