import { useSyncExternalStore } from 'react'

/** How long after a reset link's exchange its session may set a password unasked. */
const RECOVERY_WINDOW_MS = 15 * 60 * 1000

/**
 * Which account a reset link signed this app in as, and when. In memory only.
 *
 * Being signed in is not that. `new-password` drops its code field for a session
 * from the link, and `auth/[action]` sends a reset link there once it has one.
 * Both used to take any session as proof, so a signed-in phone could open
 * `ricecal://auth/reset` with no code at all and set a new password unasked,
 * which made the current password the change form asks for a check anybody
 * holding the phone could walk around.
 *
 * Recorded by `completeLoginFromUrl` when a reset link's code is actually
 * exchanged, which a URL without one can never do, and cleared the moment the
 * new password is saved. Two earlier versions read the token's `amr` claim
 * instead: aged by the phone's clock, a phone set fast sent every real link to
 * Today; aged by the token's issue time, the form stayed open after a finished
 * reset until the token's hour ran out, since a refresh moments later still
 * looked recent. Memory has neither problem. A relaunch forgets it, and the
 * screen then asks for a code, which costs one more mail in a rare case.
 */
let recovered: { userId: string; at: number } | null = null
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

/** A reset link's code was exchanged for this account's session, just now. */
export function markRecovered(userId: string): void {
  recovered = { userId, at: Date.now() }
  changed()
}

/** The reset is finished, or abandoned. Nothing opens the form unasked now. */
export function clearRecovered(): void {
  if (!recovered) return
  recovered = null
  changed()
}

/** Whether this session is the one a reset link produced, recently. */
export function isRecovered(
  session: { user: { id: string } } | null | undefined,
  now = Date.now(),
): boolean {
  return (
    !!session &&
    !!recovered &&
    recovered.userId === session.user.id &&
    now - recovered.at < RECOVERY_WINDOW_MS
  )
}

/**
 * The same, for a screen, which re-renders when the mark changes. The mark lands
 * a moment after the session does (the session is saved inside the exchange,
 * the mark after it resolves), so a screen reading it once would miss it.
 */
export function useRecovered(session: { user: { id: string } } | null | undefined): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => recovered,
  )
  return isRecovered(session)
}
