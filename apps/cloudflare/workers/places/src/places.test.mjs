import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addressOf,
  mapsAuthToken,
  parseReverseRequest,
  parseSearchRequest,
  reversePath,
  searchPath,
  toPlaceResults,
} from './places.ts'

const decode = (segment) =>
  JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())

test('a search needs a query of two characters and a real coordinate', () => {
  assert.deepEqual(parseSearchRequest({ query: ' a ' }), { error: 'query_too_short' })
  assert.deepEqual(parseSearchRequest({ query: 'x'.repeat(121) }), { error: 'query_too_long' })
  assert.deepEqual(parseSearchRequest({ query: 'mamak', latitude: 91, longitude: 0 }), {
    error: 'invalid_location',
  })
  assert.deepEqual(parseSearchRequest({ query: 'mamak', latitude: 3.1 }), {
    error: 'invalid_location',
  })
  assert.deepEqual(parseSearchRequest(null), { error: 'invalid_body' })
})

test('a search collapses spaces, keeps a location and drops a malformed language', () => {
  assert.deepEqual(
    parseSearchRequest({
      query: '  nasi   kandar ',
      latitude: 3.1,
      longitude: 101.6,
      language: 'ms',
    }),
    { query: 'nasi kandar', latitude: 3.1, longitude: 101.6, language: 'ms' },
  )
  assert.deepEqual(parseSearchRequest({ query: 'kopi', language: 'en; drop table' }), {
    query: 'kopi',
    latitude: null,
    longitude: null,
    language: null,
  })
})

test('a reverse lookup needs a coordinate', () => {
  assert.deepEqual(parseReverseRequest({ latitude: 'x', longitude: 1 }), {
    error: 'invalid_location',
  })
  assert.deepEqual(
    parseReverseRequest({ latitude: 3.15, longitude: 101.71, language: 'zh-Hans' }),
    {
      latitude: 3.15,
      longitude: 101.71,
      language: 'zh-Hans',
    },
  )
})

test('coordinates are rounded before they reach Apple or the cache key', () => {
  const search = searchPath({
    query: 'Nasi Lemak',
    latitude: 3.158956,
    longitude: 101.713727,
    language: null,
  })
  // About a kilometre: enough to rank nearby places first, coarse enough that
  // neighbours share a cache entry and Apple never sees the exact spot.
  assert.equal(search, '/v1/search?q=nasi+lemak&searchLocation=3.16%2C101.71')
  const reverse = reversePath({ latitude: 3.158956, longitude: -0.00001, language: 'ms' })
  // A point just west of 0° shares its key with 0° itself.
  assert.equal(reverse, '/v1/reverseGeocode?loc=3.1590%2C0.0000&lang=ms')
})

test("Apple's places become one-line addresses without the name or the country", () => {
  const places = toPlaceResults({
    results: [
      {
        id: 'I1',
        name: 'Village Park Restaurant',
        coordinate: { latitude: 3.1617, longitude: 101.6189 },
        // Apple sometimes sends the whole address as one string with breaks.
        formattedAddressLines: [
          'Village Park Restaurant\n5, Jalan SS 21/37\nDamansara Uptown\n47400 Petaling Jaya\nMalaysia\n\n',
        ],
        country: 'Malaysia',
        countryCode: 'MY',
        poiCategory: 'Restaurant',
      },
      { name: 'No coordinate' },
      {
        coordinate: { latitude: 3.1, longitude: 101.6 },
        formattedAddressLines: ['Jalan Bangsar', 'Kuala Lumpur'],
      },
    ],
  })
  assert.deepEqual(places, [
    {
      id: 'I1',
      name: 'Village Park Restaurant',
      address: '5, Jalan SS 21/37, Damansara Uptown, 47400 Petaling Jaya',
      latitude: 3.1617,
      longitude: 101.6189,
      category: 'Restaurant',
      countryCode: 'MY',
    },
    // An unnamed spot is named by its address.
    {
      id: null,
      name: 'Jalan Bangsar, Kuala Lumpur',
      address: '',
      latitude: 3.1,
      longitude: 101.6,
      category: null,
      countryCode: null,
    },
  ])
  assert.equal(addressOf({ formattedAddressLines: 'not a list' }, 'x'), '')
})

test('the Maps auth token is a verifiable ES256 JWT for the server API', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString(
    'base64',
  )
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`
  const token = await mapsAuthToken(
    { APPLE_MAPS_PRIVATE_KEY: pem, APPLE_MAPS_KEY_ID: 'KEY1', APPLE_TEAM_ID: 'TEAM1' },
    1_800_000_000_000,
  )
  const [header, claims, signature] = token.split('.')
  assert.deepEqual(decode(header), { alg: 'ES256', kid: 'KEY1', typ: 'JWT' })
  assert.deepEqual(decode(claims), {
    iss: 'TEAM1',
    iat: 1_800_000_000,
    exp: 1_800_000_600,
    scope: 'server_api',
  })
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.publicKey,
    Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    new TextEncoder().encode(`${header}.${claims}`),
  )
  assert.ok(ok)
})
