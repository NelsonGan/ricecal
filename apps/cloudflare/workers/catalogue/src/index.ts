/**
 * The catalogue, in front of D1.
 *
 * A Worker rather than a direct connection, because a D1 binding only exists
 * inside one and the app's edge functions are Deno on Supabase.
 *
 * Three callers, and `ROUTES` below is the policy for which routes each reaches.
 *
 * A shared secret in `Authorization` is our own server, which reaches
 * everything including the write. Compared in constant time.
 *
 * A user's Supabase JWT is the app, which reaches the two read routes and
 * nothing else. See `auth.ts`: the project signs with ES256, so this Worker
 * verifies against a public key and holds nothing that could forge one.
 *
 * No credential at all is the marketing site, on `/public/*`. A token shipped
 * inside a web page is readable by everybody served that page, so what stands in
 * for it is a smaller answer and a per-IP cap.
 *
 * So reading the catalogue no longer costs an account; it costs an account at
 * scale. What holds `/public/search` in shape is the cache, the per-IP limit and
 * the fields `publicShape` refuses to return. The only public-side mutation is
 * the Worker's own aggregate search-count increment.
 */

import { verifyUser } from './auth.ts'
import { ftsQuery, gtin14, normalize, trigramQuery } from './text.ts'

export interface Env {
  DB: D1Database
  /** Shared with the Supabase edge functions. Set with `wrangler secret put`. */
  CATALOGUE_TOKEN: string
  /** The project whose JWTs this Worker will accept. A public URL, not a secret. */
  SUPABASE_URL: string
  /** Per-user request cap, so an account is not a licence to scrape. */
  CATALOGUE_RL: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
  /** Per-IP cap for `/public/*`, which has no account to key on. */
  PUBLIC_RL: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
  /**
   * The marketing site's server, exempting it from the per-IP cap. A real
   * secret, unlike the browser's: it lives in Vercel's environment and is read
   * by a server component. Set with `wrangler secret put WEB_CATALOGUE_TOKEN`.
   *
   * It exists because of how rendering works rather than because anybody
   * deserves more quota: a dish page nobody has visited is rendered on demand by
   * a Vercel function, and those come from a handful of egress addresses, so
   * keyed on IP they would share one bucket and refuse each other.
   *
   * The identical string is used in Vercel, so the name reads correctly from
   * either side. Not `CATALOGUE_WEB_TOKEN`, which would sort beside
   * `CATALOGUE_TOKEN` in `wrangler secret list` despite permitting far less.
   */
  WEB_CATALOGUE_TOKEN: string
}

/**
 * Who may reach what.
 *
 * `user` means a signed-in person's token is enough; the shared secret works
 * everywhere. Least privilege: the app calls the two read routes, so those are
 * the only two it may call. `/barcode` is a read too and is deliberately absent,
 * because the app reaches a packet through the `barcode` edge function, which
 * also falls back to Open Food Facts and writes what it finds.
 *
 * `public` means no credential is asked for. Separate paths rather than
 * relaxations of `/search` and `/food`, so the two pairs cannot drift into each
 * other: the public ones have their own cache namespace, rate limit, reply shape
 * and path prefix for a WAF rule to name.
 *
 * `/public/food` takes a slug where `/food` takes the internal `id`, and
 * `publicShape` never hands out an id, so a public caller cannot name a row the
 * app's way.
 */
const ROUTES: Record<string, 'public' | 'user' | 'service'> = {
  '/search': 'user',
  '/food': 'user',
  '/public/search': 'public',
  '/public/search-count': 'public',
  '/public/food': 'public',
  '/barcode': 'service',
  '/product': 'service',
  '/health': 'service',
}

/** Reciprocal Rank Fusion weights, carried over from the Postgres search. */
const WEIGHTS = { exactName: 3.0, exactAlias: 2.5, fts: 1.0, trgm: 0.8 } as const
const K = 50

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Constant-time compare, so the token cannot be guessed a byte at a time. */
function tokenMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

type FoodRow = Record<string, unknown> & { id: string }

/**
 * How many `?` D1 will accept in one statement. A platform limit rather than a
 * tuning knob, named here because the candidate list is bound one id per
 * parameter, so it becomes a cap on how wide a search may look. Over it, D1
 * errors rather than truncating.
 */
const D1_MAX_BOUND_PARAMS = 100

