// The barcode endpoint: what to do when the catalogue has never seen a packet.
//
// Most scans never reach the live fallback. The catalogue holds 3.2 million
// packaged products and answers a code in one index probe; Open Food Facts
// holds ~4.7 million, so everything else lives one request away, here.
//
// THE ROW IS WRITTEN, NOT JUST RETURNED
//
// A product fetched live is inserted as `service_role` and becomes an ordinary
// catalogue row, so the second person to scan that packet gets the fast path
// and so the entry logged against it references a real `foods.id` like every
// other entry. This is the same reason `scan-meal` writes its estimate rows
// rather than returning loose macros: `food_logs.food_id` is not null, and a
// diary that cannot reference what it logged has nowhere to put it.
//
// No client writes the catalogue — see the invariant in CLAUDE.md — which is
// why a lookup the client could have done itself is a function at all. The
// client could fetch openfoodfacts.org directly; it could not turn the answer
// into a row.
//
// WHAT IT REFUSES TO INVENT
//
// A product with no energy figure, or with no macro panel behind it, is not
// written. `foods.carbs_g` and its neighbours are `not null`, so the only way
// to store such a product is to fabricate zeros — and "0 g protein" against a
// tin of tuna is worse than an honest "we do not know this one". The client
// offers Describe instead, which is a path that produces a real number.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import { gtin14 } from '../_shared/barcode.ts'
import { type CatalogueProduct, cacheProduct, lookupBarcode } from '../_shared/catalogue.ts'
import { iconFor } from '../_shared/icon-match.ts'

/** Open Food Facts asks that clients identify themselves. */
const USER_AGENT = 'RiceCal/1.0 (https://ricecal.app; barcode lookup)'

const OFF_TIMEOUT_MS = 6000

/**
 * The fields worth asking for, rather than the whole product document.
 *
 * An OFF product carries several hundred keys — every image, every revision,
 * every ingredient-analysis tag. Naming the twelve that matter keeps the
 * response a few kilobytes instead of a few hundred, which on a cold start over
 * a Malaysian mobile connection is the difference between a scan that feels
 * instant and one that does not.
 */
const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'countries_tags',
  'nutriments',
  'unique_scans_n',
].join(',')

type Json = Record<string, unknown>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * One nutrient out of OFF's `nutriments` object, per 100 g.
 *
 * OFF stores minerals in GRAMS where this app stores milligrams, and that is
 * the 1000x error that puts 400 g of salt in a biscuit. The `_100g` suffix is
 * the normalized value whatever the label was declared per, which is why it is
 * preferred over `_serving`.
 */
