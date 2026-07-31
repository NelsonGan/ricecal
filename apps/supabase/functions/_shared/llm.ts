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

/**
 * One visible part of a composite plate, with the model's own sizing.
 *
 * The kcal figure is what makes component resolution work at all: catalogue
 * search ranks by NAME, so "white rice" can top-rank rice flour at 578 kcal.
 * The model's per-portion estimate gives each part a band to match within —
 * and when nothing in the catalogue fits, it prices the fallback estimate
 * row, so a breakdown never dies because one side dish was unsearchable.
 */
export type VisionComponent = {
  name: string
  kcal: number
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
}

export type VisionItem = {
  /** The model's specific name for the plate — what display_label carries. */
  name: string
  specific_query: string
  generic_query: string
  components: VisionComponent[]
  serving_hint: string | null
  kcal_low: number
  kcal_high: number
  confidence: number
  /**
   * Up to three likely corrections for THIS dish, phrased as the user would
   * type them ("No sambal", "Half portion", "Add a fried egg"). Offered as
   * one-tap chips over the fix-by-typing box — food-specific, never a
   * hardcoded list.
   */
  suggested_edits: string[]
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
  /** What the refine interpreter "decides". */
  interpret?: Interpretation
  /** 'vision' fails the vision call; 'all' fails every model call. */
  fail?: 'vision' | 'all' | 'nutrition' | 'interpret'
}

/**
 * What a fix-by-typing instruction means for the entry.
 *
 * Four shapes, because corrections come in four kinds: the amount was wrong
 * (quantity); a part of the SAME dish was added, removed or resized ("no
 * sambal", "add an egg") — an adjustment, priced as the current catalogue
 * figure plus a model-estimated delta, never a re-guess of the whole plate;
 * the dish itself was wrong ("it was rendang not curry") — which re-describes
 * it and re-runs the whole cascade; or the text is not about this food.
 */
export type Interpretation =
  | { action: 'quantity'; factor: number }
  | { action: 'adjust'; kcal_delta: number; name: string }
  | { action: 'redescribe'; item: VisionItem }
  | { action: 'none'; reason: string }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// Qwen vision model: supports image input and JSON output. Overridable because
// slugs shift as OpenRouter renames deployments.
const DEFAULT_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'qwen/qwen3.7-flash'
const CALL_TIMEOUT_MS = 25_000

export function mockActive(): boolean {
  if (Deno.env.get('MOCK_AI') === 'true') return true
  return !Deno.env.get('OPENROUTER_API_KEY')
}

/**
 * One OpenRouter chat call returning parsed JSON. Throws on anything else.
 *
 * One retry, only for failures that a retry can fix — rate limits, provider
 * hiccups, timeouts. Everything below a model call is a cheaper tier, so a
 * transient 429 costing the user a catalogue match (and handing them an
 * archetype guess instead) is the expensive way to save 700ms.
 */