/**
 * The longest search string worth honouring. A real dish name is well under it;
 * a 20 KB string is a way to make one request cost what a thousand should.
 * `ftsQuery` ORs every term and `trigramQuery` ORs one arm per character, so an
 * unbounded query expands into an FTS5 MATCH with thousands of clauses, each an
 * index scan D1 bills by rows read, and distinct long strings miss the cache
 * every time.
 */
const MAX_QUERY_CHARS = 100

/** One dish with its portions and aliases, shaped like the old `food_details`. */
async function foodDetails(env: Env, ids: string[]): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map()
  const marks = ids.map(() => '?').join(',')

  const [foods, servings] = await env.DB.batch([
    env.DB.prepare(`select * from food where id in (${marks})`).bind(...ids),
    env.DB.prepare(
      `select food_id, slug, label, factor, grams, is_default, position
         from food_serving where food_id in (${marks}) order by position, label`,
    ).bind(...ids),
  ])

  const byId = new Map<string, FoodRow>()
  for (const row of foods.results as FoodRow[]) byId.set(row.id, { ...row, servings: [] })
  for (const s of servings.results as Record<string, unknown>[]) {
    const food = byId.get(s.food_id as string)
    if (!food) continue
    // Shaped rather than passed through, which is why the function is called
    // `foodDetails`. The client maps this with the same `toFood` it used against
    // the Postgres view, which reads `id`, `label` and `factor` off each portion.
    // D1 has no serving id, since the row is keyed (food_id, slug), so the id is
    // minted here once rather than by two callers differently.
    //
    // Getting it wrong is silent: `toServings` drops any entry without a string
    // `id`, so the picker rendered nothing at all rather than erroring.
    ;(food.servings as unknown[]).push({
      id: `${s.food_id}:${s.slug}`,
      label: s.label,
      factor: Number(s.factor ?? 1),
      grams: s.grams,
      is_default: s.is_default === 1,
      position: s.position,
      slug: s.slug,
    })
  }

  // The three fields the view exposed ABOUT the default portion, which the
  // client reads off the food rather than hunting for in the list.
  for (const food of byId.values()) {
    const servings = food.servings as Array<Record<string, unknown>>
    const base = servings.find((s) => s.is_default) ?? servings[0]
    food.default_serving_id = base?.id ?? null
    food.serving_label = base?.label ?? null
    food.serving_g = base?.grams ?? null
    // SQLite has no boolean. Left as 0/1 this reaches `Food.verified` as a
    // number, and `0` is falsy so nothing looked wrong until something typed it.
    food.verified = food.verified === 1
  }
  return byId
}

async function search(env: Env, q: string, limit: number): Promise<unknown[]> {
  // Bound the input before it becomes an FTS5 MATCH expression: normalize, both
  // FTS arms and the trigram split all scale with its length. See
  // MAX_QUERY_CHARS.
  const bounded = q.length > MAX_QUERY_CHARS ? q.slice(0, MAX_QUERY_CHARS) : q
  const qn = normalize(bounded)
  if (!qn) return []

  const match = ftsQuery(bounded)
  const trgm = trigramQuery(qn)

  // One round trip for all four arms. D1 charges per query and each is an index
  // scan, so this is the difference between four sequential hops and one.
  //
  // Both exact arms match a stored normalized column rather than `lower(name)`,
  // which was two bugs in one expression: no index can serve it, so each arm
  // scanned its whole table on every search, and `lower()` is not the folding
  // the query went through, so "Chicken Rice (Nasi Ayam)" could not be reached
  // by typing its own words.
  const statements = [
    env.DB.prepare('select id from food where name_norm = ? limit 200').bind(qn),
    env.DB.prepare(
      'select distinct food_id as id from food_alias where alias_norm = ? limit 200',
    ).bind(qn),
    match
      ? env.DB.prepare(
          `select m.food_id as id from food_fts f join fts_map m on m.rowid = f.rowid
            where food_fts match ? order by bm25(food_fts, 10.0, 2.0, 5.0) limit 200`,
        ).bind(match)
      : null,
    trgm
      ? env.DB.prepare(
          `select m.food_id as id from food_trgm t join fts_map m on m.rowid = t.rowid
            where food_trgm match ? order by bm25(food_trgm) limit 200`,
        ).bind(trgm)
      : null,
  ]
  const live = statements.filter((s): s is D1PreparedStatement => s !== null)
  const results = await env.DB.batch(live)

  const arms: Array<[number, string[]]> = []
  let cursor = 0
  arms.push([WEIGHTS.exactName, (results[cursor++].results as { id: string }[]).map((r) => r.id)])
  arms.push([WEIGHTS.exactAlias, (results[cursor++].results as { id: string }[]).map((r) => r.id)])
  if (match) {
    arms.push([WEIGHTS.fts, (results[cursor++].results as { id: string }[]).map((r) => r.id)])
  }
  if (trgm) {
    arms.push([WEIGHTS.trgm, (results[cursor++].results as { id: string }[]).map((r) => r.id)])
  }

  const fused = new Map<string, number>()
  for (const [weight, ids] of arms) {
    ids.forEach((id, i) => {
      fused.set(id, (fused.get(id) ?? 0) + weight / (K + i + 1))
    })
  }
  if (fused.size === 0) return []

  // Over-fetch four to one so the prior below has room to re-rank, but never
  // past D1's ceiling on bound parameters.
  //
  // `foodDetails` binds one `?` per id, and D1 rejects more than 100. Unbounded,
  // this broke at exactly `limit` 26 while the app asks for 50, so every search
  // returned "query failed" and the panel drew "No dish by that name". At limit
  // 1 and 3 it looked perfect.
  const top = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(limit * 4, D1_MAX_BOUND_PARAMS))
  const details = await foodDetails(
    env,
    top.map(([id]) => id),
  )

  // The bounded prior, unchanged from Postgres: locale, popularity, verified,
  // capped so it can settle a near-tie and never outrank relevance.
  const scored = top.flatMap(([id, score]) => {
    const f = details.get(id)
    if (!f) return []
    const prior =
      1 +
      (f.is_local ? 0.2 : 0) +
      Math.min(0.1, 0.025 * Math.log1p(Math.max(Number(f.popularity ?? 0), 0))) +
      (f.verified ? 0.05 : 0)
    return [{ food: f, score: score * prior, priority: Number(f.source_priority ?? 0) }]
  })

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.priority - a.priority ||
      String(a.food.name).length - String(b.food.name).length ||
      String(a.food.name).localeCompare(String(b.food.name)),
  )
  return scored.slice(0, limit).map((s) => s.food)
}

