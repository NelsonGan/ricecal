import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import type { Meter } from './entitlement.ts'
import {
  chatJSON,
  completeJpeg,
  FALLBACK_ROUTE,
  type ModelRoute,
  PRIMARY_ROUTE,
  parseAnswer,
  photoBase64,
  photoDataUrl,
  requestBody,
  routeFor,
} from './llm.ts'
import type { Generation } from './posthog.ts'

type Sent = { model: string; provider?: unknown; temperature?: number }

/**
 * Runs `chatJSON` against a stubbed OpenRouter that answers each request with
 * the next response in `answers`, and hands back every body that was sent and
 * every generation the meter was told about.
 */
async function withAnswers(answers: Array<() => Response>): Promise<{
  result: unknown
  sent: Sent[]
  generations: Generation[]
}> {
  const previousFetch = globalThis.fetch
  const previousKey = Deno.env.get('OPENROUTER_API_KEY')
  Deno.env.set('OPENROUTER_API_KEY', 'test-key')
  const sent: Sent[] = []
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)))
    const next = answers.shift()
    if (!next) throw new Error('more requests than answers')
    return Promise.resolve(next())
  }) as typeof fetch
  const generations: Generation[] = []
  const meter: Meter = {
    record() {},
    spent: () => generations.length,
    observe: (generation) => void generations.push(generation),
  }
  try {
    const result = await chatJSON(meter, 'describe_meal', [{ role: 'user', content: 'x' }])
    return { result, sent, generations }
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) Deno.env.delete('OPENROUTER_API_KEY')
    else Deno.env.set('OPENROUTER_API_KEY', previousKey)
  }
}

const answer = (content: string, usage?: unknown) => () =>
  Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }], usage })
const failure = (status: number) => () => new Response('nope', { status })

Deno.test('the primary is Haiku on Anthropic alone, with no temperature', () => {
  assertEquals(PRIMARY_ROUTE?.model, 'anthropic/claude-haiku-5.5')
  assertEquals(PRIMARY_ROUTE?.provider, { only: ['anthropic'], allow_fallbacks: false })
  assertEquals(PRIMARY_ROUTE?.temperature, undefined)
  assertEquals(FALLBACK_ROUTE.model, 'qwen/qwen3.7-flash')
})

Deno.test('a primary that answers is the only request made', async () => {
  const { result, sent } = await withAnswers([answer('{"ok":1}', { is_byok: true })])
  assertEquals(result, { ok: 1 })
  assertEquals(sent.length, 1)
  assertEquals(sent[0].model, PRIMARY_ROUTE?.model)
  assertEquals(sent[0].provider, { only: ['anthropic'], allow_fallbacks: false })
  assertEquals('temperature' in sent[0], false)
})

for (const [label, first] of [
  ['a refused', failure(401)],
  ['a rate limited', failure(429)],
  ['an unparseable', answer('not json')],
  ['an empty', answer('')],
] as const) {
  Deno.test(`${label} primary goes to the fallback, which is sent no provider lock`, async () => {
    const { result, sent, generations } = await withAnswers([first, answer('{"ok":2}')])
    assertEquals(result, { ok: 2 })
    assertEquals(
      generations.map((g) => g.isBackupModel),
      [false, true],
    )
    assertEquals(
      sent.map((body) => body.model),
      [PRIMARY_ROUTE?.model, FALLBACK_ROUTE.model],
    )
    assertEquals('provider' in sent[1], false)
    assertEquals(sent[1].temperature, 0.2)
  })
}

Deno.test('the fallback keeps its one retry for a transient failure', async () => {
  const { result, sent, generations } = await withAnswers([
    failure(500),
    failure(503),
    answer('{"ok":3}'),
  ])
  assertEquals(result, { ok: 3 })
  // A fallback and its retry are both the backup, told apart by `attempt`.
  assertEquals(
    generations.map((g) => [g.attempt, g.isBackupModel]),
    [
      [0, false],
      [1, true],
      [2, true],
    ],
  )
  assertEquals(
    sent.map((body) => body.model),
    [PRIMARY_ROUTE?.model, FALLBACK_ROUTE.model, FALLBACK_ROUTE.model],
  )
})

