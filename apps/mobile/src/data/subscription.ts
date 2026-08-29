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
 * The subscription, as RevenueCat last reported it. Read-only in every sense:
 * the table has no client write grant, because entitlement is decided by the
 * store and mirrored in by the `revenuecat` webhook.
 *
 * No row means never subscribed, which is not an error.
 */
export function useSubscription() {
  // `useSession` rather than `useUserId`, here and for the store query below.
  // `useUserId` throws when nobody is signed in, and these are read by
  // `useEntitlement` through `EntitlementSync` at the root of the app, above
  // every session guard. A query with no account to ask about is disabled rather
  // than absent, which react-query reports as "not loading, no data".
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
 * The date is part of it. On the status alone, a webhook delivery that failed
 * past RevenueCat's retries leaves a row saying `active` with an expiry in the
 * past, and the app unlocks itself for ever.
 *
 * Null is no expiry: lifetime renews never, so reading it as expired would
 * refuse the one plan that cannot lapse.
 *
 * The server enforces the same rule in `entitledBy`. The two are either side of
 * the Deno / React Native line and change together: this decides what the
 * buttons say, that one refuses.
 *
 * `now` is a parameter so the boundary can be tested from both sides.
 */
export function isEntitledRow(row: EntitlementRow | undefined, now: Date = new Date()): boolean {
  if (!ENTITLED.has(row?.status ?? 'none')) return false
  const end = row?.current_period_end
  return !end || new Date(end) > now
}

export type Entitlement = {
  /**
   * Is this account Pro?
   */
  entitled: boolean
  /**
   * Is the answer still being fetched? Separate from `entitled`, because a screen
   * that conflates them flashes the paywall at a paying user on every cold
   * launch. Anything that gates waits for this; anything that decorates does not.
   */
  loading: boolean
  /** True while the app is offline and has no cached answer to fall back on. */
  unknown: boolean
}

/**
 * Whether this account may use the paid parts of the app. One hook, read by every
 * gate, and the server enforces the same rule independently.
 *
 * False while loading, and callers wait on `loading` rather than acting on it.
 * Assuming paid puts a non-paying user into the camera, spends an upload and a
 * model call, and refuses them at the end.
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
    // We asked and could not find out, so the screens say "we could not check"
    // rather than "you have not paid". A cached store answer of no settles it
    // even with the mirror unreachable, which is the ordinary offline case.
    unknown: !entitled && !mirrorLoading && !store.isLoading && mirrorNoAnswer && !storeNo,
  }
}

/**
 * What the store says, through the RevenueCat SDK.
 *
 * `networkMode: 'always'` is the one departure from the app-wide rule, because
 * this does not go to the network: the SDK answers out of its own cache offline.
 * Paused with everything else it would sit pending for ever.
 *
 * `retry: false`, because the common failure is a build with no RevenueCat in it.
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
 * Mounted once, near the root; the SDK fires its listener on a purchase, a
 * restore, a renewal, an expiry and its own refresh.
 *
 * - The store's answer goes straight into the cache, so a purchase unlocks the
 *   app in the frame after the store sheet closes.
 * - Our own mirror is invalidated, because RevenueCat having heard something is
 *   the earliest warning that the webhook is about to write that row. Waiting for
 *   a stale time is how the Me tab said "Free plan" for a minute after a
 *   purchase.
 *
 * The scan quota goes with it, since its ceiling is a property of the tier.
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
 * `reconcileEntitlement` refills the row from RevenueCat when it is missing, but
 * only from inside a Pro-gated request, and the scans-left line and the plan on
 * the Me tab are read straight out of Postgres. So an account whose webhook was
 * lost read "3 scans left today" over an unlocked app until it happened to press
 * a Pro button.
 *
 * Nothing is trusted from here: the endpoint takes an empty body and resolves the
 * account from the JWT.
 *
 * Two guards. The effect fires on the edge, the moment the two answers start
 * disagreeing, so it asks once rather than on every render; the set below stops a
 * second call overlapping one in flight, and is released so a later divergence
 * can ask again.
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
 * Shown, unlike the meter it replaced: `ai_usage_this_month()` counted requests
 * to a model, and no user knows how many of those a plate costs. This counts the
 * thing they did.
 *
 * Only the server knows. The count is claimed there, keyed by the user's own
 * local date, and a client copy would be wrong the first time the phone was
 * offline or a second device scanned.
 *
 * The row is always there, so a screen never has to tell "no row yet" from "no
 * answer yet".
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
 * What each plan costs, read from the store through RevenueCat. `retry: false`
 * on purpose: the common failure is a build with no products, such as a
 * dev-variant bundle id, and retrying only delays the dash the screen draws.
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
 * A purchase confirms in the store, RevenueCat hears about it, and only then does
 * the webhook write `subscriptions`, which is what `useEntitlement` reads. The
 * gap is small and not zero, so a screen navigating on the store's confirmation
 * alone could hand a paying user the paywall one tap later.
 *
 * So the purchase screens await this. It polls rather than assumes, and gives up
 * rather than blocking: an entitlement that has not landed in ten seconds will
 * land on its own.
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
