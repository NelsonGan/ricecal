// The model calls the scan cascade makes, and their mocks.
//
// Every function here has the same contract: return a parsed, shape-checked value
// or throw. `cascade.ts` treats any throw as "this tier failed, move down", so no
// model error can surface to the client, because the tier below every model call
// is one that needs no model.
//
// Mock mode is active when MOCK_AI=true, or when no OPENROUTER_API_KEY is set at
// all, so a fresh local stack scans out of the box and production can never fall
// into the mock silently. A request may steer the mock through `body.mock`, which
// is only read in mock mode, so a test can force each tier in turn.

import type { Meter } from './entitlement.ts'
import { guessIcon, ICON_INSTRUCTION, type IconChoice, resolveIcon, unslug } from './icons.ts'
import { reconcile, unfoldCounts } from './portion.ts'

export type Scene = 'single' | 'composite' | 'packaged' | 'unclear'

/**
 * One visible part of a composite plate, with the model's own sizing.
 *
 * The kcal figure is what makes component resolution work: catalogue search
 * ranks by name, so "white rice" can top-rank rice flour at 578 kcal. The
 * model's per-portion estimate gives each part a band to match within.
 *
 * `kcal` is for one of the thing and `count` says how many are on the plate,
 * which is the only shape the breakdown can be edited in: two chicken wings
 * folded into one row leaves a stepper that moves in units of two wings.
 */
export type VisionComponent = {
  name: string
  /** How many of this part are visible. Whole numbers; 1 unless repeated. */
  count: number
  /**
   * What one of them weighs, edible parts only: no bone, no shell, no skewer.
   *
   * The size signal that survives contact with a photograph. Asked only for
   * calories the model priced a satay stick at 180 kcal, and the band around
   * that figure then excluded the very catalogue rows that would have corrected
   * it. Asked what the stick weighs it answers 30 g, which is checkable against
   * the macro grams beside it.
   */
  grams: number | null
  /** Calories for ONE of them, never the total for `count` of them. */
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
  /**
   * How many whole units of this dish are on the table, when the dish is
   * countable: three durian seeds, two roti canai, six dumplings. 1 for a bowl
   * of laksa. It becomes the entry's own portion, so three durian logged as
   * "1 cup" is unfixable by the stepper beside it.
   */
  count: number
  components: VisionComponent[]
  /**
   * What one unit of this dish weighs, edible parts only. Three durian are
   * priced per seed, and a seed is 40 g of flesh whatever the model guesses it
   * costs. Null when the plate came back as a list of parts, which carry the
   * mass themselves.
   */
  grams: number | null
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
  /**
   * The drawing for the row, chosen out of our own set. Filled in on the typed
   * path only: a photographed meal has the photograph, and `food_logs` will not
   * hold both.
   */
  icon: IconChoice | null
}

/**
 * A nutrition panel read straight off the packet. Photographing the label
 * instead of the food says the answer is printed there, so this path skips the
 * catalogue and the estimator: the numbers are the label's, and the only
 * judgement left is how many servings were eaten.
 */
export type NutritionLabel = {
  /** What the packet is, as printed: "Milo Activ-Go", "Jacob's Cream Crackers". */
  name: string
  /** Per SERVING, as the panel states it. */
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  fibre_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  /** "1 sachet (33g)", "100 ml" — the panel's own words for one serving. */
  serving: string | null
}

export type Vision = {
  scene: Scene
  items: VisionItem[]
  /** Set when the photo is a nutrition panel rather than food. */
  label?: NutritionLabel
  /**
   * The photo has nothing edible in it. Distinct from "unclear": a blurred
   * plate is still a meal, but a photo of a cat must not become calories in
   * somebody's diary. The scan answers "no food" and writes nothing.
   */
  noFood?: boolean
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
  /** What the refine interpreter "decides". */
  interpret?: Interpretation
  /** 'vision' fails the vision call; 'all' fails every model call. */
  fail?: 'vision' | 'all' | 'nutrition' | 'interpret'
}

/**
 * What a fix-by-typing instruction means for the entry. Four kinds: the amount
 * was wrong; a part was added, removed or resized, priced as a delta on the
 * catalogue figure rather than a re-guess of the plate; the dish itself was
 * wrong, which re-runs the cascade; or the text is not about this food.
 */
