import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import worker from './index.ts'
import { resetAppleTokenCache } from './places.ts'
import { addressSubject, dayStart } from './quota.ts'

/**
 * The routes end to end, against a fake Apple and a fake D1, with a real
 * ES256 Supabase token verified through the catalogue's `auth.ts`.
 */

const SUPABASE_URL = 'https://test.supabase.co'
const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const supabaseKey = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])
const jwk = { ...(await crypto.subtle.exportKey('jwk', supabaseKey.publicKey)), kid: 'k1' }

async function userToken(sub = 'user-1', overrides = {}) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: 'k1', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub,
      aud: 'authenticated',
      iss: `${SUPABASE_URL}/auth/v1`,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...overrides,
    }),
  )
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    supabaseKey.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`
}

const appleKey = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
])
const applePem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
  await crypto.subtle.exportKey('pkcs8', appleKey.privateKey),
).toString('base64')}\n-----END PRIVATE KEY-----\n`

/** Just enough D1 for quota.ts: rows keyed by subject and day. */
function fakeD1() {
  const rows = new Map()
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async all() {
      const [day, ...subjects] = args
      return {
        results: subjects
          .map((subject) => rows.get(`${subject}|${day}`))
          .filter(Boolean)
          .map(({ subject, count }) => ({ subject, count })),
      }
    },
    async run() {
      if (sql.startsWith('INSERT')) {
        const [subject, day, expires] = args
        const row = rows.get(`${subject}|${day}`) ?? { subject, count: 0, expires }
        row.count += 1
        rows.set(`${subject}|${day}`, row)
      } else if (sql.startsWith('DELETE')) {
        for (const [key, row] of rows) if (row.expires <= args[0]) rows.delete(key)
      }
      return {}
    },
  })
  return {
    rows,
    prepare: (sql) => statement(sql.trim()),
    async batch(statements) {
      for (const s of statements) await s.run()
    },
  }
}

let apple
let env
let pending

function ctx() {
  return { waitUntil: (promise) => pending.push(promise), passThroughOnException() {} }
}

