import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrapMaybe } from './client'
import { keys } from './keys'
import { useUserId } from './session'

/**
 * The subscription, as RevenueCat last reported it.
 *
 * Read-only here in every sense: the table has no write grant for clients at
 * all, because entitlement is decided by the store and mirrored in by a
 * webhook. A client that could write it could grant itself the app.
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
