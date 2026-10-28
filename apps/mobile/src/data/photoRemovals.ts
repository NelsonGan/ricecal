import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import { useEntitlement } from './subscription'

export type PhotoRemoval = {
  id: string
  log_date: string
  photo_path: string
  item_name: string | null
  /** When the sweep may take it; it runs hourly, so within the hour after. */
  removes_at: string
}

/** How far ahead the list looks. The notice on Today counts a shorter stretch. */
const DAYS = 14

/**
 * A free account's meal photos that go in the next fortnight, soonest first.
 *
 * Asked only once the account is known to be free: Pro keeps everything and
 * the server answers an empty list anyway, so asking would be a round trip on
 * every launch for nothing. Half a day fresh, since a photo comes due by the
 * day and Today is opened many times in one.
 */
export function usePhotoRemovals() {
  const userId = useUserId()
  const { entitled, loading, unknown } = useEntitlement()
  return useQuery({
    queryKey: keys.photoRemovals(userId),
    enabled: !entitled && !loading && !unknown,
    staleTime: 12 * 60 * 60 * 1000,
    queryFn: async () =>
      unwrap(await supabase.rpc('upcoming_photo_removals', { p_days: DAYS })) as PhotoRemoval[],
  })
}
