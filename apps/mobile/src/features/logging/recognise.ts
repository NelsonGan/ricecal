import { type Food, type FoodDetailsRow, toFood } from '@/data'
import { supabase } from '@/lib/supabase'

/**
 * The recognition call, faked.
 *
 * This is the seam. Today it waits, then picks a dish out of the catalogue by
 * slug; tomorrow it posts the photo to a model and returns what came back. Its
 * shape is already the shape of that call — async, rejectable, and returning
 * the food an entry is written from — so replacing the body is the whole
 * change.
 *
 * A real one has to answer the miss too: a photo that matches nothing has to
 * tell the caller, not hand it a guess.
 *
 * Everything around it is built for the real timing: the row is on screen
 * before this is called, and the user is free to walk away while it runs.
 *
 * It returns a whole `Food` rather than a pair of ids because an entry carries
 * its own numbers now — see `data/snapshot.ts`. A pair of ids names rows in a
 * catalogue that is in another database entirely, and the caller cannot write
 * a diary row out of them.
 */

/** How long the fake takes. A real vision model is a second or three. */
const ANALYSE_MS = 2600

export type Recognition = Food

/**
 * What a photo "recognises" as.
 *
 * Searched rather than fetched by a hardcoded id, and that has outlived its
 * original reason. Catalogue ids used to be generated per environment, so a
 * constant would have worked in exactly one of them; the catalogue is one
 * shared D1 database now and the ids are stable. What keeps the search is that
 * it exercises the real path — a fake that reads a row the search cannot find
 * would go on passing after search broke.
 */
const GUESS_QUERY = 'nasi lemak ayam'

export async function recogniseDish(): Promise<Recognition> {
  await new Promise((resolve) => setTimeout(resolve, ANALYSE_MS))

  const { data, error } = await supabase.functions.invoke<{
    ok: boolean
    foods: FoodDetailsRow[]
  }>('catalogue', { body: { action: 'search', q: GUESS_QUERY, limit: 1 } })

  if (error) throw error
  const row = data?.ok ? data.foods?.[0] : undefined
  if (!row?.id) throw new Error('Recognition returned a dish that is not in the catalogue')

  return toFood(row)
}