function per100g(nutriments: Json, key: string): number | null {
  const value = nutriments[`${key}_100g`] ?? nutriments[key]
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * What one serving of this product is, in grams.
 *
 * OFF's `serving_quantity` is a number of grams or millilitres when it is
 * anything at all, and it is absent more often than not. Falling back to 100 g
 * is not a guess about the packet — it is the basis the nutriments are already
 * on, so the row is exactly as true as the panel it came from and the label
 * says "100 g" in so many words.
 */
function servingGrams(product: Json): { grams: number; label: string } {
  const raw = product.serving_quantity
  const grams = typeof raw === 'number' ? raw : Number(raw)
  const label = typeof product.serving_size === 'string' ? product.serving_size.trim() : ''

  if (Number.isFinite(grams) && grams >= 0.1 && grams <= 5000) {
    return { grams, label: (label || `${grams} g`).slice(0, 40) }
  }
  return { grams: 100, label: '100 g' }
}

function productName(product: Json): string | null {
  for (const key of ['product_name', 'product_name_en']) {
    const value = product[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120)
  }
  return null
}

/** ISO-3166 alpha-2 out of OFF's `en:malaysia` tags, for the locale prior. */
function _countries(product: Json): string[] {
  const tags = Array.isArray(product.countries_tags) ? product.countries_tags : []
  const map: Record<string, string> = {
    malaysia: 'my',
    singapore: 'sg',
    thailand: 'th',
    indonesia: 'id',
    philippines: 'ph',
    vietnam: 'vn',
    brunei: 'bn',
    cambodia: 'kh',
    laos: 'la',
    myanmar: 'mm',
    china: 'cn',
    'hong-kong': 'hk',
    taiwan: 'tw',
    japan: 'jp',
    'south-korea': 'kr',
    india: 'in',
    australia: 'au',
    'united-states': 'us',
    'united-kingdom': 'gb',
  }
  const out = new Set<string>()
  for (const tag of tags) {
    if (typeof tag !== 'string') continue
    const code = map[tag.replace(/^[a-z]{2}:/, '')]
    if (code) out.add(code)
  }
  return [...out]
}

/** A kebab-case handle, unique by construction because it carries the code. */
function _slugFor(name: string, gtin: string): string {
  const stem = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '')
  return `${stem || 'product'}-${gtin.replace(/^0+/, '') || gtin}`
}

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

  let body: { code?: string }
  try {
    const parsed = await req.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return json({ ok: false, error: 'body must be a JSON object' }, 400)
    }
    body = parsed as { code?: string }
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  const gtin = gtin14(body.code ?? '')
  if (!gtin) return json({ ok: false, error: 'not a usable barcode' }, 400)

  // service_role, for the miss backlog and the scan throttle. It is the only
  // thing this function writes to Postgres now that the catalogue lives in D1.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // A per-account hourly rate limit, claimed BEFORE any lookup work. This path
  // spends no AI budget, so the meter never sees it, and without this a signed-
  // in caller could loop distinct codes to drive a live Open Food Facts fetch
  // and a miss-backlog write on every one. Claimed atomically in Postgres (see
  // `claim_barcode_scan`); a database blip lets the scan through uncounted,
  // which is the cheap direction to be wrong in for a lookup, not a purchase.
  {
    const { data: claim, error: claimError } = await admin
      .rpc('claim_barcode_scan', { p_user: auth.user.id })
      .maybeSingle<{ allowed: boolean; used: number; hourly_limit: number }>()
    if (!claimError && claim && !claim.allowed) {
      return json({ ok: false, error: 'too many scans, try again shortly' }, 429)
    }
  }

  // THE CATALOGUE IS IN D1 NOW, so this is where the lookup goes. It answers
  // for 3.2 million packaged products — ten times what Postgres could hold —
  // which is the whole reason for the move, and it means the live Open Food
  // Facts call below is now genuinely the exception rather than the common
  // case for anything outside Southeast Asia.
  {
    const hit = await lookupBarcode(gtin)
    if (hit) return json({ ok: true, food: asFood(hit) })
  }

  let product: Json | null = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS)
    // The unpadded code: OFF keys products by what is printed on the packet,
    // and a zero-padded GTIN-14 is not a key it knows.
    const code = gtin.replace(/^0+/, '')
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
      { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal },
    )
    clearTimeout(timer)
    if (res.ok) {
      const payload = (await res.json()) as Json
      if (payload.status === 1 && typeof payload.product === 'object') {
        product = payload.product as Json
      }
    }
  } catch {
    // A timeout, a DNS failure, an OFF outage. Indistinguishable from "they do
    // not have it" as far as what the client can do next, and recorded as a
    // miss below either way.
  }

  const nutriments = (product?.nutriments ?? {}) as Json
  const name = product ? productName(product) : null
  const kcal = product ? per100g(nutriments, 'energy-kcal') : null
  const carbs = product ? per100g(nutriments, 'carbohydrates') : null
  const protein = product ? per100g(nutriments, 'proteins') : null
  const fat = product ? per100g(nutriments, 'fat') : null

  const usable =
    product !== null &&
    name !== null &&
    kcal !== null &&
    kcal >= 0 &&
    kcal <= 900 &&
    carbs !== null &&
    protein !== null &&
    fat !== null &&
    carbs >= 0 &&
    protein >= 0 &&
    fat >= 0

  // The backlog. `found` is what separates "the catalogue was thin and the live
  // lookup covered for it" from "nobody anywhere knows this packet", and only
  // the second one is a job for a human.
  await admin.from('barcode_misses').insert({ code: gtin, found: usable })

  if (!usable) return json({ ok: true, food: null })

  const { grams, label } = servingGrams(product as Json)
  const scale = grams / 100
  const brand =
    typeof product?.brands === 'string' ? product.brands.split(',')[0].trim() || null : null

  const fetched = {
    barcode: Number(gtin),
    name: name as string,
    brand,
    kcal: Math.round((kcal as number) * scale),
    carbs_g: Math.round((carbs as number) * scale * 10) / 10,
    protein_g: Math.round((protein as number) * scale * 10) / 10,
    fat_g: Math.round((fat as number) * scale * 10) / 10,
    serving_g: grams,
  }

  // Remembered in the catalogue so the next person to scan this packet gets the
  // index probe. Not awaited for correctness — the answer is already in hand,
  // and a failure to cache must never fail a scan.
  await cacheProduct(fetched)

  return json({ ok: true, food: asFood(fetched, label) })
})

/**
 * A catalogue product in the shape the client expects.
 *
 * The client was written against `food_details` rows and should not have to
 * learn a second shape because the data moved. The portion is the row's own
 * basis: these products are stored per the serving their numbers are quoted
 * per, so the factor is 1 by definition.
 *
 * THE DRAWING IS DERIVED, NOT STORED
 *
 * `product` has no icon columns, and giving 3.2 million rows a pair of them to
 * hold a value computable from the name they already carry would be a migration
 * and a bulk write for nothing. The searchable half of the catalogue stores its
 * icon because a person authored it; a packet's is read off its own name here,
 * so a product cached last year draws the same as one fetched a moment ago and
 * nothing has to be backfilled.
 */
function asFood(p: CatalogueProduct, label?: string) {
  const icon = iconFor(p.name)
  return {
    id: null,
    name: p.name,
    brand: p.brand,
    icon_set: icon?.set ?? null,
    icon_name: icon?.name ?? null,
    place: 'packaged',
    kcal: p.kcal,
    carbs_g: p.carbs_g,
    protein_g: p.protein_g,
    fat_g: p.fat_g,
    fibre_g: null,
    sugar_g: null,
    sodium_mg: null,
    verified: false,
    barcode: String(p.barcode).padStart(14, '0'),
    serving_g: p.serving_g,
    serving_label: label ?? (p.serving_g ? `${p.serving_g} g` : '1 serving'),
    servings: [
      {
        slug: 'base',
        label: label ?? (p.serving_g ? `${p.serving_g} g` : '1 serving'),
        factor: 1,
        grams: p.serving_g,
        default: true,
      },
    ],
    source_id: 'open_food_facts',
    source_attribution: 'Data from Open Food Facts, available under the Open Database License',
  }
}

function _round1(value: number | null, scale: number): number | null {
  return value === null ? null : Math.round(value * scale * 10) / 10
}

/** Grams to milligrams, and null stays null: a missing figure is not a zero. */
function _roundMg(value: number | null, scale: number): number | null {
  return value === null ? null : Math.round(value * 1000 * scale)
}
