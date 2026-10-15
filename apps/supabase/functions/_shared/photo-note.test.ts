// A photographed meal with a few words beside it.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/
//
// The note settles what the photo cannot: which meat, what is in the cup, and
// how much of the plate was theirs. The last is the one with arithmetic in it,
// because a shared plate is a count below one over parts priced for the whole
// plate, and the band the model gives can be read either way.

import { breakdownDisagrees, sizeDish } from './cascade.ts'
import { createMeter } from './entitlement.ts'
import {
  ANALYSE_PHOTO_PROMPT,
  analysePhoto,
  estimateNutrition,
  PHOTO_NOTE_RULES,
  photoUserMessage,
  type VisionItem,
} from './llm.ts'

const eq = (got: unknown, want: unknown, what: string) => {
  if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`)
}

type Sent = { messages: Array<{ role: string; content: unknown }> }

/**
 * Runs `analysePhoto` against a stubbed model that answers `answer`, and hands
 * back what was sent. Out of mock mode, so the real request is built.
 */
async function withModel<T>(
  answer: unknown,
  run: () => Promise<T>,
): Promise<{ result: T; sent: Sent }> {
  const previousFetch = globalThis.fetch
  const previousKey = Deno.env.get('OPENROUTER_API_KEY')
  const previousMock = Deno.env.get('MOCK_AI')
  Deno.env.set('OPENROUTER_API_KEY', 'test-key')
  Deno.env.delete('MOCK_AI')
  let sent: Sent | null = null
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return Promise.resolve(
      Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] }),
    )
  }) as typeof fetch
  try {
    const result = await run()
    if (!sent) throw new Error('nothing was sent')
    return { result, sent }
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) Deno.env.delete('OPENROUTER_API_KEY')
    else Deno.env.set('OPENROUTER_API_KEY', previousKey)
    if (previousMock !== undefined) Deno.env.set('MOCK_AI', previousMock)
  }
}

const userText = (sent: Sent): string => {
  const content = sent.messages[1].content as Array<{ type: string; text?: string }>
  return content.find((part) => part.type === 'text')?.text ?? ''
}

/**
 * Nasi lemak for one, priced per part: 1,000 kcal on the plate, 500 if the six
 * wings were read as one. That second reading is exactly half the plate, which
 * is what makes a band for half of it ambiguous.
 */
const plate = (count: number, low: number, high: number) => ({
  scene: 'composite',
  items: [
    {
      name: 'Nasi lemak with fried chicken',
      specific_query: 'nasi lemak ayam goreng',
      generic_query: 'nasi lemak',
      count,
      components: [
        { name: 'coconut rice', count: 1, grams: 200, kcal: 300 },
        { name: 'fried chicken wing', count: 6, grams: 40, kcal: 100 },
        { name: 'sambal', count: 1, grams: 25, kcal: 50 },
        { name: 'boiled egg', count: 1, grams: 55, kcal: 50 },
      ],
      kcal_low: low,
      kcal_high: high,
      confidence: 0.8,
      suggested_edits: ['No sambal', 'Extra rice'],
    },
  ],
})

Deno.test('a photo with no note is read by the prompt it always was', async () => {
  const { sent } = await withModel(plate(1, 900, 1100), () =>
    analysePhoto('aGVsbG8=', undefined, createMeter()),
  )
  eq(sent.messages[0].content, ANALYSE_PHOTO_PROMPT, 'system prompt')
  eq(userText(sent), 'What food is in this photo?', 'user text')
})

Deno.test('a note travels with the photo, quoted, under the rules for it', async () => {
  const { sent } = await withModel(plate(1, 900, 1100), () =>
    analysePhoto('aGVsbG8=', undefined, createMeter(), 'beef rendang, not chicken'),
  )
  eq(sent.messages[0].content, ANALYSE_PHOTO_PROMPT + PHOTO_NOTE_RULES, 'system prompt')
  eq(
    userText(sent),
    'What food is in this photo? The person who ate it added: "beef rendang, not chicken"',
    'user text',
  )
})

Deno.test('half a shared plate keeps its parts whole when the band is the half', async () => {
  // The band the prompt asks for: what they ate. Against the whole plate's parts
  // it is half, and read naively that looks like counts applied twice, which
  // would price each of the six wings at a sixth of a wing.
  const { result } = await withModel(plate(0.5, 450, 550), () =>
    analysePhoto('aGVsbG8=', undefined, createMeter(), 'shared with my sister'),
  )
  const item = result.items[0]
  eq(item.count, 0.5, 'the share')
  eq(item.components.find((c) => c.name === 'fried chicken wing')?.count, 6, 'six wings')
  eq(item.components.find((c) => c.name === 'fried chicken wing')?.kcal, 100, 'one wing')
})

Deno.test('a note with a quote in it stays inside its quotation', () => {
  eq(
    photoUserMessage('the "special" one'),
    'What food is in this photo? The person who ate it added: "the \\"special\\" one"',
    'user text',
  )
})

// A guard rather than a pin: this passed before the change too. Dividing the
// band by the share must not start dividing parts when the model bounded the
// whole plate instead of the half, which it often does.
Deno.test('half a shared plate keeps its parts whole when the band is the plate', async () => {
  const { result } = await withModel(plate(0.5, 900, 1100), () =>
    analysePhoto('aGVsbG8=', undefined, createMeter(), 'shared'),
  )
  eq(result.items[0].components.find((c) => c.name === 'fried chicken wing')?.count, 6, 'wings')
})

Deno.test('a shared breakdown agrees with either band', () => {
  // Half of a 1,000 kcal plate. The first held before the change; the second is
  // the one that read as a missing main food.
  eq(breakdownDisagrees(500, 0.5, 450, 550), null, 'against the half')
  eq(breakdownDisagrees(500, 0.5, 900, 1100), null, 'against the whole plate')
})

Deno.test('a shared breakdown is not rescued by a whole plate outside the band', () => {
  // Celery and dip, 400 kcal for the whole basket and 200 eaten, against the
  // half of a basket of wings. Measured as a whole plate it is still short.
  eq(breakdownDisagrees(200, 0.5, 500, 600), 'short', 'half a basket')
})

Deno.test('a breakdown still fails when the main food is missing', () => {
  // The wings basket: celery and dip against the model's own band.
  eq(breakdownDisagrees(160, 1, 780, 900), 'short', 'a whole plate')
  eq(breakdownDisagrees(80, 0.5, 780, 900), 'short', 'half of it')
})

Deno.test('a breakdown still fails when a part is priced as a portion', () => {
  eq(breakdownDisagrees(2000, 1, 500, 600), 'over', 'a whole plate')
  eq(breakdownDisagrees(2000, 0.5, 500, 600), 'over', 'half of one')
})

const curry = (count: number, grams: number | null): VisionItem => ({
  name: 'Laksa',
  specific_query: 'curry laksa',
  generic_query: 'laksa',
  count,
  components: [],
  grams,
  serving_hint: count < 1 ? 'half a bowl' : '1 bowl',
  kcal_low: 250,
  kcal_high: 300,
  confidence: 0.8,
  suggested_edits: [],
  icon: null,
})

Deno.test('a shared dish with no weights logs the share, not the bowl', () => {
  // Half a laksa's band against a whole bowl's 500 kcal row: a ratio of 0.55,
  // which used to be one bowl.
  const shared = sizeDish({
    byWeight: null,
    ratio: 0.55,
    count: 0.5,
    confidence: 0.8,
    servingLabel: '1 bowl',
  })
  eq(shared?.quantity, 0.5, 'half a bowl')
  // A quarter share of a bowl the row prices small still lands on a quarter.
  eq(
    sizeDish({ byWeight: null, ratio: 0.1, count: 0.25, confidence: 0.8, servingLabel: '1 bowl' })
      ?.quantity,
    0.25,
    'a quarter',
  )
})

Deno.test('a whole dish is sized exactly as before', () => {
  eq(
    sizeDish({ byWeight: null, ratio: 1.1, count: 1, confidence: 0.8, servingLabel: '1 bowl' })
      ?.quantity,
    1,
    'one bowl',
  )
  eq(
    sizeDish({ byWeight: null, ratio: 3, count: 1, confidence: 0.8, servingLabel: '1 bowl' })
      ?.quantity,
    3,
    'three bowls',
  )
  // Weights already carry the share, so it is not applied twice.
  eq(
    sizeDish({ byWeight: 0.5, ratio: 0.55, count: 0.5, confidence: 0.8, servingLabel: '1 bowl' })
      ?.quantity,
    0.5,
    'half by weight',
  )
})

Deno.test('the estimate is told when only a share was eaten', async () => {
  const nutrition = { kcal: 280, carbs_g: 30, protein_g: 10, fat_g: 13 }
  const { sent } = await withModel(nutrition, () =>
    estimateNutrition(curry(0.5, 600), undefined, createMeter()),
  )
  const text = String(sent.messages[1].content)
  if (!text.includes('600 g for the whole plate')) throw new Error(`weight: ${text}`)
  if (!text.includes('They ate 50% of it')) throw new Error(`share: ${text}`)

  const whole = await withModel(nutrition, () =>
    estimateNutrition(curry(1, 600), undefined, createMeter()),
  )
  if (String(whole.sent.messages[1].content).includes('They ate')) {
    throw new Error('a whole dish was told about a share')
  }
})
