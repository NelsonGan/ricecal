// Where a scanned meal was eaten.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/

import { readLocation } from './location.ts'

// No remote import: the suite runs with `--no-lock` and nothing else here
// fetches a test library either.
const assertEquals = (got: unknown, want: unknown) => {
  const [a, b] = [JSON.stringify(got), JSON.stringify(want)]
  if (a !== b) throw new Error(`expected ${b}, got ${a}`)
}

Deno.test('a whole location becomes the six columns, trimmed and capped', () => {
  assertEquals(
    readLocation({
      latitude: 3.1617,
      longitude: 101.6189,
      name: '  Village Park   Restaurant ',
      address: 'Damansara Uptown',
      placeId: 'I1',
      category: 'Restaurant',
    }),
    {
      latitude: 3.1617,
      longitude: 101.6189,
      location_name: 'Village Park Restaurant',
      location_address: 'Damansara Uptown',
      location_id: 'I1',
      location_category: 'Restaurant',
    },
  )
  assertEquals(
    readLocation({ latitude: 0, longitude: 0, name: 'x'.repeat(300) })?.location_name.length,
    200,
  )
})

Deno.test('anything short of a named point on the globe is no location, not an error', () => {
  assertEquals(readLocation(undefined), null)
  assertEquals(readLocation('KLCC'), null)
  assertEquals(readLocation({ latitude: 3.1, longitude: 101.6 }), null)
  assertEquals(readLocation({ latitude: 3.1, longitude: 101.6, name: '   ' }), null)
  assertEquals(readLocation({ latitude: 91, longitude: 101.6, name: 'Nowhere' }), null)
  assertEquals(readLocation({ latitude: '3.1', longitude: 101.6, name: 'KLCC' }), null)
  assertEquals(readLocation({ latitude: Number.NaN, longitude: 101.6, name: 'KLCC' }), null)
})
