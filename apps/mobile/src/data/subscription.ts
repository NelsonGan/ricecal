import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import {
  onStoreEntitlementChange,
  readStoreEntitlement,
  type StoreEntitlement,
} from '@/lib/revenuecat'
import { supabase } from '@/lib/supabase'
import { unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { fetchPlanPrices } from './purchases'
import { useSession, useUserId } from './session'

/**
 * The subscription, as RevenueCat last reported it.
 *
 * Read-only here in every sense: the table has no write grant for clients at
 * all, because entitlement is decided by the store and mirrored in by the
 * `revenuecat` webhook. A client that could write it could grant itself the app.
 *
 * No row means never subscribed, which is not an error. Most users are in that
 * state, and the paywall is what they see.
 */
export function useSubscription() {
  // `useSession`, not `useUserId`, and the same for the store query below.
  // `useUserId` throws when nobody is signed in, and these two are read by
  // `useEntitlement`, which is read by `EntitlementSync` at the root of the app,
  // above every session guard and before the keychain has been read. That was a
  // red error screen on cold start. A query with no account to ask about is
  // disabled rather than absent, which react-query reports as "not loading, no
  // data": the right shape for "signed out is not subscribed".
  const { userId } = useSession()

  return useQuery({
    queryKey: keys.subscription(userId ?? ''),
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrapMaybe(
        await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId as string)
          .maybeSingle(),
      ),
  })
}

/** The statuses that unlock the app. Must agree with `ENTITLED` on the server. */
const ENTITLED = new Set(['trial', 'active'])

/** Just enough of the row to decide, so a cached partial can be judged too. */
export type EntitlementRow = {
  status?: string | null
  current_period_end?: string | null
} | null

/**
 * The whole rule: an entitled status, and a period that has not run out.
 *
 * The date is part of it. Read on the status alone, as this was, a missed ending
 * is permanent rather than temporary: a webhook delivery that failed past
 * RevenueCat's retries, or an event the server's ordering guard wrongly
 * discarded, leaves a row saying `active` with an expiry in the past, and the app
 * goes on unlocking itself for ever.
 *
 * Null is no expiry. Lifetime renews never, so RevenueCat sends no expiry and the
 * column is null by design. Read as expired it would refuse the one plan that
 * cannot lapse.
 *
 * The server enforces the same rule independently in `entitledBy`. The two cannot
 * import each other across the Deno / React Native line, so they are two copies
 * of one rule and have to be changed together. This copy decides what the buttons
 * say; that one actually refuses.
 *
 * `now` is a parameter so the boundary can be tested from both sides without
 * moving the clock.
 */
export function isEntitledRow(row: EntitlementRow | undefined, now: Date = new Date()): boolean {
  if (!ENTITLED.has(row?.status ?? 'none')) return false
  const end = row?.current_period_end
  return !end || new Date(end) > now
}

export type Entitlement = {
  /**
   * Is this account Pro?
   *
   * It used to be "may this account log a meal", and it is not that any more: a
   * free account logs. What this decides is the Pro-only features and which of the
   * two daily ceilings applies. See the README, "Money: free and Pro".
   */
  entitled: boolean
  /**
   * Is the answer still being fetched?
   *
   * Separate from `entitled` because the two are read at different moments, and a
   * screen that conflates them flashes the paywall at a paying user on every cold
   * launch. Anything that gates should wait for this to be false; anything that
   * merely decorates can read `entitled` straight away.
   */
  loading: boolean
  /** True while the app is offline and has no cached answer to fall back on. */
  unknown: boolean
}

/**
 * Whether this account may use the paid parts of the app.
 *
 * One hook, and every gate in the app reads it, so "what does Pro include" is
 * answered in one place rather than by each screen comparing statuses. The server
 * enforces the same rule independently, because a check that only exists in the
 * client only applies to people running the client.
 *
 * It defaults to false while loading, and callers are expected to wait on
 * `loading` rather than act on the false. The alternative, assuming paid until
 * told otherwise, puts a non-paying user into the camera, spends a photo upload
 * and a model call, and then refuses them at the end.
 */
