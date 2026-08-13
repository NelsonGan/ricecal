import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { supabase } from '@/lib/supabase'
import { unwrapMaybe } from './client'
import { keys } from './keys'
import { fetchPlanPrices } from './purchases'
import { useUserId } from './session'

/**
 * The subscription, as RevenueCat last reported it.
 *
 * Read-only here in every sense: the table has no write grant for clients at
 * all, because entitlement is decided by the store and mirrored in by the
 * `revenuecat` webhook. A client that could write it could grant itself the
 * app.
 *
 * No row means never subscribed, which is not an error — most users are in
 * that state, and the paywall is what they see.
 */
export function useSubscription() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.subscription(userId),
    queryFn: async () =>
      unwrapMaybe(
        await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
      ),
  })
}

/** The statuses that unlock the app. Must agree with `ENTITLED` on the server. */
const ENTITLED = new Set(['trial', 'active'])

export type Entitlement = {
  /** May this account log a meal and reach the model? */
  entitled: boolean
  /**
   * Is the answer still being fetched?
   *
   * Separate from `entitled` because the two are read at different moments and
   * a screen that conflates them flashes the paywall at a paying user on every
   * cold launch. Anything that GATES should wait for this to be false;
   * anything that merely decorates can read `entitled` straight away.
   */
  loading: boolean
  /** True while the app is offline and has no cached answer to fall back on. */
  unknown: boolean
}

/**
 * Whether this account may use the paid parts of the app.
 *
 * ONE HOOK, and every gate in the app reads it, so "what does Pro include" is
 * answered in one place rather than by each screen comparing statuses. The
 * server enforces the same rule independently — see `requireEntitlement` in
 * the edge functions — because a check that only exists in the client is a
 * check that only applies to people running the client.
 *
 * DEFAULTS TO ENTITLED WHILE LOADING is deliberately NOT what this does. It
 * defaults to false, and callers are expected to wait on `loading` rather than
 * act on the false. The alternative — assume paid until told otherwise — puts
 * a non-paying user into the camera, spends a photo upload and a model call,
 * and then refuses them at the end, which costs money and reads as a bug.
 */
export function useEntitlement(): Entitlement {
  const { data, isLoading, isError, isPaused } = useSubscription()

  // Never fetched, and not fetching either. `isPaused` is the offline case and
  // it matters more than it looks: every query in this app is
  // `networkMode: 'online'`, so with no connection and nothing rehydrated from
  // MMKV this query sits pending FOR EVER. Folded into `loading` it would make
  // every gated button silently do nothing, with no message and no way for the
  // user to tell that from a broken app.
  const noAnswer = data === undefined && (isError || isPaused)

  return {
    entitled: ENTITLED.has(data?.status ?? 'none'),
    // Paused is not loading. Something that is loading will finish.
    loading: isLoading && !isPaused,
    // We asked and could not find out. The screens use this to say "we could
    // not check" rather than "you have not paid", which are very different
    // things to read when you have in fact paid.
    unknown: noAnswer,
  }
}

/**
 * What each plan costs, read from the store through RevenueCat.
 *
 * `retry: false` on purpose. The common failure is a build that simply has no
 * products — a dev-variant bundle id with no App Store Connect app behind it —
 * and retrying that three times only delays the dash the screen is going to
 * draw anyway.
 */
export function usePlanPrices() {
  return useQuery({
    queryKey: keys.planPrices(),
    queryFn: fetchPlanPrices,
    retry: false,
    // A price moves when somebody changes it in a store console, which is not
    // something worth polling for inside one session.
    staleTime: 60 * 60 * 1000,
  })
}

/**
 * Waits for a just-completed purchase to reach our own mirror of it.
 *
 * THE STORE IS NOT THE SOURCE THIS APP READS. A purchase confirms in the
 * store, RevenueCat hears about it, and only then does the `revenuecat`
 * webhook write `subscriptions` — which is what `useEntitlement` reads. The
 * gap is small and it is not zero, so a screen that navigated on the store's
 * confirmation alone could hand a paying user the paywall again one tap later.
 * That is the worst first impression this app can make, and it is entirely
 * invisible in testing on a fast connection.
 *
 * So the purchase screens await this before they move on. It polls rather than
 * assumes, and it gives up rather than blocking for ever: an entitlement that
 * has not landed in ten seconds will land on its own, and the router and the
 * gates both recover once it does.
 */
const ENTITLEMENT_POLL_ATTEMPTS = 7
const ENTITLEMENT_POLL_INTERVAL_MS = 1_500

export function useAwaitEntitlement(): () => Promise<boolean> {
  const queryClient = useQueryClient()
  const userId = useUserId()

  return useCallback(async () => {
    for (let attempt = 0; attempt < ENTITLEMENT_POLL_ATTEMPTS; attempt++) {
      await queryClient.invalidateQueries({ queryKey: keys.subscription(userId) })
      const row = queryClient.getQueryData<{ status?: string } | null>(keys.subscription(userId))
      if (ENTITLED.has(row?.status ?? 'none')) return true
      if (attempt < ENTITLEMENT_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, ENTITLEMENT_POLL_INTERVAL_MS))
      }
    }
    return false
  }, [queryClient, userId])
}