Deno.test('any Anthropic model is locked to our key, whichever route it is on', () => {
  assertEquals(routeFor('anthropic/claude-sonnet-5.5', 0.2), {
    model: 'anthropic/claude-sonnet-5.5',
    provider: { only: ['anthropic'], allow_fallbacks: false },
    instruction: PRIMARY_ROUTE?.instruction,
  })
  assertEquals(routeFor('qwen/qwen3.7-flash', 0.2), {
    model: 'qwen/qwen3.7-flash',
    temperature: 0.2,
  })
})

Deno.test('only the primary is told to answer in JSON alone', () => {
  const messages = [
    { role: 'system', content: 'Prompt.' },
    { role: 'user', content: 'x' },
  ]
  const primary = requestBody(PRIMARY_ROUTE as ModelRoute, messages, 100)
    .messages as typeof messages
  const fallback = requestBody(FALLBACK_ROUTE, messages, 100).messages
  assertEquals(primary[0].content, `Prompt.\n\n${PRIMARY_ROUTE?.instruction}`)
  assertEquals(primary[1], messages[1])
  assertEquals(fallback, messages)
})

Deno.test('the JSON is found after a paragraph of working, or inside a fence', () => {
  assertEquals(parseAnswer('{"a":1}'), { a: 1 })
  assertEquals(parseAnswer('[1,2]'), [1, 2])
  assertEquals(parseAnswer('```json\n{"a":2}\n```'), { a: 2 })
  assertEquals(parseAnswer('The photo shows rice.\n\n```json\n{"a":3}\n```\n\nSumming...'), {
    a: 3,
  })
  assertEquals(parseAnswer('Working it out first.\n{"a":4}'), { a: 4 })
  assertThrows(() => parseAnswer('Estimating each component:\n- rice 200 g'), SyntaxError)
  assertThrows(() => parseAnswer('Totals:\n\n{"kc'), SyntaxError)
})

Deno.test('a photo is sent as what it is, not as whatever JPEG would be', () => {
  const head = (bytes: number[]) => btoa(String.fromCharCode(...bytes, 0, 0, 0, 0))
  const type = (b64: string) => photoDataUrl(b64).slice(5, photoDataUrl(b64).indexOf(';'))
  assertEquals(type(head([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assertEquals(type(head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assertEquals(
    type(head([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
    'image/webp',
  )
  assertEquals(type(head([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'image/gif')
  // Bytes it cannot place keep the type they were stored with.
  assertEquals(photoDataUrl('AAAA', 'image/heic'), 'data:image/heic;base64,AAAA')
  assertEquals(
    photoDataUrl(head([0xff, 0xd8, 0xff, 0xe0]), 'image/png').slice(0, 15),
    'data:image/jpeg',
  )
})

// Last in the file: tripping the breaker lasts for the rest of the isolate.
Deno.test('an answer billed to credits is kept, and stops the primary being asked', async () => {
  const billed = await withAnswers([answer('{"ok":4}', { is_byok: false })])
  assertEquals(billed.result, { ok: 4 })
  const next = await withAnswers([answer('{"ok":5}')])
  assertEquals(next.result, { ok: 5 })
  assertEquals(
    next.sent.map((body) => body.model),
    [FALLBACK_ROUTE.model],
  )
  // Qwen answering with the primary never asked is not a fallback.
  assertEquals(next.generations[0].isBackupModel, false)
})

Deno.test('a clipped JPEG gets its end marker back, and nothing else is touched', () => {
  const jpeg = (...tail: number[]) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, ...tail])
  // The app cut one byte (the D9) or two (FF D9) off the end.
  assertEquals([...completeJpeg(jpeg(0xff))].slice(-2), [0xff, 0xd9])
  assertEquals([...completeJpeg(jpeg(4))].slice(-3), [4, 0xff, 0xd9])
  const whole = jpeg(0xff, 0xd9)
  assertEquals(completeJpeg(whole), whole)
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assertEquals(completeJpeg(png), png)
  assertEquals(atob(photoBase64(jpeg(0xff))).slice(-2), '\xff\xd9')
})