export function useEntitlement(): Entitlement {
  const { data, isLoading, isError, isPaused } = useSubscription()
  const store = useStoreEntitlement()

  // Never fetched, and not fetching either. `isPaused` is the offline case and it
  // matters more than it looks: every query in this app is `networkMode: 'online'`,
  // so with no connection and nothing rehydrated from MMKV this query sits pending
  // for ever. Folded into `loading` it would make every gated button silently do
  // nothing, with no message and no way to tell that from a broken app.
  const mirrorNoAnswer = data === undefined && (isError || isPaused)
  // Paused is not loading. Something that is loading will finish.
  const mirrorLoading = isLoading && !isPaused

  // Three states, not two. `null` is the SDK saying there is nothing to ask, which
  // is a build with a placeholder key. That is not the same as it saying no, and
  // reading it as a no would let a build with no store attached override an account
  // that is perfectly well subscribed.
  const storeYes = store.data?.active === true
  const storeNo = store.data != null && store.data.active === false

  // Either source saying yes is enough, and they are yes for different reasons. The
  // mirror is what the server enforces against and what survives a reinstall; the
  // store knows about the purchase that completed two seconds ago. Requiring both
  // would mean the paywall stays up until a webhook lands, which is the complaint
  // this exists to answer.
  const entitled = isEntitledRow(data) || storeYes

  return {
    entitled,
    // Only while nobody has said yes. Once one has, there is nothing left to
    // wait for and a gate should open rather than sit through the other.
    loading: !entitled && (mirrorLoading || store.isLoading),
    // We asked and could not find out. The screens use this to say "we could not
    // check" rather than "you have not paid", which are very different things to read
    // when you have in fact paid.
    //
    // A cached store answer of no settles it even with the mirror unreachable, which
    // is the ordinary offline case for a free account.
    unknown: !entitled && !mirrorLoading && !store.isLoading && mirrorNoAnswer && !storeNo,
  }
}

/**
 * What the store says, through the RevenueCat SDK.
 *
 * `networkMode: 'always'` is the one deliberate departure from the app-wide rule,
 * because this query does not go to the network. The SDK keeps its own cache of
 * the last customer info it validated and answers out of it offline. Paused with
 * everything else it would sit pending for ever, and the fallback it exists to be
 * would be the thing that was missing.
 *
 * `retry: false` for the reason `usePlanPrices` has it: the common failure is a
 * build with no RevenueCat in it, and that does not become true on the third ask.
 */
export function useStoreEntitlement() {
  const { userId } = useSession()

  return useQuery({
    queryKey: keys.storeEntitlement(userId ?? ''),
    enabled: Boolean(userId),
    queryFn: readStoreEntitlement,
    networkMode: 'always',
    retry: false,
    // The listener below is what keeps this fresh; the stale time only governs
    // how often a remount asks again.
    staleTime: 60 * 1000,
  })
}

/**
 * Keeps the two answers in step, from the one moment that knows they moved.
 *
 * Mounted once, near the root. The SDK fires its listener on a purchase, a
 * restore, a renewal, an expiry and on its own refresh, which is every moment the
 * answer could have changed. Two things follow, and both are done here:
 *
 * - The store's answer is written straight into the cache, so a purchase unlocks
 *   the app in the frame after the store sheet closes rather than after a
 *   refetch.
 * - Our own mirror is invalidated, because RevenueCat having heard something is
 *   the earliest possible warning that the webhook is about to write that row.
 *   Waiting for a stale time instead is how the Me tab went on saying "Free plan"
 *   for a minute after a purchase landed.
 *
 * The scan quota goes with it: its ceiling is a property of the tier, so an
 * account that has just become Pro has fifty a day rather than three.
 */
export function useEntitlementSync(): void {
  const queryClient = useQueryClient()
  const { userId } = useSession()

  useEffect(() => {
    if (!userId) return
    return onStoreEntitlementChange((entitlement) => {
      queryClient.setQueryData<StoreEntitlement | null>(keys.storeEntitlement(userId), entitlement)
      void queryClient.invalidateQueries({ queryKey: keys.subscription(userId) })
      void queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
    })
  }, [queryClient, userId])

  // The store's answer and our own, as they currently stand.
  const { data: store } = useStoreEntitlement()
  const { data: row } = useSubscription()
  const diverged = store?.active === true && !isEntitledRow(row)

  useEffect(() => {
    if (!userId || !diverged) return
    void healEntitlement(queryClient, userId)
  }, [userId, diverged, queryClient])
}

/**
 * The store says paid and our own row does not. Ask the server to settle it.
 *
 * Why the client has to prod. `reconcileEntitlement` on the server already
 * refills the row from RevenueCat when it is missing, but only from inside a
 * Pro-gated request, and two of the things this app draws are read straight out
 * of Postgres by the client instead. The scans-left line under the viewfinder and
 * the plan on the Me tab both come from that row, so an account whose webhook was
 * lost went on reading "3 scans left today" over an unlocked app until it
 * happened to press a Pro button.
 *
 * Nothing is trusted from here. The endpoint takes an empty body, resolves the
 * account from the JWT, and asks RevenueCat, so the worst this call can do is
 * make the server look up a subscription that is already the server's business.
 *
 * Two guards, doing different jobs. The effect fires on the edge, the moment the
 * two answers start disagreeing, so it asks once and not on every render. The set
 * below is narrower: it stops a second call overlapping one already in flight. It
 * is released afterwards on purpose, so a later divergence can ask again.
 */
const healing = new Set<string>()

