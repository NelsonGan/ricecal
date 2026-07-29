import { supabase } from '@/lib/supabase'

/**
 * The recognition call, faked.
 *
 * This is the seam. Today it waits, then picks a dish out of the catalogue by
 * slug; tomorrow it posts the photo to a model and returns what came back. Its
 * shape is already the shape of that call — async, rejectable, and returning
 * only the two ids an entry needs — so replacing the body is the whole change.
 *
 * Everything around it is built for the real timing: the row is on screen
 * before this is called, and the user is free to walk away while it runs.
 *
 * The lookup is a real query rather than a hardcoded uuid because catalogue ids
 * are generated per environment — the same slug is a different row locally and
 * in production, and a constant would work on exactly one of them.
 */

/** How long the fake takes. A real vision model is a second or three. */
const ANALYSE_MS = 2600

export type Recognition = {
  foodId: string
  servingId: string
}

/** What a photo "recognises" as, and what a barcode "scans" as. */
const GUESS_SLUG = { photo: 'nasi-lemak-ayam', barcode: 'instant-noodles' } as const

export async function recogniseDish(mode: 'photo' | 'barcode'): Promise<Recognition> {
  await new Promise((resolve) => setTimeout(resolve, ANALYSE_MS))

  const { data, error } = await supabase
    .from('food_details')
    .select('id, default_serving_id, servings')
    .eq('slug', GUESS_SLUG[mode])
    .single()

  if (error) throw error
  if (!data?.id) throw new Error('Recognition returned a dish that is not in the catalogue')

  // The default serving is the one the macros are quoted per. A dish with none
  // is a broken catalogue row, and logging it against a guessed portion would
  // put a wrong number in the diary rather than surfacing that.
  const servingId =
    data.default_serving_id ??
    (Array.isArray(data.servings) && data.servings[0] && typeof data.servings[0] === 'object'
      ? ((data.servings[0] as { id?: string }).id ?? null)
      : null)

  if (!servingId) throw new Error('That dish has no servings')

  return { foodId: data.id, servingId }
}
