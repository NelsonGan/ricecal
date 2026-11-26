// When a queued meal was taken.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/

import { readLoggedAt } from './logged-at.ts'

const assertEquals = (got: unknown, want: unknown) => {
  const [a, b] = [JSON.stringify(got), JSON.stringify(want)]
  if (a !== b) throw new Error(`expected ${b}, got ${a}`)
}

const NOW = Date.parse('2026-11-26T10:00:00.000Z')

Deno.test('a time from earlier today is kept, to the millisecond', () => {
  assertEquals(readLoggedAt('2026-11-26T04:12:30.123Z', NOW), '2026-11-26T04:12:30.123Z')
})

Deno.test('an offset is read and written back as UTC', () => {
  assertEquals(readLoggedAt('2026-11-26T12:12:30+08:00', NOW), '2026-11-26T04:12:30.000Z')
})

Deno.test('nothing, or not a time, is the entry stamped on arrival', () => {
  assertEquals(readLoggedAt(undefined, NOW), null)
  assertEquals(readLoggedAt(null, NOW), null)
  assertEquals(readLoggedAt(1764150000000, NOW), null)
  assertEquals(readLoggedAt('lunch', NOW), null)
  assertEquals(readLoggedAt('', NOW), null)
})

Deno.test('a little clock skew is allowed, the future is not', () => {
  assertEquals(readLoggedAt('2026-11-26T10:04:00.000Z', NOW), '2026-11-26T10:04:00.000Z')
  assertEquals(readLoggedAt('2026-11-26T10:30:00.000Z', NOW), null)
})

Deno.test('past what the app keeps a queued meal for, it is dropped', () => {
  assertEquals(readLoggedAt('2026-11-19T10:00:00.000Z', NOW), '2026-11-19T10:00:00.000Z')
  assertEquals(readLoggedAt('2026-11-10T10:00:00.000Z', NOW), null)
})