/**
 * Where the preview search may be called from. Not a security boundary:
 * `Origin` is set by the browser, so it is honest about a page and says nothing
 * about curl. What it does is stop other people's pages spending our rate limit
 * through their visitors' browsers.
 */
const PUBLIC_ORIGINS = ['https://www.ricecal.app', 'https://ricecal.app']

/** A Vercel preview of `ricecal-web`, whose hostname is generated per branch. */
const PREVIEW_ORIGIN = /^https:\/\/ricecal-web-[a-z0-9-]+\.vercel\.app$/

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (PUBLIC_ORIGINS.includes(origin)) return origin
  if (PREVIEW_ORIGIN.test(origin)) return origin
  // `next dev`, on the machine of whoever is building the page.
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin
  return null
}

/**
 * How long a public answer stays good. The dish rows move when an import runs,
 * days apart, so an hour is conservative. It is also the biggest lever on cost:
 * D1 bills rows read, one fused search reads about 1,500 of them, and a
 * marketing page concentrates its queries on a handful of famous dishes.
 */
const PUBLIC_CACHE_SECONDS = 3600

/** Ten, not two hundred. Walking the catalogue ten rows at a time is the point. */
const PUBLIC_MAX_LIMIT = 10

/**
 * The part of a row a stranger gets, and every field withheld is withheld for a
 * reason.
 *
 * `id` is the app's key and the only thing `/food` accepts, so publishing it
 * hands out a second way to read rows one at a time, by primary key and never
 * near the fused search. `slug` names the same dish and is what the website's
 * URLs are built from.
 *
 * `popularity`, `source_priority` and `is_local` are the ranking rather than the
 * food, and together they would let somebody reproduce the ordering without
 * reproducing the catalogue. `servings`, at 75,000 rows, is the other piece of
 * curation, and a preview needs one portion rather than all of them.
 *
 * `source_name` and `source_attribution` stay, and they are required rather than
 * chosen: half these rows come from Open Food Facts, whose licence is
 * attribution-bearing.
 */
function publicShape(food: FoodRow): Record<string, unknown> {
  return {
    slug: food.slug,
    name: food.name,
    brand: food.brand ?? null,
    place: food.place,
    kcal: food.kcal,
    carbs_g: food.carbs_g,
    protein_g: food.protein_g,
    fat_g: food.fat_g,
    fibre_g: food.fibre_g ?? null,
    sugar_g: food.sugar_g ?? null,
    sodium_mg: food.sodium_mg ?? null,
    // Already a boolean by here — `foodDetails` coerces the 0/1 SQLite stores.
    verified: food.verified === true,
    icon_set: food.icon_set ?? null,
    icon_name: food.icon_name ?? null,
    serving_label: food.serving_label ?? null,
    serving_g: food.serving_g ?? null,
    source_name: food.source_name ?? null,
    source_attribution: food.source_attribution ?? null,
  }
}

