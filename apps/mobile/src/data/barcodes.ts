import { supabase } from '@/lib/supabase'
import { toFood } from './mappers'
import { packetFoodId } from './snapshot'
import type { Food, FoodDetailsRow } from './types'

/**
 * A packet, by the code printed on it.
 *
 * TWO LOOKUPS BEHIND ONE CALL, AND THE ORDER IS THE WHOLE DESIGN
 *
 * The catalogue holds 3.2 million packaged products in D1. Open Food Facts
 * holds 4.7 million. The `barcode` edge function asks the first, and only when
 * that comes back empty does it ask the second live — and it WRITES what it
 * gets, so the second person to scan that packet gets the index probe.
 *
 * A miss is not an error. It is `null`, and the screen offers Describe, which
 * is the path that produces a real number for a packet nobody has recorded.
 * Anything THROWN here is the transport or the session, which is a different
 * thing to say and a different thing to do about it.
 *
 * WHY THIS IS A PLAIN FUNCTION AND NOT A HOOK
 *
 * It used to be a mutation the scanner awaited before deciding where to go, and
 * that is what made the scanner a screen with a spinner on it: the camera sat
 * there for as long as Open Food Facts took, saying "looking this one up". The
 * scan now navigates the moment a code is read, and the PAGE it lands on does
 * the lookup — through `useFood`, like every other food, because a scanned
 * packet reaches that screen under an id of its own (see `packetFoodId`).
 */
export async function lookupPacket(code: string): Promise<Food | null> {
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    food: FoodDetailsRow | null
  }>('barcode', { body: { code } })

  // The function does not return an HTTP error for "no such product" — that is
  // `{ok: true, food: null}` — so anything landing here is the transport or the
  // auth, and the caller should see it as a failure rather than as a product
  // that does not exist.
  if (error) throw error
  if (!data?.ok || !data.food) return null

  // THE ID IS MINTED HERE, and this is the fix for a scan that ended on the
  // app's own "page not found". A packaged product in D1 is a row in `product`,
  // keyed by barcode — it has no `foods.id`, so the function honestly returns
  // `id: null` for every one of them, and `toFood` turned that into an empty
  // string. `/log/food/` matches no route.
  //
  // What the screen actually needs is something to key its portion picker and
  // its query off, so the packet travels under a synthetic id like every other
  // food that is not a catalogue row. `snapshotFromFood` drops it again before
  // it can reach `food_logs.food_id`, which is a uuid column.
  return toFood({ ...data.food, id: packetFoodId(code) })
}