async function healEntitlement(queryClient: QueryClient, userId: string): Promise<void> {
  if (healing.has(userId)) return
  healing.add(userId)
  try {
    const { data } = await supabase.functions.invoke<{ ok: boolean; entitled: boolean }>(
      'entitlement',
      { body: {} },
    )
    if (!data?.entitled) return
    // The row is there now. Everything read off it has to be asked again — the
    // plan line, the scans-left count, and the ceiling behind it.
    await queryClient.invalidateQueries({ queryKey: keys.subscription(userId) })
    await queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
  } catch {
    // Offline, or the endpoint is not deployed yet. The gates are already open
    // on the store's word and the webhook may still land; there is nothing to
    // say to the user about a repair they did not ask for.
  } finally {
    // Released so a LATER divergence — a renewal whose webhook is also lost —
    // can ask again. Within one divergence the guard above is what stops the
    // effect re-firing.
    healing.delete(userId)
  }
}

/**
 * How many scans this account has left today.
 *
 * Shown, unlike the meter this replaced. `ai_usage_this_month()` existed for
 * support and an admin view nobody built, because the number it returned could
 * not be put in front of anybody: it counted requests to a model, and no user has
 * any idea how many of those a plate costs. This one counts the thing they did,
 * so "2 scans left today" is a sentence that answers itself.
 *
 * Only the server knows. The count is claimed there, keyed by the user's own
 * local date, and a second copy in the client would be wrong the first time the
 * phone was offline, or a second device scanned, or the two disagreed about what
 * day it is.
 *
 * The row is always there, including for somebody who has never scanned, so a
 * screen never has to tell "no row yet" from "no answer yet".
 */
export type ScanQuota = {
  used: number
  dailyLimit: number
  remaining: number
  entitled: boolean
}

export function useScanQuota() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.scanQuota(userId),
    queryFn: async (): Promise<ScanQuota> => {
      const row = unwrapOne(await supabase.rpc('scan_usage_today').maybeSingle())
      return {
        used: row.used,
        dailyLimit: row.daily_limit,
        remaining: row.remaining,
        entitled: row.entitled,
      }
    },
    // A count that is a few seconds stale is fine; one that is a launch stale is
    // a free user told they have three left as they spend their last.
    staleTime: 30 * 1000,
  })
}

/**
 * What each plan costs, read from the store through RevenueCat.
 *
 * `retry: false` on purpose. The common failure is a build that simply has no
 * products, such as a dev-variant bundle id with no App Store Connect app behind
 * it, and retrying that three times only delays the dash the screen will draw.
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
 * The store is not the source this app reads. A purchase confirms in the store,
 * RevenueCat hears about it, and only then does the `revenuecat` webhook write
 * `subscriptions`, which is what `useEntitlement` reads. The gap is small and it
 * is not zero, so a screen that navigated on the store's confirmation alone could
 * hand a paying user the paywall again one tap later. That is the worst first
 * impression this app can make, and it is invisible in testing on a fast
 * connection.
 *
 * So the purchase screens await this before they move on. It polls rather than
 * assumes, and it gives up rather than blocking for ever: an entitlement that has
 * not landed in ten seconds will land on its own.
 */
const ENTITLEMENT_POLL_ATTEMPTS = 7
const ENTITLEMENT_POLL_INTERVAL_MS = 1_500

export function useAwaitEntitlement(): () => Promise<boolean> {
  const queryClient = useQueryClient()
  // `useSession`, not `useUserId`, and this is not a style choice. `useUserId`
  // throws when there is nobody signed in, and every paywall screen calls this
  // during render. A route restored cold, such as a deep link or a Fast Refresh,
  // mounts before the keychain read finishes, and the paywall came up as a red
  // error screen. Nothing here needs the id until the callback runs.
  const { userId } = useSession()

  return useCallback(async () => {
    // Nobody to check. Only reachable if a purchase somehow settled before the
    // session did; the gates recover on their own once it lands.
    if (!userId) return false
    // The store first, and usually it is the whole answer. The purchase that just
    // completed is one the SDK has already validated, so this resolves immediately
    // and the caller moves on without waiting on a webhook. Before it was asked,
    // every purchase paid the full ten seconds below and then navigated anyway.
    await queryClient.invalidateQueries({ queryKey: keys.storeEntitlement(userId) })
    const store = queryClient.getQueryData<StoreEntitlement | null>(keys.storeEntitlement(userId))

    // Asked for either way, because it is what the server reads: the gates open on
    // the store's word, and the requests behind them do not. Not awaited when the
    // store has already said yes, since nothing on screen is waiting for it.
    const mirror = queryClient.invalidateQueries({ queryKey: keys.subscription(userId) })
    if (store?.active) {
      void mirror
      return true
    }
    await mirror

    for (let attempt = 0; attempt < ENTITLEMENT_POLL_ATTEMPTS; attempt++) {
      const row = queryClient.getQueryData<EntitlementRow>(keys.subscription(userId))
      if (isEntitledRow(row)) return true
      if (attempt < ENTITLEMENT_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, ENTITLEMENT_POLL_INTERVAL_MS))
        await queryClient.invalidateQueries({ queryKey: keys.subscription(userId) })
      }
    }
    return false
  }, [queryClient, userId])
}