/**
 * The marketing site's search: anonymous, cached, and deliberately small.
 *
 * Cache, then limiter, then database, rather than the obvious limiter first. A
 * hit costs no D1 rows, so charging an allowance for one would mean twenty a
 * minute had to cover every repeat, and a marketing page repeats enormously.
 * Volume of repeats is a job for the WAF rule in front.
 *
 * Keyed on the normalized query, so `Nasi Lemak` and `nasi  lemak` are one
 * entry. Stored without the CORS header, which is added on the way out, so one
 * visitor's allowed origin is never served from cache to another's browser.
 */
function corsFor(request: Request): Record<string, string> {
  return {
    // A disallowed or absent origin still gets a header, just not a matching
    // one: the browser refuses it, and curl was never going to care either way.
    'access-control-allow-origin': allowedOrigin(request) ?? PUBLIC_ORIGINS[0],
    vary: 'Origin',
  }
}

type SearchCountRow = { total: number }

/**
 * Increment and read in one D1 batch so concurrent searches cannot lose a
 * count and the number returned to this visitor includes their own search.
 */
async function incrementSearchCount(env: Env): Promise<number> {
  const results = await env.DB.batch<SearchCountRow>([
    env.DB.prepare(
      `insert into site_search_count (id, total, updated_at)
       values (1, 1, current_timestamp)
       on conflict (id) do update set
         total = total + 1,
         updated_at = current_timestamp`,
    ),
    env.DB.prepare('select total from site_search_count where id = 1 limit 1'),
  ])
  const row = results[1]?.results[0]
  if (!row) throw new Error('D1 returned no search-count row')
  return Number(row.total)
}

/** Counting supports search; it never gets to break search. */
async function tryIncrementSearchCount(env: Env): Promise<number | null> {
  try {
    return await incrementSearchCount(env)
  } catch (error) {
    console.error('catalogue worker search count increment', error)
    return null
  }
}