async function chatJSON(messages: unknown[], maxTokens = 1200): Promise<unknown> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const attempt = async (): Promise<unknown> => {
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
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500
      throw Object.assign(new Error(`OpenRouter ${res.status}: ${await res.text()}`), {
        retryable,
      })
    }
    const body = await res.json()
    const text: string = body?.choices?.[0]?.message?.content ?? ''
    // Some models fence JSON in markdown despite response_format.
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    return JSON.parse(clean)
  }

  try {
    return await attempt()
  } catch (error) {
    // Timeouts abort as DOMException; treat those as retryable too. A parse
    // error is NOT — the model answered, it just answered badly, and asking
    // the identical question again mostly buys the identical answer.
    const retryable =
      (error as { retryable?: boolean }).retryable === true || error instanceof DOMException
    if (!retryable) throw error
    await new Promise((resolve) => setTimeout(resolve, 500))
    return attempt()
  }
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
          .flatMap((c): VisionComponent[] => {
            // Bare strings still parse (older mocks, stubborn models); they
            // carry no sizing, which the resolver treats as "top hit, as-is".
            if (typeof c === 'string') {
              const name = c.trim()
              return name ? [{ name, kcal: 0, carbs_g: null, protein_g: null, fat_g: null }] : []
            }
            const o = (c ?? {}) as Record<string, unknown>
            const name = String(o.name ?? '').trim()
            if (!name) return []
            const optional = (v: unknown): number | null => {
              const n = Number(v)
              return v !== null && v !== undefined && Number.isFinite(n) && n >= 0
                ? Math.min(n, 9999)
                : null
            }
            return [
              {
                name: name.slice(0, 120),
                kcal: Math.round(clampNumber(o.kcal, 0, 10000, 0)),
                carbs_g: optional(o.carbs_g),
                protein_g: optional(o.protein_g),
                fat_g: optional(o.fat_g),
              },
            ]
          })
          .slice(0, 8),
        serving_hint: i.serving_hint ? String(i.serving_hint).slice(0, 80) : null,
        kcal_low: low,
        kcal_high: clampNumber(i.kcal_high, low, 10000, low),
        confidence: clampNumber(i.confidence, 0, 1, 0.5),
        suggested_edits: (Array.isArray(i.suggested_edits) ? i.suggested_edits : [])
          .map((edit) => String(edit).trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 3),
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
      // Composite, so a stock local run demonstrates the breakdown path when
      // the components exist in the local catalogue.
      scene: 'composite',
      items: [
        {
          name: 'Nasi lemak with fried chicken',
          specific_query: 'nasi lemak ayam goreng',
          generic_query: 'nasi lemak',
          components: [
            { name: 'coconut rice', kcal: 340, carbs_g: 55, protein_g: 6, fat_g: 11 },
            { name: 'fried chicken', kcal: 250, carbs_g: 8, protein_g: 20, fat_g: 15 },
            { name: 'sambal', kcal: 60, carbs_g: 6, protein_g: 1, fat_g: 4 },
            { name: 'boiled egg', kcal: 70, carbs_g: 1, protein_g: 6, fat_g: 5 },
          ],
          serving_hint: '1 plate',
          kcal_low: 550,
          kcal_high: 780,
          confidence: 0.85,
          suggested_edits: ['No sambal', 'Half portion', 'Add a fried egg'],
        },
      ],
    })
  }

  if (!photoBase64) throw new Error('no photo to analyse')

  const raw = await chatJSON(
    [
      {
        role: 'system',
        content:
          'You identify food in photos for a Malaysian calorie-tracking app. ' +
          'Respond with JSON only, matching: {"scene": "single|composite|packaged|unclear", ' +
          '"items": [{"name": string, "specific_query": string, "generic_query": string, ' +
          '"components": [{"name": string, "kcal": number, "carbs_g": number|null, ' +
          '"protein_g": number|null, "fat_g": number|null}], "serving_hint": string|null, ' +
          '"kcal_low": number, "kcal_high": number, "confidence": number, ' +
          '"suggested_edits": string[]}]}. ' +
          'The photo is ONE logged meal: return ONE item named for the whole of it ' +
          '("Korean fried chicken with rice and sides"), with every distinct part — main, ' +
          'rice, sides, banchan, a drink on the tray — listed in "components". Only return ' +
          'more than one item when the photo unambiguously shows separate meals (e.g. two ' +
          "people's plates; max 6). " +
          '"specific_query" is the local dish name as eaten ("char kuey teow"), ' +
          '"generic_query" a broader fallback ("fried noodles"). ' +
          'Each component is one visible part of a composite meal: a plain searchable "name" ' +
          '(rice, protein, side), its estimated "kcal" for the PORTION VISIBLE, and its macro ' +
          'grams (null when unsure — never guess 0). One component PER PORTION — two chicken ' +
          'wings are two "chicken wing" components. Empty for a single homogeneous dish. ' +
          'Component kcal should sum to roughly the item kcal range. ' +
          '"scene" is "composite" whenever the meal has distinct visible parts. ' +
          '"serving_hint" is the visible portion ' +
          'as a person would say it ("1 plate", "1 bowl", "large plate"). kcal_low/high bound ' +
          'the calories of the portion actually visible — anchor on the portion size, not the ' +
          'dish average. confidence is 0-1 for the identification. ' +
          '"suggested_edits" is up to 3 SHORT likely corrections for this exact dish, phrased as ' +
          'a user would type them (e.g. "No sambal", "Half portion", "Extra rice") — pick what ' +
          'people most often vary about this food. The ITEM carries no macro fields — only ' +
          'components do.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What food is in this photo?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
        ],
      },
    ],
    // Headroom for six items with all fields: a response truncated mid-JSON
    // fails to parse, and a parse failure costs the whole vision tier.
    1600,
  )
  return shapeVision(raw)
}

