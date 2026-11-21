import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap } from './client'
import { keys } from './keys'
import { ENTRY_COLUMNS, type EntryRow, toEntry } from './mappers'
import { useUserId } from './session'
import type { Entry, EntryLocation } from './types'

/** An entry known to carry a location. */
export type LocatedEntry = Entry & { location: EntryLocation }

/**
 * How far back the food map and the picker's recent places read. A few years
 * of a meal or two a day tagged; past this the map's "All time" shows the
 * newest of them, which is what anybody looking at it wants.
 */
const LOCATED_LIMIT = 2000

async function fetchLocated(userId: string): Promise<LocatedEntry[]> {
  const rows = unwrap(
    await supabase
      .from('food_log_details')
      .select(ENTRY_COLUMNS)
      .eq('user_id', userId)
      // The partial index `food_logs_user_located_idx` serves exactly this.
      .not('latitude', 'is', null)
      .order('log_date', { ascending: false })
      .order('logged_at', { ascending: false })
      .limit(LOCATED_LIMIT)
      .overrideTypes<EntryRow[], { merge: false }>(),
  )
  return rows.map(toEntry).filter((entry): entry is LocatedEntry => Boolean(entry.location))
}

/**
 * Every entry this account tagged with where it was eaten, newest first
 * (README: Meal locations). One read for the food map's every period and for
 * the picker's recent places, rather than one per month: a few hundred rows
 * at most for nearly everyone, and the periods are then a filter rather than
 * a request each.
 *
 * `enabled` so a screen that has nothing to show yet (Locations off and no
 * tagged entry known) does not ask.
 */
export function useLocatedEntries({ enabled = true }: { enabled?: boolean } = {}) {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.located(userId),
    queryFn: () => fetchLocated(userId),
    enabled,
  })
}

/**
 * Whether this account has tagged any meal, for Today's map button while
 * Locations is off: one row's id from the partial index, not the entries.
 */
export function useHasLocatedEntries({ enabled = true }: { enabled?: boolean } = {}) {
  const userId = useUserId()
  return useQuery({
    queryKey: [...keys.located(userId), 'any'] as const,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('food_logs')
          .select('id')
          .eq('user_id', userId)
          .not('latitude', 'is', null)
          .limit(1),
      )
      return rows.length > 0
    },
    enabled,
  })
}