export type Interpretation =
  | { action: 'quantity'; factor: number }
  | {
      action: 'adjust'
      kcal_delta: number
      name: string
      /**
       * The part the correction is about: an existing ingredient to drop, or
       * the name of one to add. Null when the change is about the dish as a
       * whole. Without it an adjustment could only move the plate's total,
       * which meant throwing the breakdown away to keep the arithmetic honest.
       */
      part: string | null
      /**
       * The part `part` takes the place of, when one thing on the plate turned
       * out to be a different thing. "It was rendang chicken not fried chicken"
       * corrects one side of a four-part plate; without somewhere to put it the
       * interpreter called the whole meal misidentified and re-resolved the
       * rice, the sambal and the egg nobody had mentioned.
       *
       * Null for every other adjustment, including additions and removals,
       * which change a part's presence rather than its identity.
       */
      replaces: string | null
      /**
       * What the new food costs, at the count the part it replaces is logged
       * at. Only meaningful alongside `replaces`, and the one adjustment where
       * a delta is the wrong question: against a 247 kcal fried chicken the
       * model answered -172, putting rendang at 75 kcal. Asked what rendang
       * chicken costs, it answers 280.
       */
      part_kcal: number | null
      /**
       * How many of that part were added or taken away, when the user counted
       * them out loud. "Two more skewers" is 2; applied as calories it turned
       * seven skewers into ten.
       */
      count: number | null
      /**
       * How many of that part there are, when the user states an amount rather
       * than a change. "Only three skewers" is 3.
       *
       * Distinct from `count`, which means the opposite on a plate of six: as a
       * change, three skewers is nine. Without it "only 3 skewers" came back as
       * `quantity` 0.5 and halved the lontong nobody mentioned.
       */
      total: number | null
    }
  | { action: 'redescribe'; item: VisionItem }
  | {
      action: 'none'
      /**
       * Why nothing is going to happen, and the two are not the same failure.
       *
       * `not_a_correction` is a result: the model read the text and decided it
       * has no calories in it, which is the honest answer to "extra spicy".
       * `unusable` is an answer this function cannot act on, which is a failed
       * call and worth one more try.
       *
       * The client says different things for the two, because they send
       * somebody to different next actions.
       */
      code: 'not_a_correction' | 'unusable'
      reason: string
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

/**
 * How much room an answer gets when a call site does not say.
 *
 * Generous, because a ceiling is not a bill: tokens are charged as generated,
 * so an answer that fits in 200 costs 200 whatever this says. A tight ceiling
 * only buys `finish_reason: length` with no content in the body, which is a
 * silent failure of whatever feature asked. See `INTERPRET_MAX_TOKENS`.
 */
const DEFAULT_MAX_TOKENS = 2000

/**
 * One OpenRouter chat call returning parsed JSON. Throws on anything else.
 *
 * Exported for `recipe.ts`, which makes two calls of its own but has no second
 * way to talk to a model.
 *
 * One retry, only for failures a retry can fix: rate limits, provider hiccups,
 * timeouts. Everything below a model call is a cheaper tier, so a transient 429
 * costing a catalogue match is the expensive way to save 700ms.
 */
export async function chatJSON(
  meter: Meter,
  messages: unknown[],
  maxTokens = DEFAULT_MAX_TOKENS,
): Promise<unknown> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('OPENROUTER_API_KEY not set')

  const attempt = async (): Promise<unknown> => {
    // Counted before the request, so a call that times out still shows in the
    // trace as something we paid for. The retry counts again, since OpenRouter
    // bills it as a second request. Counting only: the ceiling is claimed once
    // per scan at the top of the endpoint.
    meter.record()

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
        // Off, not merely low. qwen3.7-flash reasons by default, which cost
        // 20-30s per call and put three sequential calls past the client's 60s
        // timeout. Worse, reasoning tokens come out of `max_tokens`, so a model
        // that thinks past the ceiling returns `finish_reason: length` with an
        // empty body: the vision call then wrote a guessed meal onto somebody's
        // day, and the refine interpreter answered "could not apply that" to
        // corrections that were fine.
        //
        // Models with no reasoning mode ignore the field.
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
    const choice = body?.choices?.[0]
    const text: string = choice?.message?.content ?? ''
    // An empty body is a provider hiccup rather than an answer, and
    // JSON.parse('') throws a message that reads like a bad model.
    //
    // `finish_reason: length` is not retryable: the model spent the whole
    // ceiling before writing any JSON, so an identical request has nothing new
    // to run into. The fix is a bigger ceiling at the call site.
    if (!text.trim()) {
      const reason = choice?.finish_reason ?? 'none'
      throw Object.assign(new Error(`OpenRouter returned no content (finish_reason: ${reason})`), {
        retryable: reason !== 'length',
      })
    }
    // Some models fence JSON in markdown despite response_format.
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    return JSON.parse(clean)
  }

  try {
    return await attempt()
  } catch (error) {
    // Timeouts abort as DOMException, so those are retryable too. A parse error
    // is not: the model answered badly, and asking again buys the same answer.
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

/**
 * The weight of one unit, or null. Null rather than a default, because
 * everything reading grams branches on having them and a default would put
 * every unsized part at the same fictitious size. The bounds are what one piece
 * of food can weigh: under 2 g is a garnish, over 2 kg is a whole roast.
 */
const unitGrams = (v: unknown): number | null => {
  const n = Number(v)
  if (v === null || v === undefined || !Number.isFinite(n) || n < 2 || n > 2000) return null
  return Math.round(n)
}

/**
 * How many of the item there were, allowing for less than one. Whole numbers at
 * one and above, because "1.5 plates" is a calorie figure pretending to be a
 * count. Quarters below one, because `grams` is defined as the weight of one
 * whole unit and cannot also carry the half: "half a plate of char kuey teow"
 * put the half in the bounds and logged a whole plate every time.
 */
const unitCount = (v: unknown): number => {
  const n = clampNumber(v, 0.25, 20, 1)
  return n >= 1 ? Math.round(n) : Math.round(n * 4) / 4
}

function shapeVision(raw: unknown): Vision {
  const o = (raw ?? {}) as Record<string, unknown>
  const scene: Scene = ['single', 'composite', 'packaged', 'unclear'].includes(o.scene as string)
    ? (o.scene as Scene)
    : 'unclear'
  // Taken at its word and returned before anything else is read: the rest of
  // the shape is about a meal, and there isn't one.
  if (o.no_food === true) return { scene: 'unclear', items: [], noFood: true }

  // A nutrition panel short-circuits the whole shape: everything below is
  // about guessing what food is in a photo, and a label needs no guessing.
  const raw_label = (o.nutrition_label ?? null) as Record<string, unknown> | null
  if (raw_label && Number(raw_label.kcal) > 0) {
    const opt = (v: unknown): number | null => {
      const n = Number(v)
      return v === null || v === undefined || !Number.isFinite(n) ? null : Math.max(0, n)
    }
    return {
      scene: 'packaged',
      items: [],
      label: {
        // `??` alone would let an empty string through, and "" is what a model
        // gives when it half-follows the instruction to answer null.
        name:
          String(raw_label.name ?? '')
            .trim()
            .slice(0, 120)
            .trim() || 'Packaged food',
        kcal: Math.round(clampNumber(raw_label.kcal, 0, 20000, 0)),
        carbs_g: clampNumber(raw_label.carbs_g, 0, 2000, 0),
        protein_g: clampNumber(raw_label.protein_g, 0, 2000, 0),
        fat_g: clampNumber(raw_label.fat_g, 0, 2000, 0),
        fibre_g: opt(raw_label.fibre_g),
        sugar_g: opt(raw_label.sugar_g),
        sodium_mg:
          opt(raw_label.sodium_mg) === null ? null : Math.round(Number(raw_label.sodium_mg)),
        serving: raw_label.serving ? String(raw_label.serving).slice(0, 80) : null,
      },
    }
  }
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 6).flatMap((it) => {
    const i = (it ?? {}) as Record<string, unknown>
    const name = String(i.name ?? '').trim()
    if (!name) return []
    const low = clampNumber(i.kcal_low, 0, 10000, 0)
    // Read before the components rather than beside them: the band is what
    // decides whether the counts below have already been applied.
    const high = clampNumber(i.kcal_high, low, 10000, low)
    return [
      {
        name: name.slice(0, 120),
        // `unslug` because the icon list leaks into exactly these two fields.
        specific_query: unslug(String(i.specific_query ?? name)),
        generic_query: unslug(String(i.generic_query ?? '')),
        count: unitCount(i.count),
        // `unfoldCounts` last, because it is the one step that needs the whole
        // list and the band together: a part is only "already totalled" if the
        // parts TOGETHER outrun the meal they are supposed to add up to.
        components: unfoldCounts(
          (Array.isArray(i.components) ? i.components : [])
            .flatMap((c): VisionComponent[] => {
              // Bare strings still parse (older mocks, stubborn models); they
              // carry no sizing, which the resolver treats as "top hit, as-is".
              if (typeof c === 'string') {
                const name = c.trim()
                return name
                  ? [
                      {
                        name,
                        count: 1,
                        grams: null,
                        kcal: 0,
                        carbs_g: null,
                        protein_g: null,
                        fat_g: null,
                      },
                    ]
                  : []
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
              // A glass of water is not part of a meal's calories, and listing
              // it made a durian into "Durian with water": two components, so
              // the plate was decomposed instead of counted.
              //
              // Explicitly zero is the whole distinction. `Number(null)` is 0,
              // so treating that as zero deleted every unpriced part, and the
              // part a model is least willing to price is the plain base of the
              // dish: a char kuey teow came back as prawns and lap cheong with
              // no noodles under them.
              //
              // Written against the raw value so null and undefined are not
              // zero, and loosely enough that "0" and 0.0 still are.
              if (o.kcal !== null && o.kcal !== undefined && Number(o.kcal) === 0) return []
              return [
                {
                  name: name.slice(0, 120),
                  // Whole units. A model that answers 1.5 means one and a bit,
                  // which is what the kcal figure is for.
                  count: Math.round(clampNumber(o.count, 1, 12, 1)),
                  grams: unitGrams(o.grams),
                  kcal: Math.round(clampNumber(o.kcal, 0, 10000, 0)),
                  carbs_g: optional(o.carbs_g),
                  protein_g: optional(o.protein_g),
                  fat_g: optional(o.fat_g),
                },
              ]
            })
            // Made to agree with their own weight before anything downstream
            // reads them. `reconcile` is where 180 kcal in a 30 g satay stick
            // stops being a number the catalogue search works around.
            .map((component) => ({ ...component, ...reconcile(component) }))
            .slice(0, 8),
          low,
          high,
        ),
        grams: unitGrams(i.grams),
        serving_hint: i.serving_hint ? String(i.serving_hint).slice(0, 80) : null,
        kcal_low: low,
        kcal_high: high,
        confidence: clampNumber(i.confidence, 0, 1, 0.5),
        suggested_edits: (Array.isArray(i.suggested_edits) ? i.suggested_edits : [])
          .map((edit) => String(edit).trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 3),
        // The model's choice, or one worked out from the dish's own name when
        // it gave none or named a spelling we do not carry. See `guessIcon`.
        //
        // Harmless on the photo path, which never asks for an icon and whose
        // rows carry a photograph anyway: `writeEntry` drops an icon that
        // arrives beside one.
        icon: resolveIcon(i.icon) ?? guessIcon(name),
      } satisfies VisionItem,
    ]
  })
  if (!items.length) throw new Error('vision returned no items')
  return { scene, items }
}

// The prompt a meal is described to the cascade in.
//
// A photograph and a typed sentence answer in the same shape and everything
// downstream is the same code, so the rules about that shape are the same words.
// What is not shared is the framing: a photo has one witness and it is the
// model, where a sentence was written by the person who ate the meal.

/**
 * The shape sentence, and whether an item declares an icon. A function rather
 * than a constant for the reason `recipeSchema` gives: the literal schema is
 * the strongest instruction in the prompt, and a key described only in prose is
 * one the model leaves out about half the time.
 */
const itemSchema = (withIcon: boolean): string =>
  '{"scene": "single|composite|packaged|unclear", ' +
  '"items": [{"name": string, "specific_query": string, "generic_query": string, ' +
  '"count": number, "grams": number|null, ' +
  (withIcon ? '"icon": string|null, ' : '') +
  '"components": [{"name": string, "count": number, "grams": number, "kcal": number, ' +
  '"carbs_g": number|null, "protein_g": number|null, "fat_g": number|null}], ' +
  '"serving_hint": string|null, ' +
  '"kcal_low": number, "kcal_high": number, "confidence": number, ' +
  '"suggested_edits": string[]}]}. '

const QUERY_FIELDS =
  '"specific_query" is the local dish name as eaten ("char kuey teow"), ' +
  '"generic_query" a broader fallback ("fried noodles"). '

// The two ways a meal can have more than one thing in it, and the shapes the
// app can actually edit.
const COUNT_VS_COMPONENTS =
  'Many of ONE food is the item\'s own "count": 3 durian seeds, 6 dumplings, 2 eggs ' +
  '— leave "components" empty for those. Several DIFFERENT foods are components: ' +
  'rice, the protein, each side, a drink with calories in it. Water, ice and an ' +
  'empty glass are not food and are never listed. ' +
  // The two counts are one number in two places: "two roti canai with dhal"
  // came back as one item at count 2 whose parts were priced for a single
  // plate, so either end of it got half the meal or twice the dhal.
  'THE TWO COUNTS ARE NOT INTERCHANGEABLE. As soon as you list components the ' +
  'item\'s own "count" is 1, always, and how many there are of each thing lives on ' +
  'that thing\'s component "count". Two roti canai with a dhal is count 1 with ' +
  'components roti canai count 2 and dhal count 1 — never count 2 at the top. '

// The breakdown is editable per part, so each part is a control over a number.
const COMPONENT_FIELDS =
  'A component carries a plain searchable "name", a "count" of how many there are, ' +
  'and the "grams", "kcal" and macro grams of ONE of them. The weight and the calories are ' +
  'both REQUIRED on every part — null is not an answer for either, and a part with no price ' +
  'is one the app has to work out from a search that may find the wrong food. Only the three ' +
  'macro fields may be null, when you are unsure; never guess them as 0. ' +
  'Two chicken wings are one component with count 2 weighed and priced for a single wing. ' +
  // The base of a dish is the part a model is least willing to price, and the
  // one it can least afford to leave out.
  'Every part gets a weight and a price, including the plain one underneath: the rice, the ' +
  'noodles, the bread. Listing what is on top and leaving out what it is on is not a ' +
  'breakdown of the meal. ' +
  // A list of one is the dish wearing a second name, and the app then shows a
  // breakdown with a single row in it that adds up to the row above it.
  'Never return exactly ONE component: one component IS the dish, so leave ' +
  '"components" empty. Two or none. ' +
  'A component name is the food alone ("coconut rice") — not the dish it came from, ' +
  'and never a parenthesised recipe. ' +
  // A part wearing the dish's name is looked up as the dish, and the catalogue
  // is mostly whole dishes. A chicken rice came back with parts "boiled
  // chicken" and "chicken rice", so the bird was counted once as itself and
  // again inside the rice: 72.6 g of protein for a meal holding about 38.
  "NEVER GIVE A PART THE WHOLE DISH'S NAME. The rice under a chicken rice is " +
  '"seasoned rice", never "chicken rice"; the noodles in a laksa are "rice noodles", ' +
  'never "laksa"; the rice under a nasi lemak is "coconut rice". A part that repeats ' +
  "the dish's name is priced as the whole dish and the meal is counted twice. " +
  // Listed separately, the oil is counted twice: once as itself and once in
  // the density of the fried thing it was cooked into.
  'Oil, seasoning, gravy stirred through and anything else absorbed into a dish belong to ' +
  'that dish and are never a part of their own — a fried noodle is already an oily food. ' +
  'Only a sauce served on the side, in its own dish, is separate. '

// Size, as a weight rather than as a calorie count. In kcal it did not hold: a
// satay stick priced at 180, a lap cheong slice at 217. A model cannot check a
// calorie figure, and the band around an inflated one then excluded the rows
// that disagreed. A weight it can check, against the macro grams beside it.
const SIZE_ANCHORS =
  'SIZE IS A WEIGHT AND THE WEIGHT COMES FIRST. For every part decide "grams" — what ONE of ' +
  'it weighs, edible parts only, no bone, shell, skewer or wrapper — and only then work out ' +
  'what that weight costs. A calorie figure not arrived at from a weight is a guess about a ' +
  'portion nobody measured, and it runs high. ' +
  // Weighing one thing and counting how many there are are different answers,
  // and asking hard for the first cost the second: four satay came back as one
  // 30 g stick, which is a correct weight and a third of a meal.
  '"grams" and "kcal" describe ONE unit, and "count" is how many of them are there. Both are ' +
  'needed and neither substitutes for the other: four skewers on a plate are count 4 at 30 g ' +
  'each, never count 1 at 120 g and never count 1 at 30 g. Count what you can see and say so. ' +
  'Count whole units, not cut pieces: an egg sliced in half is one egg, an apple in slices ' +
  'is one apple. ' +
  // Part of a serving has to be a count below one, because "grams" is the
  // weight of one whole unit and cannot also carry the fraction. Without this,
  // "half a plate of char kuey teow" put the half in the bounds and the words,
  // and logged a whole plate three times out of three.
  'LESS THAN ONE of something is a "count" below 1 — half a plate is count 0.5 at the ' +
  'grams and kcal of a WHOLE plate, a quarter is 0.25. Never shrink "grams" to express ' +
  'a part portion; grams is always one whole unit. Only for a portion that really is a ' +
  'fraction of one serving, and never as a way of saying "a small one". ' +
  // Roti was the gap the anchors did not cover: a mamak breakfast came back at
  // 240 g per roti canai, priced at 808 kcal each, for a 1,981 kcal breakfast.
  'Grams for ONE: satay stick 25-35, dumpling 25-35, prawn 10-20, chicken wing piece 35-50, ' +
  'drumstick 90-120, fried chicken thigh 120-160, slice of lap cheong 10-15, boiled egg ' +
  '50-60, slice of bread 30-40, roti canai or paratha 90-120, chapati 45-60, naan 90-140, ' +
  'apple slice 15-20, potato wedge 20-30, prawn cracker 2-4, ' +
  'scoop of cooked rice 150-220, drained noodles 200-300, ladle of curry or soup 150-250, ' +
  'spoon of sambal or sauce 15-25, single-patty burger 100-130, medium fries 110-130, ' +
  'canned drink 330, ' +
  // Poached chicken beside a chicken rice came back at 180-260 g three runs out
  // of three, which is most of a bird. Meat is the densest thing in protein on a
  // plate, so overweighing it is the most expensive size mistake available.
  'sliced poached, steamed or roast chicken served beside rice 90-140, ' +
  'quarter chicken off the bone 100-150, half chicken off the bone 200-280, ' +
  'grilled or steamed fish fillet 100-150, slice of char siu 15-25. ' +
  // The general rule behind those, since a list cannot cover every dish. It
  // says nothing about "count": that is settled further up, and mentioning it
  // again here is how a plate of toast came back as two slices of two slices.
  "ONE PERSON'S HELPING OF MEAT OR FISH IS 80-150 g. Over 200 g is a sharing dish, and " +
  'is worth checking rather than assuming. Bone, shell and skin left on the plate are ' +
  'not food: a quarter chicken is 250 g on the scales and about 130 g to eat, and the ' +
  'weight you give is the second number. ' +
  // The conversion, so the two numbers are one answer rather than two.
  'And what a gram is worth: cooked rice and noodles 1.2-1.5 kcal/g, steamed or grilled meat ' +
  '1.5-2, fried chicken with skin 2.5-3, chips and fried potato 3, curry and coconut gravy ' +
  '1.2-2, vegetables and salad 0.2-0.5, sweet drinks 0.4, peanuts, crisps and crackling 5-5.5. ' +
  'Nothing on a plate is over 6 kcal/g. Multiply, and let the product be the answer: a 30 g ' +
  'satay stick is about 55 kcal and not 180, so four of them are 220 and not 720. ' +
  // Mass conservation, stated as an instruction the model can act on.
  '"carbs_g", "protein_g" and "fat_g" are for ONE unit too, and they are grams of MATTER: ' +
  'together they must weigh LESS than the unit, and much less for anything cooked, because ' +
  'most of a cooked food is water. Check that 4*carbs + 4*protein + 9*fat lands on your kcal ' +
  'before answering; where they disagree the weight is right and the kcal is wrong. ' +
  // The mass check one level up: individually plausible parts still add up to
  // an impossible meal, such as four 120 g chicken thighs in a bowl of laksa.
  'Last, weigh the meal. A bowl of soup or noodles is 400-700 g of food all in, a plate of ' +
  'rice with things on it 350-600 g, a snack or a side 100-250 g. If your parts add up to far ' +
  'more than that, one of them is too big or there are fewer of it than you counted — a ' +
  'serving bowl holds one serving. '

const TRAILING_FIELDS =
  '"scene" is "composite" when the meal has distinct parts. "serving_hint" ' +
  'is the portion as a person would say it ("1 plate", "1 bowl"). ' +
  // The item's own weight, which is what the estimator anchors on when the
  // catalogue has nothing.
  'The item\'s own "grams" is what ONE unit of the dish weighs, edible parts only — one ' +
  'plate, one bowl, one durian seed, one roti. When "count" is more than 1 it is the weight ' +
  'of ONE of them and never of all of them together: nine apple slices are "count": 9 with ' +
  '"grams": 18, not 160. ' +
  // The band is arithmetic over the answer already given. Asked for as a
  // judgement, two roti and a dhal came back bounded at 380-380 while their own
  // components added to 640.
  'kcal_low and kcal_high bound the WHOLE meal, and they are the LAST thing you ' +
  'work out — arithmetic over the answer you have already given, not a second ' +
  'opinion beside it. Add up (kcal x count) over every component you listed, or ' +
  'multiply one unit by "count" for a counted item, and put that total between the ' +
  'two bounds: parts of 340 + 2x125 + 60 mean a total of 650, so bounds like ' +
  '550-750 and never 380-380. They are a range — kcal_low is always smaller than ' +
  'kcal_high, never equal to it, even when you are sure of the figure. ' +
  // The components are what the meal is priced from, so a disagreement with the
  // bounds is a mispriced part. Told only to derive the bounds, the model kept a
  // nasi kandar whose four parts added to 405 and bounded it at 650-850.
  'If that total does not look like the meal you were told about, the COMPONENT ' +
  'figures are what to correct — each one is a real portion of that food and the ' +
  'app prices the meal from them, so a plate that should be 700 kcal cannot be ' +
  'made of parts adding to 400. ' +
  '"confidence" is 0-1 for the identification. "suggested_edits" is 2 or 3 short ' +
  'corrections a user of THIS dish would plausibly type ("No sambal", "Half ' +
  'portion", "Extra rice") — an empty list is not an answer, and they are what the ' +
  'app offers as one-tap fixes. ' +
  'The item carries no macro fields — only components do.'

/**
 * Where the food is from, said once for all three model prompts: the two here
 * and the recipe reader.
 *
 * Each opened with "a Malaysian calorie-tracking app", which the model read as
 * an instruction about the food rather than the audience, so a taco came back
 * as the nearest Malaysian dish. The bias belongs on the tie-break and never on
 * a dish the picture or the sentence names plainly.
 */
export const KITCHEN =
  'The food is mostly Asian, southeast Asian most of all, so read an ambiguous ' +
  'dish that way. But people eat everything, and a dish from anywhere else is ' +
  'answered on its own terms rather than as the nearest Asian thing to it. '

/**
 * The photo prompt. Exported, like the other two, because the eval harness
 * sends these exact strings: a harness with its own copy grades a prompt nobody
 * ships.
 */
export const ANALYSE_PHOTO_PROMPT =
  'You identify food in photos for a calorie-tracking app. ' +
  KITCHEN +
  'If the photo has nothing edible in it — a person, a room, a screen, an empty ' +
  'plate — answer {"no_food": true} and nothing else. A blurred or half-guessable ' +
  'meal is still a meal; say no_food only when there is no food. ' +
  // A label is not a thing to identify, it is a thing to read.
  'If the photo shows a NUTRITION FACTS panel or ingredients label, answer ' +
  '{"nutrition_label": {"name": string|null, "kcal": number, "carbs_g": number, ' +
  '"protein_g": number, "fat_g": number, "fibre_g": number|null, ' +
  '"sugar_g": number|null, "sodium_mg": number|null, "serving": string|null}} and ' +
  'nothing else. Copy the figures for ONE SERVING exactly as printed — do not ' +
  'convert, round or estimate, and do not use the per-100g column when a per-serving ' +
  'column is there. "serving" is the panel\'s own words for one serving ' +
  '("1 sachet (33g)"). "name" is the product as printed on the pack, and null when ' +
  'the pack name is not in the photo — a close-up of the panel usually is not. ' +
  'Never invent a stand-in like "Unidentified Food Product"; null is the answer. ' +
  'If the panel is only readable per 100g, use those figures and say so in "serving". ' +
  'Otherwise respond with JSON only, matching: ' +
  itemSchema(false) +
  // One meal. Anything else is a diary with four rows for one lunch.
  'The photo is ONE logged meal. Return ONE item, named as a local menu would print ' +
  'it ("Korean fried chicken with rice and sides"). Only return more than one item ' +
  "when the photo unambiguously shows separate meals — two people's plates. " +
  QUERY_FIELDS +
  COUNT_VS_COMPONENTS +
  // Only what is on the plate: a guessed part is a control over a number nobody
  // measured.
  'Only list components you can SEE as separate things on the plate. A curry, a ' +
  'fried rice, a soup, a sandwich, anything cooked or mixed together is ONE food — ' +
  'leave components empty rather than guessing what went into it. ' +
  COMPONENT_FIELDS +
  SIZE_ANCHORS +
  'Anchor on the portion in the photo, not the dish average. ' +
  TRAILING_FIELDS

/**
 * The vision call. Returns queries and a kcal range, never per-nutrient values:
 * identity comes from the model, numbers come from the catalogue, and tier 4 is
 * the only place model numbers are accepted.
 */
export async function analysePhoto(
  photoBase64: string | null,
  mock: MockSteer | undefined,
  meter: Meter,
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
          count: 1,
          components: [
            {
              name: 'coconut rice',
              count: 1,
              grams: 200,
              kcal: 340,
              carbs_g: 55,
              protein_g: 6,
              fat_g: 11,
            },
            // Two of them, weighed and priced one at a time — the shape the
            // breakdown edits in.
            {
              name: 'fried chicken wing',
              count: 2,
              grams: 45,
              kcal: 125,
              carbs_g: 4,
              protein_g: 10,
              fat_g: 8,
            },
            { name: 'sambal', count: 1, grams: 25, kcal: 60, carbs_g: 6, protein_g: 1, fat_g: 4 },
            {
              name: 'boiled egg',
              count: 1,
              grams: 55,
              kcal: 70,
              carbs_g: 1,
              protein_g: 6,
              fat_g: 5,
            },
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
    meter,
    [
      { role: 'system', content: ANALYSE_PHOTO_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What food is in this photo?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
        ],
      },
    ],
    // Headroom for a full plate with all fields. A response truncated mid-JSON
    // fails to parse and costs the whole vision tier: a chicken rice with six
    // components ran out at 1600 and took the scan down with it.
    2400,
  )
  return shapeVision(raw)
}

/** The text prompt. Exported for the eval harness, like the photo one. */
export const DESCRIBE_MEAL_PROMPT =
  'You turn a typed meal description into structured data for a ' +
  'calorie-tracking app. ' +
  KITCHEN +
  'The text was written by the person who ate the meal, so ' +
  'what it says is the answer rather than a hypothesis: never add a food it does ' +
  'not mention, never drop one it does, and never overrule an amount, a size or a ' +
  'calorie figure it states. What it leaves out is yours to fill in — an unstated ' +
  'portion is one ordinary serving as a stall or home kitchen serves it. ' +
  // Emphatic, with the consequence spelled out, because the failure is silent:
  // one run in three answered "hello, how are you doing today" with an item, and
  // nothing below this call can tell an invented meal from a vague one.
  'FIRST, DECIDE WHETHER THERE IS A MEAL HERE AT ALL. If the text does not say ' +
  'that someone ate something — a greeting, a question, a note to self, a name, ' +
  'an empty or nonsense string — answer {"no_food": true} and nothing else. ' +
  '"hello, how are you", "test", "what can you do", "remind me to buy milk" are ' +
  'all no_food. Do not fall back to a generic meal, and never return an item you ' +
  'are unsure is food: an item is written into the diary as calories the person ' +
  'did not eat, and no_food costs them one tap. ' +
  'Otherwise respond with JSON only, matching: ' +
  itemSchema(true) +
  // One meal, for the same reason the photo path folds its items.
  'The text is ONE logged meal however many dishes it names. Return ONE item, ' +
  'named the way the person would read it back ("Nasi lemak with fried chicken and ' +
  'teh tarik"). The name is the FOOD and never the portion: "half a plate of char ' +
  'kuey teow" is named "Char kuey teow" with the half in "serving_hint" and in the ' +
  'calorie bounds. ' +
  QUERY_FIELDS +
  COUNT_VS_COMPONENTS +
  // The mirror of the photo prompt's "only what you can see": there parts must
  // be visible, here they must have been typed.
  //
  // Written as a counting rule rather than as advice, because as prose it did
  // not hold: "a bowl of chicken porridge" came back as rice, chicken and
  // broth. A count is checkable before anything is written.
  'BEFORE ANYTHING ELSE, COUNT THE FOODS THE PERSON WROTE. Components are those ' +
  'foods and only those, so the list is exactly as long as the count and never ' +
  'longer. One food written means "components": [] — no exceptions, however many ' +
  'things that dish arrives with. ' +
  'What splits two foods is their writing: "and", "with", a comma, a number. ' +
  'Nothing else splits, and a dish name never splits. ' +
  'A dish name covers everything that normally comes with that dish: "nasi lemak" ' +
  'is ONE food however many things arrive on the plate, "chicken rice" is not rice ' +
  'plus chicken, "chicken porridge" is not rice plus chicken plus broth, "big mac" ' +
  'is not bun plus patty plus sauce. Naming the parts of a dish the person named ' +
  'as a whole invents a breakdown they did not type. ' +
  'So "nasi lemak" has no components, "a bowl of chicken porridge" has none, ' +
  '"200g grilled chicken breast" has none, "nasi lemak with fried chicken" has ' +
  'exactly TWO, and "nasi lemak with an extra egg and a milo ais" has three. ' +
  // A check the model can run on its own answer. Rules about not doing
  // something read as advice: "chicken rice" came back as coconut rice plus
  // roast chicken three runs out of three with the rule already in place.
  'BEFORE YOU ANSWER, count the foods in the text again and compare it with the ' +
  'length of your "components". If the list is longer, you have taken a dish ' +
  'apart: delete the extra parts and leave the dish whole. ' +
  COMPONENT_FIELDS +
  SIZE_ANCHORS +
  // The three ways a sentence pins a portion down, in the order they override
  // each other. A size word used to move only the bounds and the hint, neither
  // of which the app can act on; the field it has to move is "count".
  'Size words are about the portion and never about the dish: "small", "large", ' +
  '"half a plate", "just a bit" move "count", kcal_low/high and "serving_hint" ' +
  'together, and never the name. A fraction of a serving is a "count" below 1 — ' +
  '"half a plate of char kuey teow" is count 0.5, and its grams stay a whole ' +
  "plate's. " +
  'A stated weight or volume ("200g chicken breast", "500ml milo") is exact ' +
  '— price that amount and say it in "serving_hint". A stated calorie figure ("a ' +
  '250 kcal protein bar", "roughly 700 calories") is the answer: put it between ' +
  'bounds a few percent either side of it (700 becomes 660-740) and do not ' +
  'reconsider the figure itself. ' +
  '"confidence" is how precisely the words pin the food down — a named dish is ' +
  'high, "some rice and chicken" is low. Low is an honest answer, not a failure; ' +
  'the app has a cheaper way to price a vague meal and needs to be told when. ' +
  TRAILING_FIELDS +
  // Only on this path, where there is no photograph and the row would otherwise
  // be a name over an empty square. Dead last in the prompt, because the list of
  // ids is the biggest block of text here; the key itself is declared up in the
  // schema, which is where a model reads one from.
  ' ' +
  ICON_INSTRUCTION

/** The one line of context the text call gets. Exported with the prompt. */
export const describeUserMessage = (text: string): string => `The person typed: "${text}"`

/**
 * The text call: a typed meal, in the shape the photo call answers in.
 *
 * Everything downstream is the same code the camera path runs. What differs is
 * the authority: a photo has one witness and it is the model, where a sentence
 * was written by the person who ate the meal. What it states is the answer
 * rather than evidence, and the model's job is to name it searchably and price
 * the portion it was told about. The prompt says so twice, because a model
 * asked to identify food reaches for the average version of the dish.
 */
export async function describeMeal(
  text: string,
  mock: MockSteer | undefined,
  meter: Meter,
): Promise<Vision> {
  if (mockActive()) {
    if (mock?.fail === 'vision' || mock?.fail === 'all') throw new Error('mocked describe failure')
    if (mock?.vision) return shapeVision(mock.vision)
    // Enough to walk the flow offline: the text names the dish, a leading
    // number becomes the count, and the band is a plain serving.
    const trimmed = text.trim()
    const count = Math.min(12, Math.max(1, Number(trimmed.match(/^(\d+)\b/)?.[1] ?? 1)))
    // Empty text never reaches here, so the fallback names a string of digits
    // rather than standing in for a meal.
    const name = trimmed.replace(/^\d+\s*/, '').slice(0, 120) || 'A serving'
    return shapeVision({
      scene: 'single',
      items: [
        {
          name,
          specific_query: name,
          generic_query: name.split(' ').slice(-1)[0],
          count,
          components: [],
          serving_hint: '1 serving',
          kcal_low: 400 * count,
          kcal_high: 600 * count,
          confidence: 0.7,
          suggested_edits: ['Half portion', 'Add a fried egg', 'No rice'],
          // So a local run exercises the icon path, which only happens here.
          icon: 'nasi-lemak',
        },
      ],
    })
  }

  const raw = await chatJSON(
    meter,
    [
      { role: 'system', content: DESCRIBE_MEAL_PROMPT },
      { role: 'user', content: describeUserMessage(text) },
    ],
    2400,
  )
  return keepDishesWhole(text, shapeVision(raw))
}

/**
 * Anything that can join two foods in a sentence. A number counts, because "2
 * roti canai" is a plural on its own, and so does a slash.
 */
const JOINS_TWO_FOODS =
  /(\b(and|with|plus|dan|dengan|serta)\b|[,+&/]|\b(\d+|two|three|four|five|six|seven|eight|nine|ten|a couple|a few)\b)/i

/**
 * A dish the person named as one thing stays one thing.
 *
 * The prompt asks for this three ways and the model took dishes apart anyway.
 * The parts are what the entry is priced from, so an invented breakdown replaces
 * a catalogue figure for a real dish with a sum of guesses.
 *
 * Enforced rather than requested, which is possible only here: this is the one
 * path where the app knows exactly what the person wrote, so a sentence with
 * nothing that could join two foods had one food in it.
 *
 * Not applied to photographs, where there is no sentence to count and a mixed
 * plate genuinely has parts nobody named.
 */
function keepDishesWhole(text: string, vision: Vision): Vision {
  if (JOINS_TWO_FOODS.test(text)) return vision
  if (!vision.items.some((item) => item.components.length > 0)) return vision

  console.log(`[describe] "${text}" names one food; dropping an invented breakdown`)
  return {
    ...vision,
    items: vision.items.map((item) => ({ ...item, components: [] })),
  }
}

/**
 * One photo, one entry, enforced in code as well as asked of the model: a model
 * that split a tray anyway put four rows in the diary for one meal.
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
    // One meal, whatever it was made of.
    count: 1,
    // Each folded item becomes a component under its own name, priced by the
    // middle of its own band, so the resolver has a name to search and a size to
    // accept a match at.
    components: items
      .map((item) => ({
        name: item.name,
        count: 1,
        // The fold changes what a thing is called, not how heavy it was.
        grams: item.grams,
        kcal: Math.round((item.kcal_low + item.kcal_high) / 2),
        carbs_g: null,
        protein_g: null,
        fat_g: null,
      }))
      .slice(0, 8),
    grams: null,
    serving_hint: '1 meal',
    kcal_low: items.reduce((sum, item) => sum + item.kcal_low, 0),
    kcal_high: items.reduce((sum, item) => sum + item.kcal_high, 0),
    confidence: Math.min(...items.map((item) => item.confidence)),
    suggested_edits: primary.suggested_edits,
    // The biggest thing on the tray names the meal, so it draws it too. Failing
    // that, any part's drawing beats the empty square.
    icon: primary.icon ?? items.find((item) => item.icon)?.icon ?? null,
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
 * The tier-1 verifier: given the top search hits, which of them is the
 * photographed dish? An index into `candidates`, or null. Zero candidates never
 * reaches here; the caller folds that into the same "no match" outcome.
 */
export async function pickCandidate(
  item: VisionItem,
  candidates: Candidate[],
  mock: MockSteer | undefined,
  meter: Meter,
): Promise<number | null> {
  if (mockActive()) {
    if (mock?.fail === 'all') throw new Error('mocked pick failure')
    if (mock?.pick === 'none') return null
    if (typeof mock?.pick === 'number') return mock.pick < candidates.length ? mock.pick : null
    // Prefer the candidate whose kcal sits inside the band, else the first:
    // deterministic, and exercises the paths a real pick would.
    const inBand = candidates.findIndex(
      (c) => c.kcal >= item.kcal_low * 0.75 && c.kcal <= item.kcal_high * 1.25,
    )
    return inBand >= 0 ? inBand : 0
  }

  const raw = await chatJSON(
    meter,
    [
      {
        role: 'system',
        content:
          'You match a described dish to a food catalogue. Respond with JSON only: ' +
          '{"choice": number|null}. `choice` is the 0-based index of the entry that IS the ' +
          'described dish, or null if none of them is. Prefer null over a near-miss: a ' +
          'different dish with similar ingredients is NOT a match. A branded or restaurant ' +
          'version of the SAME dish is a match — the dish is what matters, not the vendor. ' +
          'FORM is not the vendor and does matter: a bottled, canned, instant or powdered ' +
          'version of a drink is NOT a match for one made fresh, and the serving label is ' +
          'what says which an entry is ("1 bottle (250 g)" against "Regular (350 ml)").',
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
 * Tier 4: nutrition from model knowledge. A separate call made only after the
 * catalogue has failed, since the vision call returns no nutrients, so a good
 * catalogue match can never be averaged against a model opinion.
 */
export async function estimateNutrition(
  item: VisionItem,
  mock: MockSteer | undefined,
  meter: Meter,
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
    meter,
    [
      {
        role: 'system',
        content:
          'You estimate nutrition for a dish. Respond with JSON only: {"kcal": number, ' +
          '"carbs_g": number, "protein_g": number, "fat_g": number, "fibre_g": number|null, ' +
          '"sugar_g": number|null, "sodium_mg": number|null}. Values are for the stated ' +
          'portion. null means unknown — never guess fibre, sugar or sodium as 0. ' +
          // The weight is the one part of the question that is not a guess.
          'When a weight is given, it is the portion: price that many grams and no more — ' +
          'cooked rice and noodles about 1.3 kcal/g, grilled meat 1.5-2, fried chicken with ' +
          'skin 2.5-3, vegetables 0.3, nuts and crisps 5.5. Nothing edible is over 9.',
      },
      {
        role: 'user',
        content:
          `${item.count > 1 ? `${item.count} × ` : ''}${item.name}` +
          `, portion: ${item.serving_hint ?? '1 serving'}` +
          (item.grams ? `, about ${item.grams} g${item.count > 1 ? ' each' : ''}` : '') +
          '.' +
          // The visible parts pin the estimate to the actual plate: "nasi
          // campur" alone could be anything.
          //
          // The vision call's calorie range is deliberately not passed, which is
          // the point of this being a second call. Anchored with "expected
          // around 400-500 kcal" the model answered 450 for a plate of apple
          // slices; without the anchor it answered 120, which is what nine
          // slices cost.
          (item.components.length
            ? ` Contains: ${item.components
                .map(
                  (c) =>
                    `${c.count > 1 ? `${c.count} × ` : ''}${c.name}${c.grams ? ` (${c.grams} g each)` : ''}`,
                )
                .join(', ')}.`
            : ''),
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
  /**
   * The breakdown, with its numbers. Names alone left the model guessing a
   * delta for a part whose size it had not been told: "I left half the rice"
   * came back -150 for a 340 kcal portion and -150 for a 90 kcal one. `kcal` is
   * what the part costs at its current quantity.
   */
  ingredients: Array<{ name: string; quantity: number; kcal: number }>
}

function shapeInterpretation(raw: unknown): Interpretation {
  const o = (raw ?? {}) as Record<string, unknown>
  if (o.action === 'quantity') {
    const factor = Number(o.factor)
    if (Number.isFinite(factor) && factor > 0 && factor <= 10) return { action: 'quantity', factor }
    return { action: 'none', code: 'unusable', reason: 'unusable quantity' }
  }
  if (o.action === 'adjust') {
    const delta = Number(o.kcal_delta)
    const name = String(o.name ?? '')
      .trim()
      .slice(0, 120)
    const part = String(o.part ?? '')
      .trim()
      .slice(0, 120)
    const replaces = String(o.replaces ?? '')
      .trim()
      .slice(0, 120)
    const count = Number(o.count)
    const total = Number(o.total)
    const partKcal = Number(o.part_kcal)
    // A swap is the one adjustment that may cost nothing: chicken for chicken
    // of a different kind can come out even, and the plate still has to change.
    const swapping = Boolean(part && replaces && replaces.toLowerCase() !== part.toLowerCase())
    // A stated count is a change on its own, delta or no delta. "Only 3
    // skewers" against six halves the plate, and the model reasonably answers 0
    // for a field it has been told is about calories, so requiring a non-zero
    // delta threw the whole correction away.
    const counted = Number.isFinite(count) && count !== 0
    const stated = Number.isFinite(total) && total > 0
    const acts = delta !== 0 || swapping || counted || stated
    if (Number.isFinite(delta) && acts && Math.abs(delta) <= 2000 && name) {
      return {
        action: 'adjust',
        kcal_delta: Math.round(delta),
        name,
        part: part || null,
        replaces: swapping ? replaces : null,
        part_kcal:
          swapping && Number.isFinite(partKcal) && partKcal > 0 && partKcal <= 5000
            ? Math.round(partKcal)
            : null,
        count: counted && Math.abs(count) <= 20 ? Math.round(count) : null,
        // Zero is not a total: "no sambal" is a removal, which the delta says.
        total: stated && total <= 20 ? Math.round(total) : null,
      }
    }
    return { action: 'none', code: 'unusable', reason: 'unusable adjustment' }
  }
  if (o.action === 'redescribe' && o.item) {
    const item = shapeVision({ scene: 'single', items: [o.item] }).items[0]
    return { action: 'redescribe', item }
  }
  // The model's own "nothing to change here" carries a reason it wrote.
  // Anything else landing here is a shape this function does not recognise.
  return o.action === 'none'
    ? { action: 'none', code: 'not_a_correction', reason: String(o.reason ?? 'no calorie change') }
    : { action: 'none', code: 'unusable', reason: 'not understood' }
}

/**
 * The fix-by-typing prompt. Exported for the eval harness.
 *
 * A ladder rather than four options. Offered as a menu the model reached for
 * `redescribe` whenever it was unsure, and that is the one answer discarding
 * everything the user has already accepted: "this was more like 500 calories"
 * re-guessed a dish nobody said was wrong.
 *
 * So the rungs are ordered by how much of the entry survives them, the model
 * stops at the first that fits, and the bottom rung is described by its cost.
 */
export const INTERPRET_INSTRUCTION_PROMPT =
  'A user is correcting ONE logged food entry by typing. Decide what the correction ' +
  'means and respond with JSON only.\n\n' +
  'Work down this list and STOP at the first case that fits. The order is not a ' +
  'preference: each step keeps more of the entry than the one below it, and everything ' +
  'about the entry except the thing just typed is something the user has already ' +
  'accepted.\n\n' +
  '1. {"action":"none","reason":string} — the text is not a correction to this food, or ' +
  'it has no calorie consequence: "extra spicy", "more chilli", "no ice", "it was tasty", ' +
  '"remind me to buy milk". Flavour, temperature and cooking style are not calories.\n\n' +
  '2. {"action":"quantity","factor":number} — the amount of the WHOLE entry changed and ' +
  'nothing else did. `factor` multiplies the amount CURRENTLY logged, which is the ' +
  'number the user is looking at.\n' +
  '   - "half portion", "I only ate half of it" -> 0.5.\n' +
  '   - "I had two of these" means two IN TOTAL: with current quantity Q, return 2/Q.\n' +
  '   - A calorie total for the whole dish is an AMOUNT, not a different dish: "this was ' +
  'more like 500 calories" against an entry of 780 kcal is 500/780 = 0.64. Disagreeing ' +
  'with the number is never a reason to re-identify the food.\n' +
  '   - Not this when the text names one of the Ingredients listed below: rescaling the ' +
  'entry rescales the parts nobody mentioned too.\n\n' +
  '3. {"action":"adjust","kcal_delta":number,"name":string,"part":string|null,' +
  '"replaces":string|null,"part_kcal":number|null,"count":number|null,' +
  '"total":number|null} — the same meal with ' +
  'ONE part added, removed, resized or swapped. This is the answer for nearly every real ' +
  'correction.\n' +
  '   - `part`: the food the correction is about. For a removal or a resize, copy the ' +
  'name from the Ingredients list EXACTLY. For an addition or a swap, it is the name of ' +
  'the food coming IN ("fried egg", "rendang chicken") and NOT the one being corrected. ' +
  'Null only when no part answers to the change and it is about the dish as a whole.\n' +
  '   - A SWAP is one part turning out to be a different food, and it needs three ' +
  'fields together: `replaces` is the listed ingredient that was wrong, copied exactly; ' +
  '`part` is what it actually was; `part_kcal` is what THAT food costs at the count the ' +
  'listed one is logged at. The two names are never the same string — if you would ' +
  'write the same text in both, this is not a swap. Against a listed "Fried chicken ' +
  '(thigh) x 1 = 247 kcal", "it was rendang chicken not fried chicken" is replaces ' +
  '"Fried chicken (thigh)", part "rendang chicken", part_kcal 280. Give the food\'s own ' +
  'cost there, not a difference — arithmetic against the old figure is where this goes ' +
  'wrong. `replaces` and `part_kcal` are null for every other kind of adjustment.\n' +
  '   - `kcal_delta`: the calorie change for THAT PART ALONE and never for the meal — ' +
  'negative for a removal, positive for an addition, and for a swap the new food minus ' +
  'the old one (`part_kcal` is what actually gets used there). The ' +
  'Ingredients list gives what each part costs at its current count, so half of a 340 ' +
  'kcal rice is -170 and dropping a 60 kcal sambal is -60. An addition nobody sized is ' +
  'about +75 for an egg, +130 for a sweet drink.\n' +
  '   - `count` / `total`: how many, in whichever way the user said it. `count` is a ' +
  'CHANGE ("two more skewers" is 2, "one less egg" is -1). `total` is an AMOUNT ("only 3 ' +
  'skewers", "there were 3 eggs", "only 1 chicken wing" are 3, 3 and 1). "only N" is ' +
  'always `total` N — do not subtract your way to it. Never both, and null for each when ' +
  'the user gave no number.\n' +
  '   - `name`: the corrected dish name, still recognisably this meal — "Nasi lemak, no ' +
  'sambal", "Nasi lemak with rendang chicken". Not a new dish.\n' +
  '   Less of an INGREDIENT is an adjustment even when the words sound like taste: ' +
  '"less sugar", "kurang manis", "no santan", "no oil", "skip the gravy" all take ' +
  'calories out and belong here — about -60 for the sugar in a sweet drink, -100 for ' +
  'the santan in a bowl of laksa. Only a change with nothing to subtract ("extra ' +
  'spicy", "more chilli") is case 1.\n\n' +
  '4. {"action":"redescribe","item":{"name":string,"specific_query":string,' +
  '"generic_query":string,"count":number,"grams":number|null,' +
  '"components":[{"name":string,"count":number,"grams":number,' +
  '"kcal":number,"carbs_g":number|null,"protein_g":number|null,' +
  '"fat_g":number|null}],"serving_hint":string|null,' +
  '"kcal_low":number,"kcal_high":number,"confidence":number,"suggested_edits":[]}} — ' +
  'the dish IDENTITY was wrong: what is logged is not the food that was eaten. "it was ' +
  'actually hokkien mee", "this is nasi kandar not nasi lemak".\n' +
  '   This is the expensive answer and the last one. It DISCARDS the breakdown and ' +
  're-prices the meal from nothing, so every part the user did not mention is guessed ' +
  'again and may come back different. Choose it only when no version of the current ' +
  'entry is the right food. A wrong amount, a wrong side, a wrong number of something ' +
  'and a wrong calorie figure are all corrections to THIS entry, not new dishes. ' +
  'Describe the correct dish as eaten and bound its calories tightly. Weigh every part ' +
  'first — "grams" is what ONE of it weighs, edible parts only — and price the weight: ' +
  'cooked rice and noodles are about 1.3 kcal/g, grilled meat 1.5-2, fried chicken 2.5-3, ' +
  'vegetables 0.3, and nothing on a plate is over 6 kcal/g.'

/**
 * The entry state, as the interpreter is shown it. Each part carries its count
 * and what it costs at that count, so a delta for "half the rice" is arithmetic
 * rather than recall.
 */
export const refineUserMessage = (context: RefineContext, instruction: string): string =>
  `Current entry: ${context.name} — ${context.kcal} kcal, quantity ${context.quantity}` +
  `${context.servingLabel ? ` × ${context.servingLabel}` : ''}` +
  (context.ingredients.length
    ? `\nIngredients (name × count = kcal):\n${context.ingredients
        .map((part) => `- ${part.name} × ${part.quantity} = ${Math.round(part.kcal)} kcal`)
        .join('\n')}`
    : '\nThis entry has no ingredient breakdown.') +
  `\n\nUser typed: "${instruction}"`

/**
 * How much room the interpreter is given to answer in.
 *
 * It was 600, which is the bug behind "Could not fix that, try rewording it".
 * The bottom rung asks for a whole `VisionItem`, the same shape `analysePhoto`
 * gets 2400 for, so the call ended `finish_reason: length` with no content and
 * the screen blamed corrections that were fine.
 *
 * The ceiling is not a bill: tokens are charged as generated, so a small number
 * only buys that failure.
 */
const INTERPRET_MAX_TOKENS = 2400

/**
 * The fix-by-typing interpreter: entry state and free text in, one decision out.
 * Text-only and cheap; search and estimation only happen when the answer is
 * `redescribe`, and then it is the same cascade a fresh scan runs.
 */
export async function interpretInstruction(
  context: RefineContext,
  instruction: string,
  mock: MockSteer | undefined,
  meter: Meter,
): Promise<Interpretation> {
  if (mockActive()) {
    if (mock?.fail === 'all' || mock?.fail === 'interpret')
      throw new Error('mocked interpret failure')
    if (mock?.interpret) return shapeInterpretation(mock.interpret)
    // Crude defaults so the flow is walkable offline: portion words become
    // factors, add and remove words become small deltas, anything else
    // re-describes the dish with the instruction folded into the name.
    const text = instruction.toLowerCase()
    // A named part with a number in front of it: "only 3 skewers". Checked
    // before the portion words, because "only 2 skewers" contains "2" and
    // reading that as the plate rescales everything else on it.
    const named = context.ingredients.find((ingredient) =>
      text.includes(ingredient.name.toLowerCase().split(' ')[0]),
    )?.name
    const stated = Number(text.match(/\b(?:only|just)\s+(\d+)\b/)?.[1] ?? 0)
    if (!named) {
      if (/\bhalf\b/.test(text)) return { action: 'quantity', factor: 0.5 }
      if (/\bdouble\b|\btwo\b|\b2\b/.test(text)) return { action: 'quantity', factor: 2 }
    }
    if (named && stated > 0) {
      return {
        action: 'adjust',
        kcal_delta: -60,
        name: `${context.name}, ${instruction}`.slice(0, 120),
        part: named,
        replaces: null,
        part_kcal: null,
        count: null,
        total: stated,
      }
    }
    if (/\bno\b|\bwithout\b|\bremove\b/.test(text)) {
      return {
        action: 'adjust',
        kcal_delta: -60,
        name: `${context.name}, ${instruction}`.slice(0, 120),
        // The part named in the text, if the entry has one by that name.
        part: named ?? null,
        replaces: null,
        part_kcal: null,
        count: null,
        total: null,
      }
    }
    if (/\badd\b|\bextra\b|\bwith\b/.test(text)) {
      return {
        action: 'adjust',
        kcal_delta: 80,
        name: `${context.name}, ${instruction}`.slice(0, 120),
        part: instruction.replace(/\b(add|extra|with|an|a)\b/gi, '').trim() || null,
        replaces: null,
        part_kcal: null,
        count: Number(text.match(/\b(\d+)\b/)?.[1] ?? 0) || null,
        total: null,
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
            count: 1,
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

  /**
   * Asked twice when the first answer was unreadable, and only then.
   *
   * `chatJSON` retries the transport but not a bad parse, on the argument that
   * the same question buys the same answer. That is right for a vision call and
   * wrong here: "Could not apply that" for a sentence the model answered in the
   * wrong shape sends somebody away to reword a correction that was fine.
   *
   * A considered `not_a_correction` is not retried, since that is an answer.
   */
  const ask = async () =>
    shapeInterpretation(
      await chatJSON(
        meter,
        [
          { role: 'system', content: INTERPRET_INSTRUCTION_PROMPT },
          { role: 'user', content: refineUserMessage(context, instruction) },
        ],
        INTERPRET_MAX_TOKENS,
      ),
    )

  const first = await ask()
  if (first.action !== 'none' || first.code !== 'unusable') return first
  return ask().catch(() => first)
}

/**
 * There was an `Archetype` type and a `classifyArchetype` call here: tier 5, a
 * classification over sixty seeded generic rows ending at a hardcoded "Mixed
 * meal" of 600 kcal.
 *
 * They are gone and the cascade has no floor. The floor guaranteed a diary row,
 * at the cost of that row being a guess nobody made sitting in somebody's day
 * wearing their photograph. A scan that cannot say what the food is now says so.
 * See the note at the top of `cascade.ts`.
 */