async function call(path, body, { token, ip = '1.2.3.4', method = 'POST' } = {}) {
  const auth = token === undefined ? await userToken() : token
  const response = await worker.fetch(
    new Request(`https://places.ricecal.app${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ip,
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
    env,
    ctx(),
  )
  await Promise.all(pending.splice(0))
  return { status: response.status, body: await response.json() }
}

const realFetch = globalThis.fetch

beforeEach(() => {
  resetAppleTokenCache()
  pending = []
  apple = { token: 0, search: [], reverse: [], status: 200 }
  env = {
    SUPABASE_URL,
    APPLE_MAPS_PRIVATE_KEY: applePem,
    APPLE_MAPS_KEY_ID: 'KEY1',
    APPLE_TEAM_ID: 'TEAM1',
    DB: fakeD1(),
  }
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    if (url.pathname === '/auth/v1/.well-known/jwks.json') return Response.json({ keys: [jwk] })
    if (url.pathname === '/v1/token') {
      apple.token += 1
      return Response.json({ accessToken: 'access', expiresInSeconds: 1800 })
    }
    if (apple.status !== 200) return new Response('{}', { status: apple.status })
    if (url.pathname === '/v1/search') {
      apple.search.push(url.search)
      return Response.json({
        results: [
          {
            id: 'I1',
            name: 'Ali Mamak',
            coordinate: { latitude: 3.13, longitude: 101.67 },
            formattedAddressLines: ['Jalan Telawi', 'Bangsar', 'Malaysia'],
            country: 'Malaysia',
            countryCode: 'MY',
            poiCategory: 'Restaurant',
          },
        ],
      })
    }
    if (url.pathname === '/v1/reverseGeocode') {
      apple.reverse.push(url.search)
      return Response.json({
        results: [
          {
            name: 'Suria KLCC',
            coordinate: { latitude: 3.158, longitude: 101.712 },
            formattedAddressLines: ['Kuala Lumpur City Centre'],
          },
        ],
      })
    }
    throw new Error(`unexpected fetch ${url}`)
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('searches Apple for a signed-in user and counts one use for the user and the address', async () => {
  const { status, body } = await call('/search', {
    query: 'mamak',
    latitude: 3.1312,
    longitude: 101.6712,
  })
  assert.equal(status, 200)
  assert.equal(body.places[0].name, 'Ali Mamak')
  assert.equal(body.places[0].address, 'Jalan Telawi, Bangsar')
  assert.deepEqual(apple.search, ['?q=mamak&searchLocation=3.13%2C101.67'])
  const counts = [...env.DB.rows.values()].map((row) => row.count)
  assert.deepEqual(counts, [1, 1])
})

test('resolves a coordinate to the place there', async () => {
  const { status, body } = await call('/reverse', { latitude: 3.158, longitude: 101.712 })
  assert.equal(status, 200)
  assert.equal(body.places[0].name, 'Suria KLCC')
  assert.equal(apple.token, 1)
})

test('refuses a caller without a valid Supabase token before any work', async () => {
  assert.equal((await call('/search', { query: 'kopi' }, { token: '' })).status, 401)
  assert.equal((await call('/search', { query: 'kopi' }, { token: 'a.b.c' })).status, 401)
  const expired = await userToken('user-1', { exp: Math.floor(Date.now() / 1000) - 3600 })
  assert.equal((await call('/search', { query: 'kopi' }, { token: expired })).status, 401)
  const anon = await userToken('user-1', { aud: 'anon' })
  assert.equal((await call('/search', { query: 'kopi' }, { token: anon })).status, 401)
  assert.deepEqual(apple.search, [])
})

test('answers 404 to anything but POST /search, /reverse and /nearby', async () => {
  assert.equal((await call('/', {})).status, 404)
  assert.equal((await call('/search', {}, { method: 'GET' })).status, 404)
})

test('lists the places to eat in a small box around a spot', async () => {
  const { status, body } = await call('/nearby', { latitude: 3.13777, longitude: 101.62339 })
  assert.equal(status, 200)
  assert.equal(body.places[0].name, 'Ali Mamak')
  const params = new URLSearchParams(apple.search[0])
  assert.equal(params.get('q'), 'food')
  assert.equal(params.get('resultTypeFilter'), 'Poi')
  assert.match(params.get('includePoiCategories'), /Restaurant/)
  // Rounded to about 110 m before Apple sees it.
  assert.equal(params.get('userLocation'), '3.138,101.623')
  assert.equal(params.get('searchLocation'), null)
  assert.equal(params.get('searchRegion'), '3.148,101.633,3.128,101.613')
})

test('a bad body is a 400 and never reaches Apple', async () => {
  const { status, body } = await call('/search', { query: 'a' })
  assert.equal(status, 400)
  assert.equal(body.error, 'query_too_short')
  assert.deepEqual(apple.search, [])
})

test('stops at the user cap first, then the address cap, without calling Apple', async () => {
  env.PLACES_DAILY_LIMIT = '2'
  env.PLACES_ADDRESS_DAILY_LIMIT = '3'
  assert.equal((await call('/search', { query: 'kopi one' })).status, 200)
  assert.equal((await call('/search', { query: 'kopi two' })).status, 200)
  const capped = await call('/search', { query: 'kopi three' })
  assert.deepEqual(capped, { status: 429, body: { error: 'limit_reached' } })
  // Another account on the same network has one search left before the address cap.
  const other = await userToken('user-2')
  assert.equal((await call('/search', { query: 'kopi four' }, { token: other })).status, 200)
  assert.equal((await call('/search', { query: 'kopi five' }, { token: other })).status, 429)
  assert.equal(apple.search.length, 3)
})

test('stores an address only as a hash that changes every day', async () => {
  const today = new Date('2026-11-21T10:00:00Z')
  const tomorrow = new Date('2026-11-22T10:00:00Z')
  const a = await addressSubject('1.2.3.4', today)
  assert.match(a, /^ip:[0-9a-f]{32}$/)
  assert.notEqual(a, await addressSubject('1.2.3.4', tomorrow))
  assert.equal(dayStart(today), Date.UTC(2026, 10, 21))
})

test('says not_configured without the key, and capacity when Apple is out of quota', async () => {
  env.APPLE_MAPS_PRIVATE_KEY = ''
  assert.deepEqual(await call('/search', { query: 'kopi' }), {
    status: 503,
    body: { error: 'not_configured' },
  })
  env.APPLE_MAPS_PRIVATE_KEY = applePem
  apple.status = 429
  assert.deepEqual(await call('/search', { query: 'kopi' }), {
    status: 503,
    body: { error: 'capacity' },
  })
  // Nothing Apple refused is counted against anybody.
  assert.equal(env.DB.rows.size, 0)
})

test('answers a JSON 503 and never asks Apple when the allowance cannot be read', async () => {
  env.DB = {
    prepare: () => ({
      bind: () => ({
        all: async () => {
          throw new Error('D1 down')
        },
      }),
    }),
  }
  assert.deepEqual(await call('/search', { query: 'kopi' }), {
    status: 503,
    body: { error: 'upstream' },
  })
  assert.deepEqual(apple.search, [])
})

test('the per-minute limiter is keyed by the verified user', async () => {
  const keys = []
  env.PLACES_RL = {
    limit: async ({ key }) => {
      keys.push(key)
      return { success: false }
    },
  }
  assert.equal(
    (await call('/search', { query: 'kopi' }, { token: await userToken('u9') })).status,
    429,
  )
  assert.deepEqual(keys, ['u9'])
})

test('refuses an oversized body before reading it', async () => {
  const { status } = await call('/search', { query: 'kopi', pad: 'x'.repeat(5000) })
  assert.equal(status, 413)
})
