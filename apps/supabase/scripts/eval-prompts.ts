/**
 * The prompt eval harness.
 *
 *   OPENROUTER_API_KEY=… deno run -A apps/supabase/scripts/eval-prompts.ts
 *   … eval-prompts.ts describe          # just the typed-meal suite
 *   … eval-prompts.ts refine            # just the fix-by-typing suite
 *   … eval-prompts.ts recipe            # just the typed-recipe suite
 *   … eval-prompts.ts suggest           # just the what-to-eat suite
 *   … eval-prompts.ts refine 3          # three runs of each case
 *
 * WHY THIS EXISTS
 *
 * Four of the model calls decide something the code below them cannot check.
 * `describeMeal` decides what a sentence names and how much of it there was;
 * `interpretInstruction` decides whether a correction is a portion change, a
 * part change or a different dish; `describeRecipe` decides what a pot holds
 * and how it is cooked; `suggestMeals` decides what somebody could eat next.
 * Each is a paragraph of English with no test around it, and each was changed by
 * hand more than once on the strength of a single example that happened to be on
 * screen at the time.
 *
 * So the cases below are the examples, written down. They assert the SHAPE of
 * the answer — which action, how many components, whether the count matched,
 * whether the calorie band brackets a sane figure — and never an exact number,
 * because the model is sampled and the cascade underneath is what turns a band
 * into calories. A case that fails is either a prompt to fix or an expectation
 * that was wrong; both are worth arguing with, which is more than the prompt
 * had before.
 *
 * The prompts are IMPORTED, not copied. A harness with its own copy grades a
 * prompt nobody ships.
 *
 * THE KEY
 *
 * `OPENROUTER_API_KEY` normally lives only in the project's function secrets,
 * so a machine that never deploys does not have one. `EVAL_ENDPOINT` (plus
 * `EVAL_TOKEN`) is the way out: point it at anything that takes
 * `{system, user, max_tokens}` and answers with an OpenAI-shaped completion,
 * and the suite runs against the deployed key instead of a local one.
 */

import { resolveIcon } from '../functions/_shared/icons.ts'
import {
  DESCRIBE_MEAL_PROMPT,
  describeUserMessage,
  INTERPRET_INSTRUCTION_PROMPT,
  type RefineContext,
  refineUserMessage,
} from '../functions/_shared/llm.ts'
import { DESCRIBE_RECIPE_PROMPT, describeRecipeUserMessage } from '../functions/_shared/recipe.ts'
import {
  type DayContext,
  PICK_COUNT,
  SUGGEST_MEAL_PROMPT,
  suggestUserMessage,
} from '../functions/_shared/suggest.ts'

const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'qwen/qwen3.7-flash'
const ENDPOINT = Deno.env.get('EVAL_ENDPOINT')
const KEY = Deno.env.get('OPENROUTER_API_KEY')

