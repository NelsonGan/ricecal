// The catalogue, which is not in this database any more.
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

/**
 * Where the Worker is, and the token it expects. Set as function secrets.
 *
 * Read per call rather than at import, so a test can point this module at a
 * fake Worker whichever test file happened to import it first.
 */
const base = () => Deno.env.get('CATALOGUE_URL') ?? ''
const token = () => Deno.env.get('CATALOGUE_TOKEN') ?? ''

/**
 * How long to wait on the catalogue before giving up.
 *
 * Short on purpose. Every caller here has something sensible to say without an
 * answer — the scan reports that it could not read the plate, the scanner
 * offers Describe — and a diary that hangs is worse than one that admits it is
 * briefly less clever.
 */
const TIMEOUT_MS = 4000

function catalogueConfigured(): boolean {
  return base() !== '' && token() !== ''
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

/**
 * Where a cached product row came from.
 *
 * Absent for the bulk-loaded millions, which is the honest reading: they came
 * from the import rather than from anybody. See `product_contribution` in
 * `apps/cloudflare/d1/food-catalogue/schema.sql`.
 */
export type ProductSource = 'open_food_facts' | 'user_label'

export type CatalogueProduct = {
  barcode: number
  name: string
  brand: string | null
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  serving_g: number | null
  /** Null for a bulk-loaded row. Set only on the two contributed paths. */
  source?: ProductSource | null
}

/** One request and its body, or a throw for anything that is not a response. */
async function attempt<T>(path: string, init: RequestInit | undefined, signal: AbortSignal) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    signal,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) {
    // The body, not just the status. A 401 from the Worker and a 500 from D1
    // are the same number of characters in a log line and completely
    // different problems.
    console.error('catalogue', path, res.status, await res.text().catch(() => ''))
    return null
  }
  return (await res.json()) as T
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!catalogueConfigured()) {
    console.error('catalogue: CATALOGUE_URL or CATALOGUE_TOKEN is unset')
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    try {
      return await attempt<T>(path, init, controller.signal)
    } catch (error) {
      // A connection that broke, as opposed to one that was slow, is asked
      // once more inside the same deadline. Deno reports a pooled connection
      // the far end had already closed as a TypeError ("error sending request",
      // "error reading a body from connection") within milliseconds, and a
      // fresh one usually answers. A timeout is an AbortError and is not
      // retried: a Worker that has not answered in four seconds is not about
      // to. Reads only, so a write is never sent twice.
      const read = (init?.method ?? 'GET') === 'GET'
      if (!read || !(error instanceof TypeError) || controller.signal.aborted) throw error
      console.warn('catalogue', path, 'retrying after', error)
      return await attempt<T>(path, init, controller.signal)
    }
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
 * Stop asking a catalogue that has stopped answering, for a while.
 *
 * The scan cascade searches once per part, in turn, so a Worker that hangs
 * costs the full timeout once per part. On 2026-10-20 one five-part plate spent
 * twenty of its twenty-five seconds waiting on five searches that all timed
 * out, and every part was priced from the model in the end anyway.
 *
 * Two failures in a row, not one: a single slow answer happens a few times a
 * day and the next search after it is normally fine, so pausing on the first
 * would give up catalogue answers to save a wait that was not coming. Any
 * answer resets the count.
 *
 * Module scope, so it lasts as long as the isolate. That is one scan in
 * practice, and when an isolate does serve several it is the same catalogue
 * failing for all of them.
 */
export function pauseAfterFailures(failures: number, pauseMs: number, now = () => Date.now()) {
  let inARow = 0
  let pausedUntil = 0
  return {
    open: () => now() >= pausedUntil,
    record(answered: boolean) {
      if (answered) {
        inARow = 0
        return
      }
      inARow += 1
      if (inARow >= failures) {
        inARow = 0
        pausedUntil = now() + pauseMs
      }
    },
  }
}

const searchGate = pauseAfterFailures(2, 30_000)

/**
 * The catalogue search: five arms fused by rank, exactly as Postgres did it.
 *
 * The `fuzzy` flag the old RPC took is gone. It existed because the trigram arms
 * could blow a statement timeout over half a million Postgres rows; over 48,000
 * rows in SQLite with an FTS index they cannot.
 *
 * Returns null when the catalogue could not be reached, and an empty array only
 * when it was reached and had nothing. Answering `[]` for both made a Worker that
 * was down look exactly like a dish nobody has heard of, so the app said "No dish
 * by that name" over a search that had never happened.
 */
export async function searchFoods(q: string, limit = 50): Promise<CatalogueFood[] | null> {
  if (!searchGate.open()) return null
  const body = await call<{ ok: boolean; foods: CatalogueFood[] }>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  )
  searchGate.record(body !== null)
  // Once per pause. The searches it skips log nothing, so without this line an
  // outage reads as two failures and then silence.
  if (!searchGate.open()) console.warn('catalogue: two searches failed in a row, pausing search')
  return body ? (body.foods ?? []) : null
}

/**
 * Remember a product the catalogue did not have.
 *
 * Best-effort, and never fatal: the caller already has the answer it needs, and
 * this only decides whether the NEXT person to scan that packet pays for the
 * round trip to Open Food Facts. A failure here must never fail the scan.
 *
 * `source` travels with it. The Worker records it against the barcode so a
 * panel a model read off somebody's camera can be told apart from a row Open
 * Food Facts published, and taken back on its own if it turns out to be wrong.
 *
 * REPORTS WHAT HAPPENED, which is not the same as "this did not throw". `call`
 * answers null for a timeout, a 500 or a Worker mid-deploy and logs it, so a
 * caller that ignored the result could tell somebody their packet had been
 * added while the request was refused at the door. It did exactly that for the
 * whole of one test run.
 *
 * Three answers rather than two, because a boolean puts opposite news behind
 * one word. "Did not write a row" covers both the packet already being there,
 * which is the good outcome arriving by another route, and the catalogue being
 * unreachable, which means the packet is still missing. Only the second is
 * worth looking into, and only the first should be reported as a success.
 *
 *   stored   this call wrote the row
 *   present  somebody else got there first, which is a race with one right
 *            answer rather than a problem
 *   failed   the catalogue could not be reached, or refused the row
 */
export type CacheOutcome = 'stored' | 'present' | 'failed'

export async function cacheProduct(product: CatalogueProduct): Promise<CacheOutcome> {
  const body = await call<{ ok: boolean; stored?: boolean }>('/product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  })
  if (body?.ok !== true) return 'failed'
  // `stored` is absent on an older Worker than this function, which answered a
  // bare `{ ok: true }`. Reaching it at all meant the row was written, so the
  // fallback reads that way rather than reporting a failure that did not happen.
  return body.stored === false ? 'present' : 'stored'
}
