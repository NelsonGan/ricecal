// The catalogue, which is not in this database any more.
//
// `foods`, `food_servings` and `food_aliases` used to live in the same Postgres
// as the diary. They are in Cloudflare D1 now, behind a Worker, for one reason:
// the barcode layer is 3.2 million rows, and holding it beside the diary meant
// the catalogue's size was the diary's problem. It crossed a plan ceiling once
// and took the whole database read-only mid-load.
//
// So this is the seam. Everything the server needs to know about a food goes
// through here, and the shapes it returns are deliberately the shapes the old
// `food_details` view returned — the callers were written against that, and a
// move of where the data lives should not become a rewrite of what it looks
// like.
//
// WHAT THIS MEANS FOR CORRECTNESS
//
// There is no foreign key any more. Postgres cannot check that a `food_id` on
// an entry names a row that exists, because the row is in another database on
// another continent's worth of network away. That check has been replaced by
// SNAPSHOTTING: an entry carries its own copy of the numbers it was logged
// with. The catalogue is a lookup, not a dependency.

/** Where the Worker is, and the token it expects. Set as function secrets. */
const BASE = Deno.env.get('CATALOGUE_URL') ?? ''
const TOKEN = Deno.env.get('CATALOGUE_TOKEN') ?? ''

/**
 * How long to wait on the catalogue before giving up.
 *
 * Short on purpose. Every caller here has something sensible to do without an
 * answer — the scan cascade falls to its archetype floor, the scanner offers
 * Describe — and a diary that hangs is worse than one that is briefly less
 * clever.
 */
const TIMEOUT_MS = 4000

function catalogueConfigured(): boolean {
  return BASE !== '' && TOKEN !== ''
}

export type CatalogueServing = {
  /** Minted by the Worker as `<food id>:<slug>`. D1 has no serving id column. */
  id: string
  slug: string
  label: string
  factor: number
  grams: number | null
  is_default: boolean
  position: number
}

export type CatalogueFood = {
  id: string
  slug: string
  name: string
  brand: string | null
  icon_set: string | null
  icon_name: string | null
  place: string
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  fibre_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  verified: boolean
  barcode: number | null
  popularity: number
  source_id: string | null
  source_name: string | null
  source_attribution: string | null
  servings: CatalogueServing[]
  /** The default portion, lifted onto the food exactly as `food_details` did. */
  default_serving_id: string | null
  serving_label: string | null
  serving_g: number | null
}

export type CatalogueProduct = {
  barcode: number
  name: string
  brand: string | null
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  serving_g: number | null
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!catalogueConfigured()) {
    console.error('catalogue: CATALOGUE_URL or CATALOGUE_TOKEN is unset')
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${TOKEN}` },
    })
    if (!res.ok) {
      // The body, not just the status. A 401 from the Worker and a 500 from D1
      // are the same number of characters in a log line and completely
      // different problems.
      console.error('catalogue', path, res.status, await res.text().catch(() => ''))
      return null
    }
    return (await res.json()) as T
  } catch (error) {
    // A timeout, a DNS failure, a Worker mid-deploy. Indistinguishable from
    // "no such food" as far as what the caller can do, and every caller has a
    // path for that.
    console.error('catalogue', path, error)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** One packaged product by the code on the packet, in any symbology. */
export async function lookupBarcode(code: string): Promise<CatalogueProduct | null> {
  const body = await call<{ ok: boolean; product: CatalogueProduct | null }>(
    `/barcode?code=${encodeURIComponent(code)}`,
  )
  return body?.product ?? null
}

/**
 * The catalogue search: five arms fused by rank, exactly as Postgres did it.
 *
 * The `fuzzy` flag the old RPC took is gone. It existed because the trigram
 * arms were expensive enough over half a million Postgres rows to blow a
 * statement timeout on a plate with five components; over 47,000 rows in SQLite
 * with an FTS index they are not, and one code path that behaves the same for
 * a person and for the scan cascade is worth more than the microseconds.
 *
 * RETURNS NULL WHEN THE CATALOGUE COULD NOT BE REACHED, and an empty array only
 * when it was reached and had nothing. That distinction cost an hour to learn
 * the hard way: this used to answer `[]` for both, so a Worker that was down,
 * misconfigured or holding a different token looked exactly like a dish nobody
 * has heard of — the app said "No dish by that name" over a search that had
 * never happened, and there was nothing in any log to say otherwise.
 */
export async function searchFoods(q: string, limit = 50): Promise<CatalogueFood[] | null> {
  const body = await call<{ ok: boolean; foods: CatalogueFood[] }>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  )
  return body ? (body.foods ?? []) : null
}

/**
 * Remember a product the catalogue did not have.
 *
 * Best-effort, and deliberately not awaited for correctness: the caller already
 * has the answer it needs, and this only decides whether the NEXT person to
 * scan that packet pays for the round trip to Open Food Facts. A failure here
 * must never fail the scan.
 */
export async function cacheProduct(product: CatalogueProduct): Promise<void> {
  await call('/product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  })
}