async function call(system: string, user: string, maxTokens: number): Promise<unknown> {
  const body = ENDPOINT
    ? { system, user, max_tokens: maxTokens, model: MODEL }
    : {
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        // The same as the pipeline sends. An eval that graded a prompt against
        // a reasoning model would be grading something the app never runs.
        reasoning: { enabled: false },
      }

  // Running a whole suite fires more requests a minute than a scan ever will,
  // so the provider throttles — and a 429 charged to the prompt would read as
  // the model getting a case wrong. Backing off is the harness's problem.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT ?? 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ENDPOINT ? (Deno.env.get('EVAL_TOKEN') ?? '') : KEY}`,
        'Content-Type': 'application/json',
        ...(Deno.env.get('EVAL_APIKEY') ? { apikey: Deno.env.get('EVAL_APIKEY') as string } : {}),
      },
      body: JSON.stringify(body),
    })
    const payload = await res.json()
    // The proxy wraps the completion; OpenRouter is the completion.
    const completion = ENDPOINT ? payload.body : payload
    const text: string = completion?.choices?.[0]?.message?.content ?? ''
    if (text.trim()) {
      return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
    }
    const status = Number(payload?.status ?? res.status ?? 0)
    const rateLimited = status === 429 || status >= 500 || completion?.error?.code === 429
    if (!rateLimited || attempt >= 4) {
      throw new Error(`no content: ${JSON.stringify(payload).slice(0, 220)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
}

// ---------------------------------------------------------------------------
// Grading
//
// A case names what it is checking, so a failure reads as a sentence about the
// model rather than as a diff of two JSON blobs.
// ---------------------------------------------------------------------------

type Check = { label: string; ok: boolean; got: string }
type Case<T> = { text: string; checks: (answer: T) => Check[] }

const check = (label: string, ok: boolean, got: unknown): Check => ({
  label,
  ok,
  got: typeof got === 'string' ? got : JSON.stringify(got),
})

// ---------------------------------------------------------------------------
// Suite 1: a typed meal
// ---------------------------------------------------------------------------

type DescribeAnswer = {
  no_food?: boolean
  items?: Array<{
    name?: string
    count?: number
    components?: Array<{ name?: string; count?: number; kcal?: number }>
    serving_hint?: string | null
    kcal_low?: number
    kcal_high?: number
    confidence?: number
    suggested_edits?: string[]
    /** A name out of our own icon set, or null. Graded in `universal`. */
    icon?: string | null
  }>
}

/** The single item, or a stand-in that fails every check about one. */
const only = (answer: DescribeAnswer) => answer.items?.[0] ?? {}
const band = (answer: DescribeAnswer): [number, number] => {
  const item = only(answer)
  return [Number(item.kcal_low ?? 0), Number(item.kcal_high ?? 0)]
}
/** The band brackets a figure we would accept — generously, it is a band. */
const brackets = (answer: DescribeAnswer, low: number, high: number): boolean => {
  const [a, b] = band(answer)
  return b >= low && a <= high
}
const partCount = (answer: DescribeAnswer) => only(answer).components?.length ?? 0
const named = (answer: DescribeAnswer, word: string) =>
  (only(answer).components ?? []).some((c) => (c.name ?? '').toLowerCase().includes(word))

/**
 * What every typed meal has to get right, whatever it was.
 *
 * These are the failures that are invisible one case at a time: a band with
 * the same number at both ends, a breakdown of one part, no edit chips. Each
 * one shipped at some point because the case in front of the person changing
 * the prompt happened not to show it.
 */
const universal = (answer: DescribeAnswer): Check[] => {
  if (answer.no_food) return []
  const item = only(answer)
  const [low, high] = band(answer)
  const parts = item.components ?? []
  const sum = parts.reduce((total, part) => total + (part.kcal ?? 0) * (part.count ?? 1), 0)
  return [
    check('one item', (answer.items?.length ?? 0) === 1, answer.items?.length),
    check('a band, not a point', high > low, [low, high]),
    check(
      'never exactly one part',
      parts.length !== 1,
      parts.map((p) => p.name),
    ),
    check('edit chips offered', (item.suggested_edits?.length ?? 0) > 0, item.suggested_edits),
    // A typed meal has no photograph, so this drawing is the only picture the
    // row will ever have. Same rule as the recipe suite's: an explicit null is
    // a real answer, a missing key is the regression — the icon lived in prose
    // and in no schema for a while and came back about half the time.
    check(
      'the icon is one of ours',
      item.icon === null || (item.icon !== undefined && resolveIcon(item.icon) !== null),
      item.icon === undefined ? 'the key is missing' : (item.icon ?? 'null'),
    ),
    // A tenth of slack, because the parts are what the app actually prices the
    // meal from and the band only steers the fallback tiers. What this is for
    // is the 60% disagreements — a nasi kandar bounded at 650-850 whose four
    // parts added to 405, which means four underpriced parts — not the 4% ones.
    ...(parts.length
      ? [
          check('band holds the parts', sum >= low * 0.9 && sum <= high * 1.1, {
            sum,
            band: [low, high],
          }),
        ]
      : []),
  ]
}

const DESCRIBE_CASES: Array<Case<DescribeAnswer>> = [
  {
    text: 'nasi lemak',
    checks: (a) => [
      ...universal(a),
      check('no invented parts', partCount(a) === 0, partCount(a)),
      check('count 1', only(a).count === 1, only(a).count),
      check('350-700 kcal', brackets(a, 350, 700), band(a)),
    ],
  },
  {
    text: '2 roti canai with dhal',
    checks: (a) => [
      ...universal(a),
      check('two of the roti', only(a).count === 2 || named(a, 'roti'), {
        count: only(a).count,
        parts: only(a).components,
      }),
      check('400-900 kcal', brackets(a, 400, 900), band(a)),
    ],
  },
  {
    text: 'half a plate of char kuey teow',
    checks: (a) => [
      ...universal(a),
      check('priced as half', brackets(a, 200, 420), band(a)),
      check(
        'portion said in the hint',
        /half/i.test(only(a).serving_hint ?? ''),
        only(a).serving_hint,
      ),
    ],
  },
  {
    text: 'chicken rice with extra egg and a teh tarik',
    checks: (a) => [
      ...universal(a),
      check(
        'three parts',
        partCount(a) === 3,
        only(a).components?.map((c) => c.name),
      ),
      check(
        'the drink is one of them',
        named(a, 'teh'),
        only(a).components?.map((c) => c.name),
      ),
      check('600-1100 kcal', brackets(a, 600, 1100), band(a)),
    ],
  },
  {
    text: '3 durian seeds',
    checks: (a) => [
      ...universal(a),
      check('count 3', only(a).count === 3, only(a).count),
      check('not split into parts', partCount(a) === 0, partCount(a)),
    ],
  },
  {
    text: '200g grilled chicken breast',
    checks: (a) => [
      ...universal(a),
      check('250-400 kcal', brackets(a, 250, 400), band(a)),
      check(
        'weight kept in the hint',
        /200\s*g/i.test(only(a).serving_hint ?? ''),
        only(a).serving_hint,
      ),
    ],
  },
  {
    text: 'a 250 kcal protein bar',
    checks: (a) => [
      ...universal(a),
      check('brackets 250', brackets(a, 240, 260), band(a)),
      check('tight band', band(a)[1] - band(a)[0] <= 120, band(a)),
    ],
  },
  {
    text: 'how many calories in nasi lemak?',
    checks: (a) => [
      check('not a logged meal', a.no_food === true, a.no_food ?? a.items?.[0]?.name),
    ],
  },
  {
    text: 'big mac meal with large fries and a coke',
    checks: (a) => [
      ...universal(a),
      check(
        'three parts',
        partCount(a) === 3,
        only(a).components?.map((c) => c.name),
      ),
      check('900-1500 kcal', brackets(a, 900, 1500), band(a)),
    ],
  },
  {
    text: 'nasi kandar with fried chicken, egg and vegetables',
    checks: (a) => [
      ...universal(a),
      check(
        'at least three parts',
        partCount(a) >= 3,
        only(a).components?.map((c) => c.name),
      ),
      check('600-1300 kcal', brackets(a, 600, 1300), band(a)),
    ],
  },
  {
    text: 'small bowl of oats with milk and a banana',
    checks: (a) => [
      ...universal(a),
      check(
        'parts listed',
        partCount(a) >= 2,
        only(a).components?.map((c) => c.name),
      ),
      check('200-500 kcal', brackets(a, 200, 500), band(a)),
    ],
  },
  {
    text: 'teh o ais limau',
    checks: (a) => [
      ...universal(a),
      check('a drink, not a meal', brackets(a, 30, 200), band(a)),
      check('not split into parts', partCount(a) === 0, partCount(a)),
    ],
  },
  {
    text: 'two slices of pepperoni pizza',
    checks: (a) => [
      ...universal(a),
      check('count 2', only(a).count === 2, only(a).count),
      check('400-800 kcal', brackets(a, 400, 800), band(a)),
    ],
  },
  {
    text: 'just some rice and chicken, not sure how much',
    checks: (a) => [
      ...universal(a),
      check('low confidence', (only(a).confidence ?? 1) <= 0.6, only(a).confidence),
      check('300-900 kcal', brackets(a, 300, 900), band(a)),
    ],
  },
  {
    text: 'maggi goreng with an egg',
    checks: (a) => [
      ...universal(a),
      check(
        'two parts',
        partCount(a) === 2,
        only(a).components?.map((c) => c.name),
      ),
      check('450-900 kcal', brackets(a, 450, 900), band(a)),
    ],
  },
  {
    text: 'i had roughly 700 calories of mixed rice for lunch',
    checks: (a) => [
      ...universal(a),
      check('brackets 700', brackets(a, 680, 720), band(a)),
      check('tight band', band(a)[1] - band(a)[0] <= 250, band(a)),
    ],
  },
  {
    text: 'nasi goreng kampung, extra pedas',
    checks: (a) => [
      ...universal(a),
      check(
        'one dish, not split by the spice',
        partCount(a) === 0,
        only(a).components?.map((c) => c.name),
      ),
      check('450-900 kcal', brackets(a, 450, 900), band(a)),
    ],
  },
  {
    text: '2 telur separuh masak with kaya toast and kopi o',
    checks: (a) => [
      ...universal(a),
      check(
        'three parts',
        partCount(a) === 3,
        only(a).components?.map((c) => c.name),
      ),
      check('250-700 kcal', brackets(a, 250, 700), band(a)),
    ],
  },
  {
    text: '5 pieces of fried wanton',
    checks: (a) => [
      ...universal(a),
      check('count 5', only(a).count === 5, only(a).count),
      check('not split into parts', partCount(a) === 0, partCount(a)),
      check('200-500 kcal', brackets(a, 200, 500), band(a)),
    ],
  },
  {
    text: 'a bowl of white rice, about 1 cup',
    checks: (a) => [
      ...universal(a),
      check('150-300 kcal', brackets(a, 150, 300), band(a)),
      check('the cup is kept', /cup|bowl/i.test(only(a).serving_hint ?? ''), only(a).serving_hint),
    ],
  },
  {
    text: 'makan nasi ayam tadi',
    checks: (a) => [
      ...universal(a),
      check('read as chicken rice', /ayam|chicken/i.test(only(a).name ?? ''), only(a).name),
      check('400-900 kcal', brackets(a, 400, 900), band(a)),
    ],
  },
  {
    text: 'nasi lemk',
    checks: (a) => [
      ...universal(a),
      check('typo still finds the dish', /lemak/i.test(only(a).name ?? ''), only(a).name),
    ],
  },
  {
    text: 'chicken chop with black pepper sauce and fries',
    checks: (a) => [
      ...universal(a),
      check(
        'parts listed',
        partCount(a) >= 2,
        only(a).components?.map((c) => c.name),
      ),
      check('600-1200 kcal', brackets(a, 600, 1200), band(a)),
    ],
  },
  {
    text: 'i drank a bottle of 100 plus',
    checks: (a) => [
      ...universal(a),
      check('a soft drink, not a meal', brackets(a, 60, 260), band(a)),
    ],
  },
  {
    text: 'sushi, 8 pieces',
    checks: (a) => [
      ...universal(a),
      check('count 8', only(a).count === 8, only(a).count),
      check('250-700 kcal', brackets(a, 250, 700), band(a)),
    ],
  },
  {
    text: 'thanks!',
    checks: (a) => [check('not a logged meal', a.no_food === true, a.no_food ?? only(a).name)],
  },
]

// ---------------------------------------------------------------------------
// Suite 2: a correction typed against a logged entry
// ---------------------------------------------------------------------------

type Interpretation = {
  action?: string
  factor?: number
  kcal_delta?: number
  part?: string | null
  replaces?: string | null
  part_kcal?: number | null
  count?: number | null
  total?: number | null
  name?: string
  item?: { name?: string }
  reason?: string
}

/** A decomposed plate: the shape most corrections are typed against. */
const PLATE: RefineContext = {
  name: 'Nasi lemak with fried chicken',
  kcal: 780,
  quantity: 1,
  servingLabel: '1 plate',
  ingredients: [
    { name: 'coconut rice', quantity: 1, kcal: 340 },
    { name: 'fried chicken wing', quantity: 2, kcal: 250 },
    { name: 'sambal', quantity: 1, kcal: 60 },
    { name: 'boiled egg', quantity: 1, kcal: 70 },
  ],
}

/** A sweet drink: where "kurang manis" is actually typed. */
const DRINK: RefineContext = {
  name: 'Teh tarik',
  kcal: 180,
  quantity: 1,
  servingLabel: '1 glass',
  ingredients: [],
}

/** A dish with no breakdown at all — the other half of the corrections. */
const DISH: RefineContext = {
  name: 'Char kuey teow',
  kcal: 620,
  quantity: 1,
  servingLabel: '1 plate',
  ingredients: [],
}

type RefineCase = {
  context: RefineContext
  text: string
  checks: (answer: Interpretation) => Check[]
}

const action = (a: Interpretation, want: string) =>
  check(`action ${want}`, a.action === want, a.action)
const partIs = (a: Interpretation, word: string) =>
  check(`part is the ${word}`, (a.part ?? '').toLowerCase().includes(word), a.part)
const near = (value: number | null | undefined, target: number, slack: number) =>
  value !== null && value !== undefined && Math.abs(value - target) <= slack

const REFINE_CASES: RefineCase[] = [
  // -- The amount of the whole plate, in the three ways people say it.
  {
    context: PLATE,
    text: 'half portion',
    checks: (a) => [
      action(a, 'quantity'),
      check('factor 0.5', near(a.factor, 0.5, 0.01), a.factor),
    ],
  },
  {
    context: DISH,
    text: 'I only ate half of it',
    checks: (a) => [
      action(a, 'quantity'),
      check('factor 0.5', near(a.factor, 0.5, 0.05), a.factor),
    ],
  },
  {
    context: DISH,
    text: 'I had two plates',
    checks: (a) => [action(a, 'quantity'), check('factor 2', near(a.factor, 2, 0.01), a.factor)],
  },
  // A calorie total for the whole dish is an amount, not a new dish: scaling
  // the entry keeps the breakdown and moves all four macros together.
  {
    context: PLATE,
    text: 'this was more like 500 calories',
    checks: (a) => [
      action(a, 'quantity'),
      check('factor ~0.64', near(a.factor, 500 / 780, 0.08), a.factor),
    ],
  },
  // -- One part of the same plate.
  {
    context: PLATE,
    text: 'no sambal',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'sambal'),
      check('negative delta', (a.kcal_delta ?? 0) < 0, a.kcal_delta),
      check('delta is the sambal, not the plate', Math.abs(a.kcal_delta ?? 0) <= 150, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'add a fried egg',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'egg'),
      check('positive delta', (a.kcal_delta ?? 0) > 0, a.kcal_delta),
      check('an egg, not a meal', (a.kcal_delta ?? 0) <= 250, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'only 1 chicken wing',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'chicken'),
      check('total 1', a.total === 1, { total: a.total, count: a.count }),
    ],
  },
  {
    context: PLATE,
    text: 'two more wings',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'wing'),
      check('count 2', a.count === 2, { total: a.total, count: a.count }),
    ],
  },
  {
    context: PLATE,
    text: 'i left half the rice',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'rice'),
      check('negative delta', (a.kcal_delta ?? 0) < 0, a.kcal_delta),
      check('about half the rice', near(a.kcal_delta, -170, 120), a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'extra rice',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'rice'),
      check('positive delta', (a.kcal_delta ?? 0) > 0, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'add a teh tarik',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'teh'),
      check('a drink-sized delta', near(a.kcal_delta, 130, 90), a.kcal_delta),
    ],
  },
  // A part changed identity. Still the same plate, so still an adjustment —
  // re-describing it throws away the three parts nobody mentioned.
  {
    context: PLATE,
    text: 'it was rendang chicken not fried chicken',
    checks: (a) => [
      action(a, 'adjust'),
      check('the new food is the part', /rendang/i.test(a.part ?? ''), a.part),
      check('it replaces the wing', /chicken|wing/i.test(a.replaces ?? ''), a.replaces),
      // Priced absolutely, and rendang is not cheaper than fried chicken. As a
      // delta the same model answered -172 against a 250 kcal part.
      check('rendang priced like rendang', (a.part_kcal ?? 0) >= 200, a.part_kcal),
      check('the plate keeps its name', /nasi lemak/i.test(a.name ?? ''), a.name),
    ],
  },
  // -- A dish with no breakdown takes the same corrections.
  {
    context: DISH,
    text: 'no cockles',
    checks: (a) => [
      action(a, 'adjust'),
      check('negative delta', (a.kcal_delta ?? 0) < 0, a.kcal_delta),
      check('small delta', Math.abs(a.kcal_delta ?? 0) <= 150, a.kcal_delta),
    ],
  },
  {
    context: DISH,
    text: 'add an egg',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'egg'),
      check('positive delta', (a.kcal_delta ?? 0) > 0, a.kcal_delta),
    ],
  },
  // -- The dish really was something else.
  {
    // The main part of a plate turning out to be another dish. The model
    // answered this by copying the OLD name into `part` as well as into
    // `replaces`, which is not a swap and applied nothing.
    context: PLATE,
    text: 'it was duck rice not the chicken',
    checks: (a) => [
      action(a, 'adjust'),
      check('a swap', Boolean(a.replaces), { part: a.part, replaces: a.replaces }),
      check('the two names differ', a.part !== a.replaces, { part: a.part, replaces: a.replaces }),
      check('the new food is named', /duck/i.test(a.part ?? ''), a.part),
    ],
  },
  {
    context: DISH,
    text: 'it was actually hokkien mee',
    checks: (a) => [
      action(a, 'redescribe'),
      check('the new dish is named', /hokkien/i.test(a.item?.name ?? ''), a.item?.name),
    ],
  },
  {
    context: PLATE,
    text: 'this is nasi kandar not nasi lemak',
    checks: (a) => [
      action(a, 'redescribe'),
      check('the new dish is named', /kandar/i.test(a.item?.name ?? ''), a.item?.name),
    ],
  },
  // -- Nothing to apply.
  {
    context: PLATE,
    text: 'extra spicy',
    checks: (a) => [check('no calorie change', a.action === 'none', a.action)],
  },
  {
    context: DISH,
    text: 'remind me to buy milk',
    checks: (a) => [action(a, 'none')],
  },
  // -- Second wave: the corrections most likely to be read as a new dish.
  {
    context: PLATE,
    text: 'the chicken was grilled not fried',
    checks: (a) => [
      action(a, 'adjust'),
      check('a swap', Boolean(a.replaces), { part: a.part, replaces: a.replaces }),
      check('the two names differ', a.part !== a.replaces, { part: a.part, replaces: a.replaces }),
      check('grilled costs less than fried', (a.part_kcal ?? 999) < 250, a.part_kcal),
      check('the plate keeps its name', /nasi lemak/i.test(a.name ?? ''), a.name),
    ],
  },
  {
    context: PLATE,
    text: 'the egg was boiled not fried',
    checks: (a) => [
      action(a, 'adjust'),
      check('about the egg', /egg/i.test(`${a.part} ${a.replaces}`), {
        part: a.part,
        replaces: a.replaces,
      }),
    ],
  },
  {
    context: PLATE,
    text: 'double the rice',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'rice'),
      check('more, not less', (a.kcal_delta ?? 0) > 0, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'no chicken',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'chicken'),
      check('the wings come off', (a.kcal_delta ?? 0) < 0, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'no smabal',
    checks: (a) => [
      action(a, 'adjust'),
      check('typo still finds the part', /sambal/i.test(a.part ?? ''), a.part),
    ],
  },
  {
    context: DISH,
    text: 'hlaf portion',
    checks: (a) => [
      action(a, 'quantity'),
      check('factor 0.5', near(a.factor, 0.5, 0.05), a.factor),
    ],
  },
  {
    context: DISH,
    text: 'I shared it with my wife',
    checks: (a) => [
      action(a, 'quantity'),
      check('half of it', near(a.factor, 0.5, 0.05), a.factor),
    ],
  },
  {
    context: DISH,
    text: 'make it 800 calories',
    checks: (a) => [
      action(a, 'quantity'),
      check('factor ~1.29', near(a.factor, 800 / 620, 0.1), a.factor),
    ],
  },
  {
    context: PLATE,
    text: 'add 2 satay sticks',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'satay'),
      check('two of them', a.count === 2 || a.total === 2, { count: a.count, total: a.total }),
    ],
  },
  {
    context: DRINK,
    text: 'kurang manis',
    checks: (a) => [
      action(a, 'adjust'),
      check('a little less', (a.kcal_delta ?? 0) < 0 && (a.kcal_delta ?? 0) >= -140, a.kcal_delta),
    ],
  },
  {
    context: PLATE,
    text: 'there was no rice, just the chicken and sambal',
    checks: (a) => [
      action(a, 'adjust'),
      partIs(a, 'rice'),
      check('the rice comes off', (a.kcal_delta ?? 0) < 0, a.kcal_delta),
    ],
  },
  {
    context: DISH,
    text: 'it was 3 plates not 1',
    checks: (a) => [action(a, 'quantity'), check('factor 3', near(a.factor, 3, 0.05), a.factor)],
  },
]

// ---------------------------------------------------------------------------
// Suite 3: a recipe typed out
//
// The failures this catches are the ones that survive a single example. Asked
// for beef tacos the prompt answered "Nasi goreng kampung", and asked for coq
// au vin it answered nothing at all — both because the prompt described the app
// as Malaysian and the model read that as an instruction about the FOOD. Every
// Malaysian case passed throughout.
// ---------------------------------------------------------------------------

type RecipeAnswer = {
  name?: string
  servings?: number
  steps?: string
  /** A name out of our own icon set, or null. Graded below. */
  icon?: string | null
  ingredients?: Array<{
    name?: string
    amount?: number
    unit?: string
    kcal?: number
    carbs_g?: number
    protein_g?: number
    fat_g?: number
  }>
}

const parts = (answer: RecipeAnswer) => answer.ingredients ?? []
const potKcal = (answer: RecipeAnswer) =>
  parts(answer).reduce((total, part) => total + (part.kcal ?? 0), 0)
const stepLines = (answer: RecipeAnswer) =>
  (answer.steps ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** An ingredient whose name contains the word, if there is one. */
const ingredient = (answer: RecipeAnswer, word: RegExp) =>
  parts(answer).find((part) => word.test(part.name ?? ''))

/**
 * What every drafted recipe has to get right, whatever the dish was.
 *
 * The physical ones are worth more than they look. Nothing edible carries more
 * than about 9 kcal a gram, so an ingredient above that is a decimal point in
 * the wrong place, and macros heavier than the ingredient itself are the same
 * mistake wearing different units. `shapeIngredients` clamps both, but a prompt
 * that needs the clamp is a prompt that is drifting.
 */
const universalRecipe = (answer: RecipeAnswer): Check[] => {
  const list = parts(answer)
  const dense = list.filter(
    (part) =>
      (part.unit === 'g' || part.unit === 'ml') &&
      (part.kcal ?? 0) > 9.4 * Math.max(part.amount ?? 0, 0.01),
  )
  const heavy = list.filter((part) => {
    if (part.unit === 'piece') return false
    const grams = (part.carbs_g ?? 0) + (part.protein_g ?? 0) + (part.fat_g ?? 0)
    return grams > (part.amount ?? 0) * 1.02
  })
  const lines = stepLines(answer)

  return [
    // A name, not a caption. "A pot of curry on the stove" is what the photo
    // prompt used to answer and it is not what anybody searches for.
    check('the name is a dish', (answer.name ?? '').length <= 40, answer.name),
    check('3 to 15 ingredients', list.length >= 3 && list.length <= 15, list.length),
    check('everything has an amount', !list.some((p) => !((p.amount ?? 0) > 0)), list.length),
    check(
      'nothing denser than fat',
      dense.length === 0,
      dense.map((p) => p.name),
    ),
    check(
      'macros fit in the mass',
      heavy.length === 0,
      heavy.map((p) => p.name),
    ),
    check('three to six steps', lines.length >= 3 && lines.length <= 6, lines.length),
    // One instruction a line, which is how the screen draws them. A paragraph
    // in this field renders as a paragraph.
    check(
      'one instruction a line',
      lines.every((l) => l.length <= 150),
      Math.max(0, ...lines.map((l) => l.length)),
    ),
    check(
      'no numbering; the app numbers them',
      !lines.some((l) => /^(\d+[.)]|[-*•])\s/.test(l)),
      lines.find((l) => /^(\d+[.)]|[-*•])\s/.test(l)) ?? 'ok',
    ),
    // The steps are displayed, so the house rule about long dashes reaches them.
    check(
      'no long dashes',
      !/[—–]/.test(answer.steps ?? ''),
      answer.steps?.match(/[^\n]*[—–][^\n]*/)?.[0] ?? 'ok',
    ),
    // The drawing has to be one WE HAVE, and the KEY HAS TO BE THERE. Explicit
    // null passes: "nothing in the list is this dish" is a real answer, and the
    // form falls back to its pot. A missing key does not, and that distinction
    // is the whole check — the icon was described in prose and declared in no
    // schema for a while, and it came back about half the time. Graded as
    // "null or absent, either is fine" that regression is green.
    check(
      'the icon is one of ours',
      answer.icon === null || (answer.icon !== undefined && resolveIcon(answer.icon) !== null),
      answer.icon === undefined ? 'the key is missing' : (answer.icon ?? 'null'),
    ),
  ]
}

/** The whole pot, per serving, is somewhere a person would recognise. */
const perServing = (answer: RecipeAnswer, low: number, high: number): Check => {
  const each = Math.round(potKcal(answer) / Math.max(1, answer.servings ?? 1))
  return check(`${low}-${high} kcal a serving`, each >= low && each <= high, each)
}

/** An amount the cook stated is the answer, not a starting point. */
const kept = (answer: RecipeAnswer, word: RegExp, amount: number, unit: string): Check => {
  const hit = ingredient(answer, word)
  return check(
    `kept ${amount} ${unit} of ${word.source}`,
    Boolean(hit) && Math.abs((hit?.amount ?? 0) - amount) <= amount * 0.02 && hit?.unit === unit,
    hit ? `${hit.amount} ${hit.unit}` : 'missing',
  )
}

const RECIPE_CASES: Array<Case<RecipeAnswer>> = [
  // -- The home cuisine, which never broke and is here so a fix for the others
  // cannot quietly cost it.
  {
    text: 'Kari ayam. 600g chicken thigh, a tin of santan, 3 potatoes. Feeds 4.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named in Malay', /kari ayam|ayam/i.test(a.name ?? ''), a.name),
      check('feeds 4', a.servings === 4, a.servings),
      kept(a, /chicken|ayam/i, 600, 'g'),
      perServing(a, 250, 800),
    ],
  },
  {
    text: 'Rendang daging. 1kg beef, 400ml thick santan, kerisik, rempah.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named in Malay', /rendang/i.test(a.name ?? ''), a.name),
      // Nobody said how many it feeds, so it is read off a kilo of beef.
      check('feeds 4 to 8', (a.servings ?? 0) >= 4 && (a.servings ?? 0) <= 8, a.servings),
      kept(a, /beef|daging/i, 1000, 'g'),
      perServing(a, 400, 1100),
    ],
  },
  // -- Everywhere else. Each of these is a dish the Malaysian framing either
  // renamed or refused.
  {
    text: 'Beef tacos for 4. 500g minced beef, 12 corn tortillas, cheddar, salsa, sour cream.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named as tacos, not as nasi goreng', /taco/i.test(a.name ?? ''), a.name),
      kept(a, /tortilla/i, 12, 'piece'),
      perServing(a, 450, 1100),
    ],
  },
  {
    text: 'Coq au vin, feeds 6.',
    checks: (a) => [
      ...universalRecipe(a),
      // A dish named with no amounts at all. This came back empty for as long
      // as the "no food in it" escape was written loosely.
      check('named in French', /coq au vin/i.test(a.name ?? ''), a.name),
      check('feeds 6', a.servings === 6, a.servings),
      perServing(a, 350, 900),
    ],
  },
  {
    text: 'Spaghetti carbonara for 2. 200g spaghetti, 100g guanciale, 2 eggs, 50g pecorino.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named in Italian', /carbonara/i.test(a.name ?? ''), a.name),
      kept(a, /spaghetti|pasta/i, 200, 'g'),
      perServing(a, 550, 1100),
    ],
  },
  {
    text: 'Thai green curry with chicken, feeds 4. 500g chicken, 400ml coconut milk, green curry paste, aubergine.',
    checks: (a) => [
      ...universalRecipe(a),
      // Answered "Kari hijau ayam" while the prompt described the app rather
      // than the dish.
      check('not translated into Malay', !/kari/i.test(a.name ?? ''), a.name),
      kept(a, /coconut/i, 400, 'ml'),
      perServing(a, 300, 800),
    ],
  },
  {
    text: 'Chicken shawarma wraps for 4, with garlic sauce and pickles.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named as shawarma', /shawarma/i.test(a.name ?? ''), a.name),
      perServing(a, 350, 1000),
    ],
  },
  {
    text: 'Kimchi jjigae with pork belly and tofu, feeds 3.',
    checks: (a) => [
      ...universalRecipe(a),
      check('named in Korean', /kimchi/i.test(a.name ?? ''), a.name),
      perServing(a, 250, 800),
    ],
  },
  // -- The fat that goes missing. A pot whose steps say "fry" and whose list
  // has no oil in it understates the meal by a few hundred calories.
  {
    text: 'Nasi goreng for 2, leftover rice, 2 eggs, a bit of chicken, kecap manis.',
    checks: (a) => [
      ...universalRecipe(a),
      check(
        'the cooking fat is listed',
        Boolean(ingredient(a, /oil|butter|ghee|minyak|lard/i)),
        parts(a).map((p) => p.name),
      ),
      perServing(a, 350, 900),
    ],
  },
  // -- Imperial, and a unit the app does not store.
  {
    text: '2 lbs ground beef chili with 2 cans of kidney beans and a can of tomatoes, feeds 8.',
    checks: (a) => [
      ...universalRecipe(a),
      check(
        'pounds became grams',
        Math.abs((ingredient(a, /beef/i)?.amount ?? 0) - 907) <= 60 &&
          ingredient(a, /beef/i)?.unit === 'g',
        ingredient(a, /beef/i),
      ),
      perServing(a, 250, 700),
    ],
  },
  // -- Nothing to fill in. The empty answer is the one the endpoint turns into
  // "there is nothing here", and it must stay reachable.
  {
    text: 'remind me to buy milk on the way home',
    checks: (a) => [
      check('no name', !(a.name ?? '').trim(), a.name),
      check('no ingredients', parts(a).length === 0, parts(a).length),
    ],
  },
]

// ---------------------------------------------------------------------------
// WHAT TO EAT NEXT
//
// Every check here is about a rule the prompt had to be TOLD, and each one was
// added after the model broke it on a live run. There is nothing about which
// which dishes come back, because that is taste rather than correctness — what
// is gradeable is whether they are meals, whether they are the right kitchen,
// whether they fit the ceiling, and whether the reasons say anything.

type SuggestAnswer = {
  picks?: Array<{
    name?: string
    portion?: string
    kcal?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
    sodium?: string
    icon?: string | null
    why?: Array<{ kind?: string; text?: string }>
  }>
}

const picksOf = (answer: SuggestAnswer) => answer.picks ?? []

/**
 * Words that are an ingredient rather than a meal.
 *
 * Matched on the WHOLE name rather than as a substring, because "grilled
 * chicken breast" is not a meal and "nasi ayam" is, and the difference is
 * whether anything else is on the plate. A dish that merely contains one of
 * these words passes.
 */
const BARE_INGREDIENT =
  /^(grilled |steamed |boiled |plain |poached )?(chicken breast|egg|eggs|white fish|fish fillet|tofu|yoghurt|yogurt|protein shake)( with soy sauce)?$/i

const universalSuggest = (answer: SuggestAnswer, ceiling: number): Check[] => {
  const picks = picksOf(answer)
  const over = picks.filter((p) => (p.kcal ?? 0) > ceiling)
  const bare = picks.filter((p) => BARE_INGREDIENT.test((p.name ?? '').trim()))
  const noReasons = picks.filter((p) => (p.why ?? []).length === 0)
  const names = picks.map((p) => (p.name ?? '').trim().toLowerCase())
  // Half the ceiling, which is where "every pick well under the limit" stops
  // being caution and starts being a different question answered.
  const tiny = picks.filter((p) => (p.kcal ?? 0) < ceiling / 2)

  return [
    check(`${PICK_COUNT} picks`, picks.length === PICK_COUNT, picks.length),
    check(
      'all named',
      picks.every((p) => (p.name ?? '').length > 0),
      picks.length,
    ),
    check(
      'none over the ceiling',
      over.length === 0,
      over.map((p) => `${p.name} ${p.kcal}`),
    ),
    check(
      'no bare ingredients',
      bare.length === 0,
      bare.map((p) => p.name),
    ),
    check(
      'every pick says why',
      noReasons.length === 0,
      noReasons.map((p) => p.name),
    ),
    check('all different dishes', new Set(names).size === picks.length, names),
    check(
      'portions stated',
      picks.every((p) => (p.portion ?? '').length > 0),
      picks.length,
    ),
    // Not all of them: one light option on the list is a real answer.
    check(
      'most are a real meal size',
      tiny.length <= 2,
      tiny.map((p) => `${p.name} ${p.kcal}`),
    ),
  ]
}

/** The reasons, as one string, for the checks that are about what they say. */
const reasonText = (answer: SuggestAnswer) =>
  picksOf(answer)
    .flatMap((p) => (p.why ?? []).map((w) => w.text ?? ''))
    .join(' | ')
    .toLowerCase()

type SuggestCase = { label: string; day: DayContext; checks: (a: SuggestAnswer) => Check[] }

const DAY: DayContext = {
  meal: 'dinner',
  focus: 'protein',
  cuisine: 'malay',
  healthy: true,
  kcalLimit: 600,
  kcalLeft: 900,
  proteinLeftG: 60,
  carbsLeftG: 120,
  fatLeftG: 30,
  eaten: ['Nasi lemak', 'Teh tarik'],
}

const SUGGEST_CASES: SuggestCase[] = [
  {
    label: 'dinner · protein · Malay · 600',
    day: DAY,
    checks: (a) => [
      ...universalSuggest(a, 600),
      // It answered a dinner request with "to start your day" on the first
      // live run, twice, before the sitting was made a constraint.
      check(
        'no breakfast talk',
        !/start (your|the) day|morning|wake up|overnight/.test(reasonText(a)),
        reasonText(a).slice(0, 120),
      ),
      // Roti canai and mee goreng mamak came back under "Malay" until the two
      // kitchens were named as different.
      check(
        'not the mamak menu',
        !picksOf(a).some((p) =>
          /roti canai|mee goreng mamak|nasi kandar|maggi goreng/i.test(p.name ?? ''),
        ),
        picksOf(a).map((p) => p.name),
      ),
    ],
  },
  {
    label: 'snack · balanced · Malay · 300',
    day: { ...DAY, meal: 'snack', focus: 'balanced', kcalLimit: 300 },
    checks: (a) => [
      ...universalSuggest(a, 300),
      // A snack is a KIND of food, not a small meal: asked for one it offered
      // "nasi lemak, one plate, 280 kcal", which is less than half a plate.
      check(
        'no rice plates or noodle bowls sold as snacks',
        !picksOf(a).some((p) =>
          /^(nasi|mee|kuey teow|kuay teow|laksa|bihun)\b/i.test((p.name ?? '').trim()),
        ),
        picksOf(a).map((p) => p.name),
      ),
    ],
  },
  {
    label: 'lunch · balanced · others · 700',
    day: {
      ...DAY,
      meal: 'lunch',
      focus: 'balanced',
      cuisine: 'others',
      kcalLimit: 700,
      // The shape that broke it: over budget, with a big protein gap and
      // nothing else left. It answered with chicken breast and boiled eggs.
      kcalLeft: 0,
      carbsLeftG: 0,
      fatLeftG: 0,
      proteinLeftG: 90,
    },
    checks: (a) => universalSuggest(a, 700),
  },
  {
    label: 'breakfast · carbs · Chinese · 400',
    day: {
      ...DAY,
      meal: 'breakfast',
      focus: 'carbs',
      cuisine: 'chinese',
      kcalLimit: 400,
      eaten: [],
    },
    checks: (a) => [
      ...universalSuggest(a, 400),
      // The icon list is the largest block in the prompt and the model answered
      // IN it: five picks named `char-kuey-teow`, `hokkien-mee`, `mee-siam`.
      // `unslug` is the belt behind this, but the prompt is what should hold.
      check(
        'names are not filenames',
        !picksOf(a).some((p) => (p.name ?? '').includes('-')),
        picksOf(a).map((p) => p.name),
      ),
      check(
        'the drawings exist',
        picksOf(a).every((p) => p.icon == null || resolveIcon(p.icon) !== null),
        picksOf(a).map((p) => p.icon),
      ),
    ],
  },
]

// ---------------------------------------------------------------------------

async function run(name: string, runs: number) {
  const rows: Array<{ text: string; checks: Check[]; error?: string }> = []

  const suites: Record<string, Array<{ text: string; go: () => Promise<Check[]> }>> = {
    describe: DESCRIBE_CASES.map((c) => ({
      text: c.text,
      go: async () =>
        c.checks(
          (await call(DESCRIBE_MEAL_PROMPT, describeUserMessage(c.text), 2400)) as DescribeAnswer,
        ),
    })),
    refine: REFINE_CASES.map((c) => ({
      text: `${c.context.name.slice(0, 18)} ← "${c.text}"`,
      go: async () =>
        c.checks(
          (await call(
            INTERPRET_INSTRUCTION_PROMPT,
            refineUserMessage(c.context, c.text),
            600,
          )) as Interpretation,
        ),
    })),
    suggest: SUGGEST_CASES.map((c) => ({
      text: c.label,
      go: async () =>
        c.checks(
          (await call(
            SUGGEST_MEAL_PROMPT,
            suggestUserMessage(c.day),
            // The same ceiling `suggestMeals` calls with. Seven picks with
            // eight fields and three reasons each.
            3000,
          )) as SuggestAnswer,
        ),
    })),
    recipe: RECIPE_CASES.map((c) => ({
      text: c.text.slice(0, 60),
      go: async () =>
        c.checks(
          (await call(
            DESCRIBE_RECIPE_PROMPT,
            describeRecipeUserMessage(c.text),
            // The same ceiling `describeRecipe` calls with. Ten ingredients
            // with seven fields each plus the steps, and truncated JSON does
            // not parse.
            2000,
          )) as RecipeAnswer,
        ),
    })),
  }

  const cases = suites[name] ?? []

  console.log(`\n=== ${name} · ${cases.length} cases × ${runs} ===\n`)

  for (const item of cases) {
    for (let attempt = 0; attempt < runs; attempt++) {
      try {
        rows.push({ text: item.text, checks: await item.go() })
      } catch (error) {
        rows.push({ text: item.text, checks: [], error: String(error).slice(0, 160) })
      }
    }
  }

  let passed = 0
  let total = 0
  for (const row of rows) {
    const bad = row.checks.filter((c) => !c.ok)
    passed += row.checks.length - bad.length
    total += row.checks.length
    const mark = row.error ? '!!' : bad.length ? '✗ ' : '✓ '
    console.log(`${mark} ${row.text}`)
    if (row.error) console.log(`     ${row.error}`)
    for (const c of bad) console.log(`     ✗ ${c.label} — got ${c.got}`)
  }
  console.log(`\n${passed}/${total} checks passed\n`)
}

const which = Deno.args[0] ?? 'all'
const runs = Number(Deno.args[1] ?? 1)
if (which === 'all' || which === 'describe') await run('describe', runs)
if (which === 'all' || which === 'refine') await run('refine', runs)
if (which === 'all' || which === 'recipe') await run('recipe', runs)
if (which === 'all' || which === 'suggest') await run('suggest', runs)
