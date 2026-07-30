// The three model calls the scan cascade makes, and their mocks.
//
// Every function here has the same contract: return a parsed, shape-checked
// value or throw. The cascade in index.ts treats any throw as "this tier
// failed, move down" — no model error can surface to the client, because the
// tier below every model call is one that needs no model.
//
// MOCKING
//
// Mock mode is active when MOCK_AI=true, or when no OPENROUTER_API_KEY is set
// at all — so a fresh local stack scans out of the box, and production (which
// has the key) can never fall into the mock silently. A request may steer the
// mock through `body.mock`, which is only read in mock mode; it exists so a
// test can force each tier of the cascade in turn.

export type Scene = 'single' | 'composite' | 'packaged' | 'unclear'

export type VisionItem = {
  /** The model's specific name for the plate — what display_label carries. */
  name: string
  specific_query: string
  generic_query: string
  components: string[]
  serving_hint: string | null
  kcal_low: number
  kcal_high: number
  confidence: number
}

export type Vision = {
  scene: Scene
  items: VisionItem[]
}

export type Nutrition = {
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  fibre_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
}

export type MockSteer = {
  vision?: Vision
  /** Candidate index the pick call "chooses", or 'none'. */
  pick?: number | 'none'
  nutrition?: Nutrition | 'invalid'
  archetype?: string
  /** 'vision' fails the vision call; 'all' fails every model call. */
  fail?: 'vision' | 'all' | 'nutrition'
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Qwen vision model: supports image input and JSON output. Overridable because
// slugs shift as OpenRouter renames deployments.
const DEFAULT_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'qwen/qwen3.7-flash'
const CALL_TIMEOUT_MS = 25_000

export function mockActive(): boolean {
  if (Deno.env.get('MOCK_AI') === 'true') return true
  return !Deno.env.get('OPENROUTER_API_KEY')
}

/** One OpenRouter chat call returning parsed JSON. Throws on anything else. */
async function chatJSON(messages: unknown[], maxTokens = 1200): Promise<unknown> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // OpenRouter app attribution: names the app on openrouter.ai rankings
      // and in the activity dashboard.
      'HTTP-Referer': 'https://ricecal.app',
      'X-Title': 'RiceCal',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      // Off, not merely low. qwen3.7-flash reasons by default and burned
      // 20-30s per call thinking about JSON echoes; three sequential calls
      // put a scan past the iOS client's 60s request timeout, so the app
      // reported failure while the entries landed anyway. Models without a
      // reasoning mode ignore this field.
      reasoning: { enabled: false },
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
  const body = await res.json()
  const text: string = body?.choices?.[0]?.message?.content ?? ''
  // Some models fence JSON in markdown despite response_format.
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  return JSON.parse(clean)
}

const clampNumber = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

function shapeVision(raw: unknown): Vision {
  const o = (raw ?? {}) as Record<string, unknown>
  const scene: Scene = ['single', 'composite', 'packaged', 'unclear'].includes(o.scene as string)
    ? (o.scene as Scene)
    : 'unclear'
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 6).flatMap((it) => {
    const i = (it ?? {}) as Record<string, unknown>
    const name = String(i.name ?? '').trim()
    if (!name) return []
    const low = clampNumber(i.kcal_low, 0, 10000, 0)
    return [
      {
        name: name.slice(0, 120),
        specific_query: String(i.specific_query ?? name).trim(),
        generic_query: String(i.generic_query ?? '').trim(),
        components: (Array.isArray(i.components) ? i.components : [])
          .map((c) => String(c).trim())
          .filter(Boolean)
          .slice(0, 8),
        serving_hint: i.serving_hint ? String(i.serving_hint).slice(0, 80) : null,
        kcal_low: low,
        kcal_high: clampNumber(i.kcal_high, low, 10000, low),
        confidence: clampNumber(i.confidence, 0, 1, 0.5),
      } satisfies VisionItem,
    ]
  })
  if (!items.length) throw new Error('vision returned no items')
  return { scene, items }
}

/**
 * The vision call. Deliberately returns queries and a kcal RANGE, never
 * per-nutrient values — identity comes from the model, numbers come from the
 * catalogue, and tier 4 is the only place model numbers are ever accepted.
 */
