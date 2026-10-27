import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import type { Meter } from './entitlement.ts'
import {
  answerShape,
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
import type { AiSpan, Generation } from './posthog.ts'

type Sent = { model: string; provider?: unknown; temperature?: number }

/**
 * Runs `chatJSON` against a stubbed OpenRouter that answers each request with
 * the next response in `answers`, and hands back every body that was sent and
 * every generation the meter was told about.
 */
async function withAnswers(
  answers: Array<() => Response>,
  span: AiSpan = 'describe_meal',
): Promise<{
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
    const result = await chatJSON(meter, span, [{ role: 'user', content: 'x' }])
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

Deno.test('only the primary is told to answer in JSON alone, in a cached system prompt', () => {
  const messages = [
    { role: 'system', content: 'Prompt.' },
    { role: 'user', content: 'x' },
  ]
  const before = structuredClone(messages)
  const primary = requestBody(PRIMARY_ROUTE as ModelRoute, messages, 100, true).messages as Array<{
    content: unknown
  }>
  const fallback = requestBody(FALLBACK_ROUTE, messages, 100, true).messages
  // Building either body leaves the caller's messages as they were.
  assertEquals(messages, before)
  // The whole system prompt, instruction included, is the one cached block, so
  // every call of a kind shares the prefix; the meal's own message follows it.
  assertEquals(primary[0].content, [
    {
      type: 'text',
      text: `Prompt.\n\n${PRIMARY_ROUTE?.instruction}`,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ])
  assertEquals(primary[1], messages[1])
  // Qwen takes no cache_control, so it is sent the messages as given.
  assertEquals(fallback, before)
  // A call not worth caching sends the system prompt as plain text.
  const uncached = requestBody(PRIMARY_ROUTE as ModelRoute, messages, 100).messages as Array<{
    content: unknown
  }>
  assertEquals(uncached[0].content, `Prompt.\n\n${PRIMARY_ROUTE?.instruction}`)
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

Deno.test('a stray quote inside a key is taken out, and nothing else is', () => {
  // One quote too many before a key, and one in the middle of a key.
  assertEquals(parseAnswer('{"name":"nasi lemak",""count":1,"grams":200}'), {
    name: 'nasi lemak',
    count: 1,
    grams: 200,
  })
  assertEquals(parseAnswer('{"items":[{"name":"roti","kc"al_low":300,"kcal_high":400}]}'), {
    items: [{ name: 'roti', kcal_low: 300, kcal_high: 400 }],
  })
  // Inside a fence or after a paragraph, as Haiku answers.
  assertEquals(parseAnswer('Here it is:\n```json\n{""a":1, ""b":2}\n```'), { a: 1, b: 2 })
  // The caller hears how many quotes came out, and nothing when none did.
  const heard: number[] = []
  parseAnswer('{""a":1,""b":2}', (n) => heard.push(n))
  parseAnswer('{"a":1}', (n) => heard.push(n))
  assertEquals(heard, [2])
  // A quote inside a value is a different fault, and is left to fail as before.
  assertThrows(() => parseAnswer('{"name":"teh "tarik"","kcal":120}'), SyntaxError)
  // So is an answer that is still broken after the quote comes out.
  assertThrows(() => parseAnswer('{"a"b c:1}'), SyntaxError)
  // And one with more stray quotes than any near-JSON answer has.
  assertThrows(() => parseAnswer('{""a":1,""b":2,""c":3,""d":4}'), SyntaxError)
  // What is thrown is the error in what the model wrote, not in a repair.
  const error = assertThrows(() => parseAnswer('{"a"b c:1}'), SyntaxError)
  assertEquals(error.message.includes("Expected ':' after property name"), true)
  assertEquals(error.message.includes('position 4'), true)
})

Deno.test('an unreadable answer is described by its shape, never by its words', () => {
  // A second object after the first: what a parser fix would cover.
  const twice = answerShape('{"name":"nasi lemak"}\n\nCorrected:\n{"name":"nasi lemak ayam"}')
  assertEquals(twice.includes('objects=2'), true)
  assertEquals(twice.includes('error=after-json'), true)
  // A quote the model forgot to escape: what a prompt fix would cover.
  const quote = answerShape('{"name":"teh "tarik"","kcal":120}')
  assertEquals(quote.includes('objects=1'), true)
  assertEquals(quote.includes('error=expected-comma'), true)
  assertEquals(quote.includes('at-char=letter'), true)
  // The position counts from the start of the answer, past any paragraph.
  const late = answerShape('Here:\n{"name":"teh "tarik"","kcal":120}')
  assertEquals(late.includes('before=6'), true)
  assertEquals(late.includes('at=20 at-char=letter'), true)
  // V8 gives these no position, so the character's class tells them apart.
  const comma = answerShape('{"items":["roti canai",],"kcal":300}')
  assertEquals(comma.includes('error=unexpected-token at=-1 at-char=]'), true)
  const bare = answerShape('{"name":"roti canai","kcal":NaN}')
  assertEquals(bare.includes('error=unexpected-token at=-1 at-char=letter'), true)
  // A key that closed on a stray quote, which the parser now repairs.
  const key = answerShape('{"a"b c:1}')
  assertEquals(key.includes('error=expected-colon at=4 at-char=letter prev-char="'), true)
  // Cut off part way, with nothing closing it, inside the string that opens at 18.
  const cut = answerShape('{"items":[{"name":"roti')
  assertEquals(cut.includes('unclosed=2'), true)
  assertEquals(cut.includes('stuck=18'), true)
  // Errors V8 positions but that used to read as `other`.
  const badEscape = answerShape('{"name":"roti \\a canai","kcal":300}')
  assertEquals(
    badEscape.includes('error=bad-escape at=15 at-char=letter prev-char=backslash'),
    true,
  )
  const minus = answerShape('{"name":"roti canai","kcal":-x}')
  assertEquals(minus.includes('error=bad-number'), true)
  assertEquals(answerShape('{"kcal":1.x}').includes('error=bad-number'), true)
  assertEquals(answerShape('{"kcal":1ex}').includes('error=bad-number'), true)
  assertEquals(answerShape('{"name":"\\u00zz"}').includes('error=bad-unicode'), true)
  // A balanced answer has no string left open.
  assertEquals(badEscape.includes('stuck=-1'), true)
  for (const shape of [twice, quote, late, comma, bare, cut, badEscape, minus]) {
    assertEquals(/nasi|lemak|teh|tarik|ayam|roti|canai|kcal|name|Corrected|NaN/i.test(shape), false)
  }
})

Deno.test('an unparseable primary answer logs its shape before the fallback', async () => {
  const warn = console.warn
  const lines: string[] = []
  console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  try {
    const { result } = await withAnswers([
      answer('{"name":"char kuey teow"} {"name":"char kuey teow"}'),
      answer('{"ok":5}'),
    ])
    assertEquals(result, { ok: 5 })
  } finally {
    console.warn = warn
  }
  const shape = lines.find((line) => line.includes('answer did not parse'))
  assertEquals(shape?.includes('objects=2'), true)
  assertEquals(
    lines.some((line) => /kuey|teow/.test(line)),
    false,
  )
})

Deno.test('a frequent call caches its system prompt, a once-a-day one does not', async () => {
  const system = (sent: Sent[]) =>
    (sent[0] as unknown as { messages: Array<{ content: unknown }> }).messages[0].content
  const frequent = await withAnswers([answer('{"ok":1}')], 'analyse_photo')
  assertEquals(Array.isArray(system(frequent.sent)), true)
  const rare = await withAnswers([answer('{"ok":1}')], 'describe_recipe')
  assertEquals(typeof system(rare.sent), 'string')
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
