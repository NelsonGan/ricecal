import { supabase } from '@/lib/supabase'
import { toFood } from './mappers'
import { packetFoodId } from './snapshot'
import type { Food, FoodDetailsRow } from './types'

/**
 * A packet, by the code printed on it.
 *
 * Two lookups behind one call, and the order matters: the `barcode` edge
 * function asks D1's 3.2 million products first, and only on a miss asks Open
 * Food Facts live. It writes what it gets back, so the second person to scan
 * that packet gets the index probe.
 *
 * A miss is `null`, not an error, and the screen offers Describe instead.
 * Anything thrown here is the transport or the session.
 *
 * A plain function rather than a hook, because awaiting it in the scanner is
 * what made the camera sit there saying "looking this one up". The scan now
 * navigates as soon as a code is read and the page does the lookup through
 * `useFood`, under an id of its own (see `packetFoodId`).
 */
export async function lookupPacket(code: string): Promise<Food | null> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    food: FoodDetailsRow | null
  }>('barcode', { body: { code } })

  // "No such product" is `{ok: true, food: null}`, so an error here is the
  // transport or the auth rather than a product that does not exist.
  if (error) throw error
  if (!data?.ok || !data.food) return null

  // A packaged product is a row in `product` keyed by barcode, so the function
  // honestly returns `id: null` and `toFood` turned that into an empty string,
  // which matches no route. The screen needs something to key its portion
  // picker and its query off, so the packet travels under a synthetic id.
  // `snapshotFromFood` drops it again before it can reach `food_logs.food_id`.
  return toFood({ ...data.food, id: packetFoodId(code) })
}