export async function analysePhoto(
  photoBase64: string | null,
  mock: MockSteer | undefined,
): Promise<Vision> {
  if (mockActive()) {
    if (mock?.fail === 'vision' || mock?.fail === 'all') throw new Error('mocked vision failure')
    if (mock?.vision) return shapeVision(mock.vision)
    return shapeVision({
      scene: 'single',
      items: [
        {
          name: 'Nasi lemak with fried chicken',
          specific_query: 'nasi lemak ayam goreng',
          generic_query: 'nasi lemak',
          components: ['coconut rice', 'fried chicken', 'sambal', 'boiled egg'],
          serving_hint: '1 plate',
          kcal_low: 550,
          kcal_high: 780,
          confidence: 0.85,
        },
      ],
    })
  }

  if (!photoBase64) throw new Error('no photo to analyse')

  const raw = await chatJSON([
    {
      role: 'system',
      content:
        'You identify food in photos for a Malaysian calorie-tracking app. ' +
        'Respond with JSON only, matching: {"scene": "single|composite|packaged|unclear", ' +
        '"items": [{"name": string, "specific_query": string, "generic_query": string, ' +
        '"components": string[], "serving_hint": string|null, "kcal_low": number, ' +
        '"kcal_high": number, "confidence": number}]}. ' +
        'One item per distinct dish or drink (max 6). "specific_query" is the local dish name ' +
        'as eaten ("char kuey teow"), "generic_query" a broader fallback ("fried noodles"). ' +
        '"components" lists visible ingredients only for composite plates. kcal_low/high bound ' +
        'the calories of the portion actually visible. confidence is 0-1 for the identification. ' +
        'Do NOT return protein/carb/fat numbers.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What food is in this photo?' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
      ],
    },
  ])
  return shapeVision(raw)
}

export type Candidate = {
  id: string
  name: string
  brand: string | null
  kcal: number
  serving_label: string | null
}

/**
 * The tier-1 verifier: given the top search hits, which — if any — IS the
 * photographed dish? Returns an index into `candidates`, or null for "none".
 * Zero candidates never reaches here; the caller folds that into the same
 * "no match" outcome.
 */
export async function pickCandidate(
  item: VisionItem,
  candidates: Candidate[],
  mock: MockSteer | undefined,
): Promise<number | null> {
  if (mockActive()) {
    if (mock?.fail === 'all') throw new Error('mocked pick failure')
    if (mock?.pick === 'none') return null
    if (typeof mock?.pick === 'number') return mock.pick < candidates.length ? mock.pick : null
    // Default mock: prefer the candidate whose kcal sits inside the band,
    // else the first one — deterministic, and exercises the same downstream
    // paths a real pick would.
    const inBand = candidates.findIndex(
      (c) => c.kcal >= item.kcal_low * 0.75 && c.kcal <= item.kcal_high * 1.25,
    )
    return inBand >= 0 ? inBand : 0
  }

  const raw = await chatJSON(
    [
      {
        role: 'system',
        content:
          'You match a described dish to a food catalogue. Respond with JSON only: ' +
          '{"choice": number|null}. `choice` is the 0-based index of the entry that IS the ' +
          'described dish, or null if none of them is. Prefer null over a near-miss: a ' +
          'different dish with similar ingredients is NOT a match.',
      },
      {
        role: 'user',
        content:
          `Dish seen in photo: ${item.name} (about ${item.kcal_low}-${item.kcal_high} kcal, ` +
          `serving: ${item.serving_hint ?? 'unknown'})\n\nCatalogue entries:\n` +
          candidates
            .map(
              (c, i) =>
                `${i}. ${c.name}${c.brand ? ` (${c.brand})` : ''} — ${c.kcal} kcal per ${c.serving_label ?? 'serving'}`,
            )
            .join('\n'),
      },
    ],
    200,
  )
  const choice = (raw as Record<string, unknown>)?.choice
  if (choice === null || choice === undefined) return null
  const idx = Number(choice)
  return Number.isInteger(idx) && idx >= 0 && idx < candidates.length ? idx : null
}