/**
 * One photo, one entry — enforced in code, not just asked of the model.
 *
 * The vision prompt says everything eaten together is ONE item, but a model
 * that splits a tray anyway used to put four rows in the diary for one meal.
 * This fold makes the invariant structural: however many items come back,
 * they collapse into a single composite item — every part (sides, drinks,
 * all of it) becomes a component, the kcal bounds sum, and the largest item
 * names the meal. The parts stay visible as the entry's ingredient breakdown.
 */
export function foldMealItems(vision: Vision): Vision {
  const items = vision.items
  if (items.length <= 1) return vision

  const primary = items.reduce((a, b) => (b.kcal_high > a.kcal_high ? b : a))
  const rest = items.filter((item) => item !== primary)
  const merged: VisionItem = {
    name: `${primary.name} with ${rest.map((r) => r.name.toLowerCase()).join(', ')}`.slice(0, 120),
    specific_query: primary.specific_query,
    generic_query: primary.generic_query,
    // Each part is a component under its own full name, so the breakdown
    // resolves each one to its own catalogue row.
    // Each folded item becomes a component priced by its own band's middle,
    // so the breakdown resolver has a size for every part.
    components: items
      .map((item) => ({
        name: item.name,
        kcal: Math.round((item.kcal_low + item.kcal_high) / 2),
        carbs_g: null,
        protein_g: null,
        fat_g: null,
      }))
      .slice(0, 8),
    serving_hint: '1 meal',
    kcal_low: items.reduce((sum, item) => sum + item.kcal_low, 0),
    kcal_high: items.reduce((sum, item) => sum + item.kcal_high, 0),
    confidence: Math.min(...items.map((item) => item.confidence)),
    suggested_edits: primary.suggested_edits,
  }
  return { scene: 'composite', items: [merged] }
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
          'different dish with similar ingredients is NOT a match. A branded or restaurant ' +
          'version of the SAME dish is a match — the dish is what matters, not the vendor.',
      },
      {
        role: 'user',
        content:
          `Dish seen in photo: ${item.name}` +
          (item.generic_query && item.generic_query !== item.name
            ? ` (broadly: ${item.generic_query})`
            : '') +
          ` — about ${item.kcal_low}-${item.kcal_high} kcal, ` +
          `serving: ${item.serving_hint ?? 'unknown'}\n\nCatalogue entries:\n` +
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
          `${item.name}, portion: ${item.serving_hint ?? '1 serving'}.` +
          // The visible parts pin the estimate to the actual plate — "nasi
          // campur" alone could be anything; its component list is the meal.
          (item.components.length
            ? ` Contains: ${item.components.map((c) => c.name).join(', ')}.`
            : '') +
          ` Expected around ${item.kcal_low}-${item.kcal_high} kcal.`,
      },
    ],
    300,
  )
  return shapeNutrition(raw)
}

/** The entry state the interpreter reasons over. */
export type RefineContext = {
  name: string
  kcal: number
  quantity: number
  servingLabel: string | null
  ingredients: string[]
}

function shapeInterpretation(raw: unknown): Interpretation {
  const o = (raw ?? {}) as Record<string, unknown>
  if (o.action === 'quantity') {
    const factor = Number(o.factor)
    if (Number.isFinite(factor) && factor > 0 && factor <= 10) return { action: 'quantity', factor }
    return { action: 'none', reason: 'unusable quantity' }
  }
  if (o.action === 'adjust') {
    const delta = Number(o.kcal_delta)
    const name = String(o.name ?? '')
      .trim()
      .slice(0, 120)
    if (Number.isFinite(delta) && delta !== 0 && Math.abs(delta) <= 2000 && name) {
      return { action: 'adjust', kcal_delta: Math.round(delta), name }
    }
    return { action: 'none', reason: 'unusable adjustment' }
  }
  if (o.action === 'redescribe' && o.item) {
    const item = shapeVision({ scene: 'single', items: [o.item] }).items[0]
    return { action: 'redescribe', item }
  }
  return { action: 'none', reason: String(o.reason ?? 'not understood') }
}

/**
 * The fix-by-typing interpreter: entry state + free text in, one of three
 * decisions out. Cheap and text-only — the expensive work (search, estimate)
 * only happens when the answer is `redescribe`, and then it is the same
 * cascade a fresh scan runs.
 */
