import { assertEquals } from 'jsr:@std/assert@^1'

import { cacheProduct, lookupBarcode, pauseAfterFailures, searchFoods } from './catalogue.ts'

/**
 * How the server's catalogue client behaves when the Worker does not answer
 * cleanly.
 *
 * Every one of these was seen in the function logs: a search left hanging until
 * the four second timeout, a connection the Worker had closed ("error sending
 * request"), and a body cut off half way ("error reading a body from
 * connection"). None of them throws to the caller, so getting them wrong shows
 * up only as slower scans and fewer catalogue answers.
 */

const connectionError = () => new TypeError('error sending request')
const timeout = () => new DOMException('The signal has been aborted', 'AbortError')
const answer = (body: unknown) => () => Response.json(body)

/** A fake Worker, as a `fetch` that plays its answers in order. */
async function withWorker<T>(
  answers: Array<() => Response | Error>,
  run: () => Promise<T>,
): Promise<{ result: T; calls: Array<{ path: string; method: string }> }> {
  const previousFetch = globalThis.fetch
  const previousUrl = Deno.env.get('CATALOGUE_URL')
  const previousToken = Deno.env.get('CATALOGUE_TOKEN')
  Deno.env.set('CATALOGUE_URL', 'https://catalogue.test')
  Deno.env.set('CATALOGUE_TOKEN', 'token')

  const calls: Array<{ path: string; method: string }> = []
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ path: url.pathname, method: init?.method ?? 'GET' })
    const next = answers.shift()
    if (!next) throw new Error('more requests than answers')
    const outcome = next()
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
  }) as typeof fetch

  try {
    return { result: await run(), calls }
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) Deno.env.delete('CATALOGUE_URL')
    else Deno.env.set('CATALOGUE_URL', previousUrl)
    if (previousToken === undefined) Deno.env.delete('CATALOGUE_TOKEN')
    else Deno.env.set('CATALOGUE_TOKEN', previousToken)
  }
}

const product = {
  barcode: 9555,
  name: 'Milo',
  brand: null,
  kcal: 400,
  carbs_g: 1,
  protein_g: 1,
  fat_g: 1,
  serving_g: null,
}

Deno.test('a read whose connection broke is asked once more', async () => {
  const { result, calls } = await withWorker(
    [() => connectionError(), answer({ ok: true, product })],
    () => lookupBarcode('9555'),
  )
  assertEquals(result?.name, 'Milo')
  assertEquals(calls.length, 2)
})

Deno.test('a read that breaks twice gives up', async () => {
  const { result, calls } = await withWorker(
    [() => connectionError(), () => connectionError()],
    () => lookupBarcode('9555'),
  )
  assertEquals(result, null)
  assertEquals(calls.length, 2)
})

Deno.test('a timeout is not retried', async () => {
  const { result, calls } = await withWorker([() => timeout()], () => lookupBarcode('9555'))
  assertEquals(result, null)
  assertEquals(calls.length, 1)
})

Deno.test('a write is never sent twice', async () => {
  const { result, calls } = await withWorker([() => connectionError()], () => cacheProduct(product))
  assertEquals(result, 'failed')
  assertEquals(calls, [{ path: '/product', method: 'POST' }])
})

Deno.test('an error status is an answer, not a broken connection', async () => {
  const { result, calls } = await withWorker(
    [() => new Response('query failed', { status: 500 })],
    () => lookupBarcode('9555'),
  )
  assertEquals(result, null)
  assertEquals(calls.length, 1)
})

Deno.test('one failed search does not pause the next', () => {
  let now = 0
  const gate = pauseAfterFailures(2, 30_000, () => now)
  gate.record(false)
  assertEquals(gate.open(), true)
  // An answer in between resets the count, so isolated failures never add up.
  gate.record(true)
  gate.record(false)
  assertEquals(gate.open(), true)
  now = 1
  assertEquals(gate.open(), true)
})

Deno.test('two failed searches in a row pause searching, and only for a while', () => {
  let now = 0
  const gate = pauseAfterFailures(2, 30_000, () => now)
  gate.record(false)
  gate.record(false)
  assertEquals(gate.open(), false)
  now = 29_999
  assertEquals(gate.open(), false)
  now = 30_000
  assertEquals(gate.open(), true)
  // Reopened with a clean count: one more failure is a single failure again.
  gate.record(false)
  assertEquals(gate.open(), true)
})

// Last in this file, because it leaves this isolate's search paused.
Deno.test('after two unreachable searches the third is not sent', async () => {
  const { result, calls } = await withWorker([() => timeout(), () => timeout()], async () => [
    await searchFoods('spaghetti', 5),
    await searchFoods('shrimp', 5),
    await searchFoods('lettuce', 5),
  ])
  // Null rather than [], so the cascade can tell a catalogue that was not asked
  // from one that had nothing.
  assertEquals(result, [null, null, null])
  assertEquals(calls.length, 2)
})