function shapeNutrition(raw: unknown): Nutrition {
  const o = (raw ?? {}) as Record<string, unknown>
  const opt = (v: unknown, hi: number): number | null => {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : null
  }
  return {
    kcal: Math.round(clampNumber(o.kcal, 0, 10000, 0)),
    carbs_g: clampNumber(o.carbs_g, 0, 9999, 0),
    protein_g: clampNumber(o.protein_g, 0, 9999, 0),
    fat_g: clampNumber(o.fat_g, 0, 9999, 0),
    fibre_g: opt(o.fibre_g, 999),
    sugar_g: opt(o.sugar_g, 999),
    sodium_mg:
      opt(o.sodium_mg, 100000) === null ? null : Math.round(opt(o.sodium_mg, 100000) as number),
  }
}

/**
 * Tier 4: nutrition from model knowledge. A SEPARATE call made only after the
 * catalogue has failed — the vision call never returns nutrients, so a good
 * catalogue match can never be averaged against a model opinion.
 */
export async function estimateNutrition(
  item: VisionItem,
  mock: MockSteer | undefined,
): Promise<Nutrition> {
  if (mockActive()) {
    if (mock?.fail === 'all' || mock?.fail === 'nutrition')
      throw new Error('mocked nutrition failure')
    if (mock?.nutrition === 'invalid') {
      // Atwater-inconsistent on purpose, so tests can exercise the reject path.
      return {
        kcal: 900,
        carbs_g: 10,
        protein_g: 5,
        fat_g: 5,
        fibre_g: null,
        sugar_g: null,
        sodium_mg: null,
      }
    }
    if (mock?.nutrition) return shapeNutrition(mock.nutrition)
    const mid = Math.round((item.kcal_low + item.kcal_high) / 2) || 500
    // Atwater-consistent split: half carbs, a fifth protein, the rest fat.
    return shapeNutrition({
      kcal: mid,
      carbs_g: Math.round((mid * 0.5) / 4),
      protein_g: Math.round((mid * 0.2) / 4),
      fat_g: Math.round((mid * 0.3) / 9),
      fibre_g: null,
      sugar_g: null,
      sodium_mg: null,
    })
  }

  const raw = await chatJSON(
    [
      {
        role: 'system',
        content:
          'You estimate nutrition for a dish. Respond with JSON only: {"kcal": number, ' +
          '"carbs_g": number, "protein_g": number, "fat_g": number, "fibre_g": number|null, ' +
          '"sugar_g": number|null, "sodium_mg": number|null}. Values are for the stated ' +
          'portion. null means unknown — never guess fibre, sugar or sodium as 0.',
      },
      {
        role: 'user',
        content:
          `${item.name}, portion: ${item.serving_hint ?? '1 serving'}. ` +
          `Expected around ${item.kcal_low}-${item.kcal_high} kcal.`,
      },
    ],
    300,
  )
  return shapeNutrition(raw)
}

export type Archetype = { id: string; slug: string; name: string; kcal: number }

/**
 * Tier 5: classification over the fixed archetype list — never search, so it
 * cannot return no-match. Throws only on model failure, which the caller
 * answers with the terminal row.
 */
export async function classifyArchetype(
  item: VisionItem,
  archetypes: Archetype[],
  mock: MockSteer | undefined,
): Promise<Archetype> {
  const bySlug = (slug: string) => archetypes.find((a) => a.slug === slug)

  if (mockActive()) {
    if (mock?.fail === 'all') throw new Error('mocked classify failure')
    if (mock?.archetype) {
      const hit = bySlug(mock.archetype)
      if (hit) return hit
    }
    // Crude keyword match, then the terminal row — same guarantees as the
    // real call: always one of the fixed list.
    const needle = `${item.name} ${item.generic_query}`.toLowerCase()
    const hit = archetypes.find((a) =>
      a.name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length > 3)
        .some((w) => needle.includes(w)),
    )
    return hit ?? (bySlug('archetype-mixed-meal') as Archetype)
  }

  const raw = await chatJSON(
    [
      {
        role: 'system',
        content:
          'Classify a dish into exactly one category from the provided list. Respond with ' +
          'JSON only: {"slug": string}. If nothing fits well, use "archetype-mixed-meal".',
      },
      {
        role: 'user',
        content:
          `Dish: ${item.name}\n\nCategories:\n` +
          archetypes.map((a) => `- ${a.slug}: ${a.name}`).join('\n'),
      },
    ],
    100,
  )
  const slug = String((raw as Record<string, unknown>)?.slug ?? '')
  return bySlug(slug) ?? (bySlug('archetype-mixed-meal') as Archetype)
}
