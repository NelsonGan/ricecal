// The catalogue, as the app sees it.
//
// The client used to call `search_foods` and select from `food_details`
// directly, because the catalogue was a table in the same database its session
// authenticated against. It is in Cloudflare D1 now, behind a Worker that holds
// a shared secret, and a secret in a phone is not a secret. So this function is
// the client's door: it authenticates the user the way every other function
// here does, and then asks the Worker on their behalf.
//
// It adds nothing else. No ranking, no shaping, no caching — the Worker owns
// the query and the client owns the presentation, and a middle layer that
// quietly rewrote either would be a third place to look when a search result
// surprises somebody.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import { catalogueConfigured, getFood, lookupBarcode, searchFoods } from '../_shared/catalogue.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Request_ =
  | { action: 'search'; q?: string; limit?: number }
  | { action: 'food'; id?: string }
  | { action: 'barcode'; code?: string }

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: auth, error: authError } = await anonClient.auth.getUser()
  if (authError || !auth.user?.id) return json({ ok: false, error: 'not signed in' }, 401)

  if (!catalogueConfigured()) {
    return json({ ok: false, error: 'the catalogue is not configured on this deployment' }, 503)
  }

  let body: Request_
  try {
    const parsed = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ ok: false, error: 'body must be a JSON object' }, 400)
    }
    body = parsed as Request_
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  switch (body.action) {
    case 'search': {
      const q = (body.q ?? '').trim()
      // An empty query returns nothing rather than the first fifty rows of the
      // catalogue, which is what the client already expects: fifty arbitrary
      // dishes out of 47,000 is not a browse.
      if (!q) return json({ ok: true, foods: [] })
      const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
      const foods = await searchFoods(q, limit)
      // Null means the Worker could not be reached, which is NOT the same
      // answer as "nothing matched" and must not reach the client as one. A 502
      // puts the search panel into its error state ("something went wrong,
      // try again") instead of telling somebody their dish does not exist.
      if (foods === null) {
        return json({ ok: false, error: 'the catalogue is unreachable' }, 502)
      }
      return json({ ok: true, foods })
    }

    case 'food': {
      if (!body.id) return json({ ok: false, error: 'id is required' }, 400)
      return json({ ok: true, food: await getFood(body.id) })
    }

    case 'barcode': {
      if (!body.code) return json({ ok: false, error: 'code is required' }, 400)
      return json({ ok: true, product: await lookupBarcode(body.code) })
    }

    default:
      return json({ ok: false, error: 'unknown action' }, 400)
  }
})