export async function interpretInstruction(
  context: RefineContext,
  instruction: string,
  mock: MockSteer | undefined,
): Promise<Interpretation> {
  if (mockActive()) {
    if (mock?.fail === 'all' || mock?.fail === 'interpret')
      throw new Error('mocked interpret failure')
    if (mock?.interpret) return shapeInterpretation(mock.interpret)
    // Crude but honest defaults so the flow is walkable offline: portion words
    // become factors, add/remove words become small deltas, anything else
    // re-describes the dish with the instruction folded into the name.
    const text = instruction.toLowerCase()
    if (/\bhalf\b/.test(text)) return { action: 'quantity', factor: 0.5 }
    if (/\bdouble\b|\btwo\b|\b2\b/.test(text)) return { action: 'quantity', factor: 2 }
    if (/\bno\b|\bwithout\b|\bremove\b/.test(text)) {
      return {
        action: 'adjust',
        kcal_delta: -60,
        name: `${context.name}, ${instruction}`.slice(0, 120),
      }
    }
    if (/\badd\b|\bextra\b|\bwith\b/.test(text)) {
      return {
        action: 'adjust',
        kcal_delta: 80,
        name: `${context.name}, ${instruction}`.slice(0, 120),
      }
    }
    const name = `${context.name}, ${instruction}`.slice(0, 120)
    return {
      action: 'redescribe',
      item: shapeVision({
        scene: 'single',
        items: [
          {
            name,
            specific_query: name,
            generic_query: context.name,
            components: [],
            serving_hint: context.servingLabel,
            kcal_low: Math.round(context.kcal * 0.6),
            kcal_high: Math.round(context.kcal * 1.2),
            confidence: 0.6,
            suggested_edits: [],
          },
        ],
      }).items[0],
    }
  }

  const raw = await chatJSON(
    [
      {
        role: 'system',
        content:
          'A user is correcting one logged food entry by typing. Decide what the correction ' +
          'means. Respond with JSON only, one of:\n' +
          '{"action":"quantity","factor":number} — ONLY the amount changed. `factor` is ' +
          'relative to the amount CURRENTLY logged, which the user is looking at: "half ' +
          'portion" or "I only ate half" -> 0.5 whatever the current quantity is; "I had two ' +
          'of these" means two total, so with current quantity Q return 2/Q.\n' +
          '{"action":"adjust","kcal_delta":number,"name":string} — the SAME dish with a part ' +
          'added, removed or resized: "no sambal", "add a fried egg", "extra rice". ' +
          '`kcal_delta` is the calorie change for that part alone (negative for removals — ' +
          '"no sambal" is about -50, "add an egg" about +75), `name` the corrected dish name ' +
          '(e.g. "Nasi Lemak, no sambal"). This is the answer for ANY add/remove/swap of a ' +
          'component that leaves the dish recognisably itself.\n' +
          '{"action":"redescribe","item":{"name":string,"specific_query":string,' +
          '"generic_query":string,"components":[{"name":string,"kcal":number,' +
          '"carbs_g":number|null,"protein_g":number|null,"fat_g":number|null}],' +
          '"serving_hint":string|null,' +
          '"kcal_low":number,"kcal_high":number,"confidence":number,"suggested_edits":[]}} — ' +
          'the dish IDENTITY was wrong ("it was rendang not curry", "this is laksa"). ' +
          'Describe the correct dish as eaten and bound its calories tightly.\n' +
          '{"action":"none","reason":string} — the text is not a food correction.\n' +
          'Never re-guess the whole plate for a small change: prefer adjust over redescribe.',
      },
      {
        role: 'user',
        content:
          `Current entry: ${context.name} — ${context.kcal} kcal, quantity ${context.quantity}` +
          `${context.servingLabel ? ` × ${context.servingLabel}` : ''}` +
          (context.ingredients.length ? `\nIngredients: ${context.ingredients.join(', ')}` : '') +
          `\n\nUser typed: "${instruction}"`,
      },
    ],
    600,
  )
  return shapeInterpretation(raw)
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
          `Dish: ${item.name}` +
          (item.generic_query && item.generic_query !== item.name
            ? ` (broadly: ${item.generic_query})`
            : '') +
          `\n\nCategories:\n` +
          archetypes.map((a) => `- ${a.slug}: ${a.name}`).join('\n'),
      },
    ],
    100,
  )
  const slug = String((raw as Record<string, unknown>)?.slug ?? '')
  return bySlug(slug) ?? (bySlug('archetype-mixed-meal') as Archetype)
}
