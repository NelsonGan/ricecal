/**
 * The catalogue, in front of D1.
 *
 * The food catalogue used to be four tables in the same Postgres as the diary,
 * which is what made every entry's calories a join and every catalogue reload a
 * risk to the diary. It lives here now: 3.2 million packaged products keyed by
 * barcode, and ~47,000 dishes with a full-text index over their names and
 * aliases.
 *
 * WHY A WORKER AND NOT A DIRECT CONNECTION
 *
 * A D1 binding only exists inside a Cloudflare Worker. The app's edge functions
 * are Deno on Supabase, so something has to stand between them, and it may as
 * well be the thing that owns the query: the search below is four arms fused by
 * rank, which is a paragraph of SQL nobody wants to write twice.
 *
 * WHAT PROTECTS IT
 *
 * A shared secret in `Authorization`, compared in constant time. This endpoint
 * is read-only and the catalogue is not secret — every row is visible to every
 * signed-in user of the app — so the token is here to stop it being used as
 * somebody else's free food API, not to protect the data. The comparison is
 * still constant-time, because a timing oracle on a bearer token is free to
 * avoid and embarrassing to leave in.
 */

import { ftsQuery, gtin14, normalize, trigramQuery } from './text.ts'

export interface Env {
  DB: D1Database
  /** Shared with the Supabase edge functions. Set with `wrangler secret put`. */
  CATALOGUE_TOKEN: string
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
 * How many `?` D1 will accept in one statement.
 *
 * Not a tuning knob — a hard limit of the platform, and the only reason it is
 * named here is that the candidate list is bound one id per parameter, so it
 * silently becomes a cap on how wide a search may look. Over it, D1 answers
 * with an error rather than a truncated result.
 */
const D1_MAX_BOUND_PARAMS = 100

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
    // SHAPED, not passed through, and this is the whole reason the function is
    // called `foodDetails`. The client maps what comes back with the same
    // `toFood` it used against the Postgres view, and that reads `id`, `label`
    // and `factor` off each portion. D1 has no serving id — the row is keyed
    // (food_id, slug), which is a better key and the wrong shape — so the id is
    // MINTED here, once, rather than left for two callers to invent differently.
    //
    // Getting this wrong is silent in exactly the way that hurts: `toServings`
    // drops any entry without a string `id`, so a food came back with an empty
    // portion list and the picker rendered nothing at all rather than erroring.
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
  const qn = normalize(q)
  if (!qn) return []

  const match = ftsQuery(q)
  const trgm = trigramQuery(qn)

  // One round trip for all four arms. D1 charges per query and each of these is
  // an index scan, so batching is the difference between four sequential hops
  // to the database and one.
  // Both exact arms match against a stored NORMALIZED column, not against
  // `lower(name)`. That was two bugs in one expression: no index can serve it,
  // so each arm scanned its whole table on every search (47,000 rows and 25,000
  // rows, before the two FTS arms had done anything at all), and `lower()` is
  // not the folding the query went through — so "Chicken Rice (Nasi Ayam)"
  // could not be reached by typing its own words, because the brackets survive
  // on one side and not on the other.
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
  // `foodDetails` binds one `?` per id, so the candidate list IS the parameter
  // count — and D1 rejects a statement with more than 100 of them. Unbounded,
  // this broke at exactly `limit` 26 (104 ids) and the app asks for 50: search
  // returned "query failed" for every query, which the edge function turned
  // into an empty result and the panel drew as "No dish by that name". Nothing
  // was wrong with the index, the data or the ranking. Tested at limit 1 and 3
  // it looked perfect.
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const auth = request.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!env.CATALOGUE_TOKEN || !tokenMatches(token, env.CATALOGUE_TOKEN)) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const url = new URL(request.url)

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

        // A product Open Food Facts had and the catalogue did not. Written so
        // the SECOND person to scan that packet gets the index probe instead of
        // a round trip to openfoodfacts.org — the same reason the old
        // `barcode` function wrote the row into Postgres.
        //
        // `insert or ignore`: two people scanning one new packet at the same
        // moment is a race with one right answer, and the loser has nothing to
        // do. The catalogue is rebuilt from source data anyway, so a row that
        // arrives this way is a cache entry, not an authority.
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

        default:
          return json({ ok: false, error: 'unknown path' }, 404)
      }
    } catch (error) {
      console.error('catalogue worker', error)
      return json({ ok: false, error: 'query failed' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
