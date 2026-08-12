import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { toFood } from './mappers'
import type { Food, FoodDetailsRow } from './types'

/**
 * A packet, by the code printed on it.
 *
 * TWO LOOKUPS, AND THE ORDER IS THE WHOLE DESIGN
 *
 * The catalogue holds ~25,000 packaged products: the Southeast Asian shelves,
 * plus the few thousand things the whole world scans. Open Food Facts holds 4.7
 * million. Storing all of them would mean four million rows a Malaysian search
 * has to rank against, which is exactly the mistake the catalogue was just
 * rebuilt to undo — so the rest live one request away.
 *
 *   lookup_barcode   an index probe. Tens of milliseconds, offline-cacheable,
 *                    and the answer for the aisle the user is actually in.
 *   barcode function Open Food Facts, live, when that comes back empty — and it
 *                    WRITES the product, so the second person to scan it gets
 *                    the fast path.
 *
 * A miss is not an error. It is `null`, and the screen offers Describe, which
 * is the path that produces a real number for a packet nobody has recorded.
 */

/** What a scan resolved to, and how — the screen says different things for each. */
export type BarcodeResult =
  | { status: 'found'; food: Food; fromCatalogue: boolean }
  | { status: 'unknown' }

export function useBarcodeLookup() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (code: string): Promise<BarcodeResult> => {
      // ONE call now, not two. There used to be a `lookup_barcode` RPC against
      // Postgres first and the edge function only on a miss, because the
      // catalogue was a table in the same database. It is in Cloudflare D1
      // behind a Worker the client may not hold a token for, so the function
      // does both halves: it asks the catalogue, and only if that misses does
      // it ask Open Food Facts live and remember the answer.
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean
        food: FoodDetailsRow | null
      }>('barcode', { body: { code } })

      // The function does not return an HTTP error for "no such product" — that
      // is `{ok: true, food: null}` — so anything landing here is the transport
      // or the auth, and the caller should see it as a failure rather than as a
      // product that does not exist.
      if (error) throw error
      if (!data?.ok || !data.food) return { status: 'unknown' }

      // `fromCatalogue` used to mean "the client's own lookup found it". With
      // one call it means "the catalogue had it", which the function reports by
      // giving the row an id: a product fetched live from Open Food Facts has
      // no catalogue row yet and comes back without one.
      return {
        status: 'found',
        food: toFood(data.food),
        fromCatalogue: Boolean(data.food.id),
      }
    },

    onSuccess: (result) => {
      // A product fetched live is a new catalogue row, so anything holding a
      // stale "no such food" for that id is now wrong. Only the one row: the
      // search cache is keyed by query text and a barcode is not one.
      if (result.status === 'found' && !result.fromCatalogue) {
        client.setQueryData(keys.food(result.food.id), result.food)
      }
    },
  })
}