async function publicSearchCount(request: Request, env: Env): Promise<Response> {
  const cors = corsFor(request)

  try {
    const row = await env.DB.prepare(
      'select total from site_search_count where id = 1 limit 1',
    ).first<SearchCountRow>()
    return new Response(JSON.stringify({ ok: true, search_count: Number(row?.total ?? 0) }), {
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error('catalogue worker search count read', error)
    return new Response(JSON.stringify({ ok: false, error: 'query failed' }), {
      status: 503,
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  }
}

function withSearchCount<T extends Record<string, unknown>>(
  body: T,
  searchCount: number | null,
): T & { search_count?: number } {
  return searchCount === null ? body : { ...body, search_count: searchCount }
}

/**
 * Whether this caller may have another one, and who is charged for it. Our own
 * server is not charged; see `WEB_CATALOGUE_TOKEN` for why. Everybody else is
 * charged by IP.
 */
async function withinLimit(request: Request, env: Env): Promise<boolean> {
  const presented = request.headers.get('x-ricecal-web') ?? ''
  if (env.WEB_CATALOGUE_TOKEN && tokenMatches(presented, env.WEB_CATALOGUE_TOKEN)) return true

  /*
   * `cf-connecting-ip` rather than `x-forwarded-for`: Cloudflare sets the first
   * from the connection and a caller cannot forge it, where the second is
   * caller-supplied and would make this limit opt-out.
   *
   * The fallback shares one bucket among every request arriving without it,
   * which is the safe direction to fail.
   */
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  const { success } = await env.PUBLIC_RL.limit({ key: ip || 'no-ip' })
  return success
}

async function publicSearch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const cors = corsFor(request)
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    })

  // Bounded here as well as inside `search`, so the length check and the cache
  // key use the same capped string the query will. See MAX_QUERY_CHARS.
  const raw = url.searchParams.get('q') ?? ''
  const qn = normalize(raw.length > MAX_QUERY_CHARS ? raw.slice(0, MAX_QUERY_CHARS) : raw)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? PUBLIC_MAX_LIMIT), 1),
    PUBLIC_MAX_LIMIT,
  )

  // Two characters, because one is the first keystroke of a search rather than
  // one, and answering it runs four index scans for a result nobody reads.
  // Answered rather than refused, so the site need not special-case an error
  // while somebody is still typing.
  if (qn.length < 2) return reply({ ok: true, foods: [] })

  const cacheKey = new Request(
    `https://catalogue.ricecal.app/public/search?q=${encodeURIComponent(qn)}&limit=${limit}`,
  )
  const cache = caches.default

  const cached = await cache.match(cacheKey)
  if (cached) {
    const body = (await cached.json()) as { ok: true; foods: Record<string, unknown>[] }
    const searchCount = await tryIncrementSearchCount(env)
    return new Response(JSON.stringify(withSearchCount(body, searchCount)), {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  }

  if (!(await withinLimit(request, env))) return reply({ ok: false, error: 'slow down' }, 429)

  try {
    const foods = (await search(env, qn, limit)) as FoodRow[]
    const body = { ok: true, foods: foods.map(publicShape) }
    const cachedBody = JSON.stringify(body)
    const searchCount = await tryIncrementSearchCount(env)

    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(cachedBody, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${PUBLIC_CACHE_SECONDS}`,
          },
        }),
      ),
    )

    return new Response(JSON.stringify(withSearchCount(body, searchCount)), {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    // Caught here rather than by the handler's own catch, so that the 500 keeps
    // its CORS header and the page sees a failed search instead of a browser
    // console message about a cross-origin refusal.
    console.error('catalogue worker public', error)
    return reply({ ok: false, error: 'query failed' }, 500)
  }
}

/**
 * One dish, by the name its URL is built from, and the cheaper half of the
 * marketing site: `food_slug_idx` is unique, so this is an index probe rather
 * than the four fused arms `/public/search` runs.
 *
 * The site prerenders only the first few thousand dishes and renders the rest on
 * demand, so without this the long tail would have to be found by searching for
 * its own name and hoping the right row came back first.
 */
async function publicFood(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const cors = corsFor(request)
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    })

  const slug = (url.searchParams.get('slug') ?? '').trim().toLowerCase()
  // The shape every slug in the catalogue has. Anything else cannot match a row,
  // so it is turned away before it reaches the database rather than after.
  if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/.test(slug)) {
    return reply({ ok: false, error: 'not a usable slug' }, 400)
  }

  const cacheKey = new Request(`https://catalogue.ricecal.app/public/food?slug=${slug}`)
  const cache = caches.default

  const cached = await cache.match(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': `public, max-age=${PUBLIC_CACHE_SECONDS}`,
      },
    })
  }

  if (!(await withinLimit(request, env))) return reply({ ok: false, error: 'slow down' }, 429)

  try {
    const row = await env.DB.prepare('select id from food where slug = ?')
      .bind(slug)
      .first<{ id: string }>()

    // Through `foodDetails` rather than a wider select, so a dish read here and
    // the same dish read by the app go through one function: it flattens the
    // default portion onto the row and turns SQLite's 0/1 into a boolean, both
    // of which `publicShape` expects.
    const found = row ? (await foodDetails(env, [row.id])).get(row.id) : undefined
    const body = JSON.stringify({ ok: true, food: found ? publicShape(found) : null })

    // A miss is cached too. A crawler that finds a dead slug tends to find it
    // repeatedly, and "this is not a dish" is as good an answer to keep as any.
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          headers: {
            'content-type': 'application/json',
            'cache-control': `public, max-age=${PUBLIC_CACHE_SECONDS}`,
          },
        }),
      ),
    )

    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'application/json',
        'cache-control': `public, max-age=${PUBLIC_CACHE_SECONDS}`,
      },
    })
  } catch (error) {
    console.error('catalogue worker public food', error)
    return reply({ ok: false, error: 'query failed' }, 500)
  }
}

/**
 * The public tier's front door: the parts all routes share, then the split.
 * Method and preflight are settled here because they are the same answer for
 * both, and getting them wrong only shows up in somebody else's browser console.
 */
function publicRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> | Response {
  const cors = corsFor(request)

  // A plain GET with no custom headers is not preflighted, so this is here for
  // the caller who adds one — which our own server does, carrying `WEB_CATALOGUE_TOKEN`.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'x-ricecal-web',
        'access-control-max-age': '86400',
      },
    })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'GET only' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  if (url.pathname === '/public/food') return publicFood(request, env, ctx, url)
  if (url.pathname === '/public/search-count') return publicSearchCount(request, env)
  return publicSearch(request, env, ctx, url)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const auth = request.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const url = new URL(request.url)

    const required = ROUTES[url.pathname]
    if (!required) return json({ ok: false, error: 'unknown path' }, 404)

    // Before the credentials, because this route asks for none. Everything the
    // public tier does differently is inside `publicSearch`, which leaves the
    // app's path below exactly as it was: the app's search is the critical path,
    // and a marketing feature must not change it by accident.
    if (required === 'public') return publicRoute(request, env, ctx, url)

    // The shared secret first, and checked against every request rather than
    // only service routes: our own server calls the read routes too, and should
    // not have to carry a user's token to do it.
    const isService = Boolean(env.CATALOGUE_TOKEN) && tokenMatches(token, env.CATALOGUE_TOKEN)

    if (!isService) {
      if (required === 'service') {
        // 404 rather than 403. A signed-in user has no business knowing that a
        // write route exists here, and "you are not allowed" is a map.
        return json({ ok: false, error: 'unknown path' }, 404)
      }

      const user = token ? await verifyUser(token, env.SUPABASE_URL) : null
      if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

      /**
       * Per user rather than per IP: an account is what it costs to read the
       * catalogue, a phone on mobile data shares an IP with a whole carrier, and
       * one on wifi changes IP by walking outside.
       *
       * Sized for typing rather than browsing: search fires once per keystroke on
       * a 140 ms debounce, so hunting for a dish spends ten or so in a burst.
       */
      const { success } = await env.CATALOGUE_RL.limit({ key: user.id })
      if (!success) return json({ ok: false, error: 'slow down' }, 429)
    }

    try {
      switch (url.pathname) {
        // The scanner's path, and the one that has to be fast: an exact lookup
        // on an INTEGER PRIMARY KEY, which in SQLite is the table itself.
        case '/barcode': {
          const code = gtin14(url.searchParams.get('code') ?? '')
          if (!code) return json({ ok: false, error: 'not a usable barcode' }, 400)

          const row = await env.DB.prepare('select * from product where barcode = ?')
            .bind(Number(code))
            .first()
          return json({ ok: true, product: row ?? null })
        }

        case '/search': {
          const q = url.searchParams.get('q') ?? ''
          const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)
          return json({ ok: true, foods: await search(env, q, limit) })
        }

        // One dish by id, for a screen that already knows which row it wants.
        case '/food': {
          const id = url.searchParams.get('id') ?? ''
          if (!id) return json({ ok: false, error: 'id is required' }, 400)
          const found = await foodDetails(env, [id])
          return json({ ok: true, food: found.get(id) ?? null })
        }

        // A product Open Food Facts had and the catalogue did not, written so
        // the second person to scan that packet gets the index probe.
        //
        // `insert or ignore`: two people scanning one new packet at once is a
        // race with one right answer. The catalogue is rebuilt from source data
        // anyway, so a row arriving this way is a cache entry rather than an
        // authority.
        case '/product': {
          if (request.method !== 'POST') {
            return json({ ok: false, error: 'POST only' }, 405)
          }
          const body = (await request.json()) as Record<string, unknown>
          const code = gtin14(String(body.barcode ?? ''))
          if (!code) return json({ ok: false, error: 'not a usable barcode' }, 400)
          if (!body.name || typeof body.kcal !== 'number') {
            return json({ ok: false, error: 'name and kcal are required' }, 400)
          }

          await env.DB.prepare(
            `insert or ignore into product
               (barcode, name, brand, kcal, carbs_g, protein_g, fat_g, serving_g)
             values (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              Number(code),
              String(body.name).slice(0, 120),
              body.brand ? String(body.brand).slice(0, 60) : null,
              Math.round(Number(body.kcal)),
              Number(body.carbs_g ?? 0),
              Number(body.protein_g ?? 0),
              Number(body.fat_g ?? 0),
              body.serving_g == null ? null : Number(body.serving_g),
            )
            .run()
          return json({ ok: true })
        }

        case '/health': {
          const row = await env.DB.prepare(
            `select (select count(*) from product) as products,
                    (select count(*) from food) as foods`,
          ).first()
          return json({ ok: true, ...row })
        }

        // Unreachable for an unknown path, which `ROUTES` has turned away. What
        // it catches is a route added to `ROUTES` and not to this switch.
        default:
          return json({ ok: false, error: 'unknown path' }, 404)
      }
    } catch (error) {
      console.error('catalogue worker', error)
      return json({ ok: false, error: 'query failed' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
