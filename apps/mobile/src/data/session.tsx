import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'

import { supabase } from '@/lib/supabase'

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

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)

      // Whoever signed in last is not who the cache is about. Clearing on both
      // edges is what stops one account's diary appearing for a moment under
      // another's name — the alternative is remembering to invalidate every
      // key that will ever exist.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        queryClient.clear()
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
