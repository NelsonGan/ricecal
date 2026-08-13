import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
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

export type AiUsage = {
  used: number
  monthlyLimit: number
  remaining: number
}

/**
 * How many model requests this account has spent this month.
 *
 * The limit lives in Postgres (`ai_monthly_limit`) and travels with the
 * answer rather than being a constant here: a client that hardcoded 3,000
 * while the database enforced something else would be the version that is
 * wrong, and it would be wrong on the screen that tells the user the number.
 */
export function useAiUsage() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.aiUsage(userId),
    queryFn: async (): Promise<AiUsage> => {
      const row = unwrapOne(await supabase.rpc('ai_usage_this_month').single())
      return {
        used: Number(row.used ?? 0),
        monthlyLimit: Number(row.monthly_limit ?? 0),
        remaining: Number(row.remaining ?? 0),
      }
    },
  })
}
