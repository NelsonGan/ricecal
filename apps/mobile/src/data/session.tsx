import { AuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'
import { identifyUser, resetIdentity } from '@/lib/analytics'
import { forgetPurchaser, identifyPurchaser } from '@/lib/revenuecat'
import { storedSession, supabase, whenStoredSession } from '@/lib/supabase'
import { clearPendingSnaps } from './pending-snaps'
import { clearImageCache } from './photos'

/**
 * Who is signed in, for the whole app.
 *
 * A context rather than a query because the session is not fetched — it is
 * pushed. `onAuthStateChange` fires on sign-in, sign-out, token refresh and
 * every launch after the client has read the keychain, and a `useQuery` over
 * something that announces its own changes is a cache that is always one event
 * behind.
 *
 * `loading` exists so the router can tell "no session" from "not looked yet".
 * Without it, every cold start flashes the sign-in screen for the frame or two
 * the keychain read takes.
 */

type SessionValue = {
  session: Session | null
  userId: string | null
  loading: boolean
}

const SessionContext = createContext<SessionValue>({
  session: null,
  userId: null,
  loading: true,
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  /**
   * Which account the query cache holds, as far as this provider has been told.
   * `undefined` until the first auth event — see the clearing rule below.
   */
  const cacheOwner = useRef<string | null | undefined>(undefined)

  /**
   * Who this process has told RevenueCat and Mixpanel about.
   *
   * Deliberately NOT `cacheOwner`. That one answers "has the person changed",
   * which is false on a cold start by design; this one answers "have we said
   * anything yet", which is false on exactly the launches where identifying
   * matters most.
   *
   * The ADDRESS is in the signature as well as the id, because it is the one
   * fact here that moves under a stable account: changing an email fires
   * `USER_UPDATED` with the same user id, and keyed on the id alone the
   * dashboard would go on showing the old address for as long as the process
   * lived. What the wider key costs is naming the same person twice on an event
   * both platforms treat as idempotent, which happens about as often as
   * somebody changes their email.
   */
  const identified = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    // Whether supabase has spoken, by either of the two mouths it has — the
    // call below and the events after it. The storage answer is a stand-in
    // until one of them does and must never land on top of one, since only
    // they have been to the server. In practice the stand-in is always first,
    // the keychain read being the first thing supabase's own startup does; the
    // guard is what makes that ordering a fact rather than an assumption.
    let answered = false

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      answered = true
      // An ERROR here is not an answer. A refresh that could not be sent leaves
      // the session on disk and reports null, which is the same shape as having
      // no account at all — see `storedSession`. Anything that is not a network
      // failure (a revoked token, a deleted user) really did answer, and the
      // null stands.
      setSession(
        data.session ?? (error instanceof AuthRetryableFetchError ? storedSession() : null),
      )
      setLoading(false)
    })

    /**
     * WHERE THE LAUNCH BELONGS, WITHOUT WAITING FOR A NETWORK.
     *
     * The call above is the authoritative answer and it is worth having, but it
     * is not worth holding the whole app for: offline it takes supabase at
     * least thirty seconds to give up on the refresh it does first, and a
     * hanging request rather than a refused one makes that longer still. The
     * app was a spinner for all of it. Every offline behaviour underneath —
     * the router's own paused branch, Today reading the diary off the disk —
     * sits below this flag and so was never reached.
     *
     * Storage has the answer before any of that starts, and it is the same
     * answer in every case but one: a session revoked or deleted while the app
     * was closed, which storage cannot know about. That case corrects itself
     * twice over — the call above lands and says so, and `SIGNED_OUT` arrives
     * from supabase's own recovery — so the cost is a frame of the wrong screen
     * for somebody signing in again anyway. Nothing here is a credential: the
     * client goes on minting its own token for every request it sends.
     */
    void whenStoredSession().then((stored) => {
      if (!active || answered) return
      setSession(stored)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      // Same fallback, because the initial event travels the same road: supabase
      // catches the failed load and announces `INITIAL_SESSION, null`, which
      // would otherwise undo the line above a tick later. Only that event — the
      // rest say what they mean, and a sign-out has already emptied the storage
      // this reads by the time it fires.
      const resolved = next ?? (event === 'INITIAL_SESSION' ? storedSession() : null)
      answered = true
      setSession(resolved)
      setLoading(false)

      /**
       * Whoever signed in last is not who the cache is about — but a cold start
       * is not a change of person, and it used to be treated as one.
       *
       * `_recoverAndRefresh` announces `SIGNED_IN` on EVERY launch that finds a
       * usable session in the keychain, and clearing on the event itself made
       * that a race against the rehydration MMKV performs alongside it. The
       * restore is the one that usually wins, which is why nothing looked
       * broken: measured on a warm simulator the cache was already 108 queries
       * deep before the FIRST auth event arrived. That is also what makes the
       * loser expensive — whenever auth init is the slower of the two (a cold
       * keychain, a real handset, a larger cache to read back), that `SIGNED_IN`
       * lands on a fully restored cache and empties it, and the persister then
       * writes the empty result back over the disk copy. Online the refetch
       * beats the eye. Offline there is no refetch: every query is left with no
       * data, paused for want of a connection, and the screen waits on
       * something that is never coming.
       *
       * So the trigger is the IDENTITY changing, not the event. `undefined`
       * means no event has arrived yet and is deliberately not `null`: the
       * restored cache belongs to whoever was signed in when the app was
       * killed, and the first event is about that same person.
       *
       * The leaving edge is kept as an event regardless of that comparison. It
       * is the half that carries the rule — one account's diary must never
       * appear under another's name — and a SIGNED_OUT arriving FIRST, before
       * this provider has been told who it is looking at, would otherwise be
       * read as no change at all.
       */
      const nextUserId = resolved?.user.id ?? null
      const changed = cacheOwner.current !== undefined && cacheOwner.current !== nextUserId
      cacheOwner.current = nextUserId
      if (changed || event === 'SIGNED_OUT') queryClient.clear()

      // The pictures are not in that cache. They are on disk, in expo-image's,
      // filed under a key that no longer rotates — so unlike every other trace
      // of an account they do not age out by themselves. See `clearImageCache`
      // for why this is the leaving edge only.
      if (event === 'SIGNED_OUT') {
        void clearImageCache()
        // Persisted, unencrypted, and outlives the process — so a departed
        // account's in-flight meals would otherwise rehydrate for whoever opens
        // the app next. See `clearPendingSnaps`.
        clearPendingSnaps()
      }

      // RevenueCat has to be told who this is, or a purchase arrives at the
      // webhook under an anonymous id with no account to credit and is dropped.
      //
      // ONCE PER PROCESS FOR WHOEVER IS SIGNED IN, tracked separately from
      // `cacheOwner` above. It cannot key off `changed` the way the cache
      // clearing does: `changed` is false on the FIRST event by construction —
      // a cold start is not a change of person — and that is exactly the
      // launch where this process has told RevenueCat nothing at all. Keyed
      // that way it only ever ran when somebody switched accounts, and the
      // ordinary case of opening the app and buying something never identified
      // anybody. `logIn` with an id the SDK already holds is a no-op, so
      // repeating it on each launch costs nothing and is the version that
      // cannot silently skip.
      //
      // Mixpanel is told at the same moment and on the same terms, because it
      // is the same question — who is this process about — and getting it wrong
      // costs the same thing: events filed against an anonymous device id, which
      // no funnel can join back to the account that produced them.
      //
      // THE TWO ARE TOLD THE SAME THING, and this is the only line in the app
      // that could stop being true. Both platforms key on the Supabase user id,
      // so RevenueCat's forwarded purchases and Mixpanel's own events describe
      // one person rather than two — the distinct id travels from the analytics
      // seam to the purchase SDK rather than being assumed equal in both. The
      // ADDRESS goes to both from this one read of the session, which is what
      // makes somebody who writes in about a purchase findable on either
      // dashboard by the address they wrote from. It is the account's own
      // email, so every way in supplies it — a provider sign-in included, since
      // Supabase stores what the identity token carried.
      if (nextUserId) {
        const email = resolved?.user.email ?? null
        const signature = `${nextUserId} ${email ?? ''}`
        if (identified.current !== signature) {
          identified.current = signature
          const mixpanelDistinctId = identifyUser(nextUserId, email)
          void identifyPurchaser(nextUserId, { email, mixpanelDistinctId })
        }
      } else if (event === 'SIGNED_OUT') {
        identified.current = null
        void forgetPurchaser()
        resetIdentity()
      }
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  /**
   * Supabase's refresh timer is a `setInterval`, and iOS suspends those while
   * the app is backgrounded. Without this, a phone left overnight comes back
   * with an expired access token and every query 401s until something else
   * triggers a refresh.
   */
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })

    supabase.auth.startAutoRefresh()
    return () => {
      listener.remove()
      supabase.auth.stopAutoRefresh()
    }
  }, [])

  const value = useMemo<SessionValue>(
    () => ({ session, userId: session?.user.id ?? null, loading }),
    [session, loading],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  return useContext(SessionContext)
}

/**
 * The signed-in user's id, for a hook that cannot run without one.
 *
 * Throws rather than returning null: every query below this line is enabled on
 * the session existing, so a null here means a screen rendered outside the
 * guard, which is a routing bug and should be loud.
 */
export function useUserId(): string {
  const { userId } = useContext(SessionContext)
  if (!userId) throw new Error('useUserId called with no session')
  return userId
}
