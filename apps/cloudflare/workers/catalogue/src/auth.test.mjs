import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

const project = 'https://example.supabase.co'
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const epoch = 1_800_000_000_000
let now
let verifyUser

async function signer(kid) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'ES256' }
  const token = async (claims = {}, header = {}) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const body = `${encode({ alg: 'ES256', kid, ...header })}.${encode({
      sub: account,
      aud: 'authenticated',
      iss: `${project}/auth/v1`,
      exp: Math.floor(now / 1000) + 3600,
      ...claims,
    })}`
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      new TextEncoder().encode(body),
    )
    return `${body}.${Buffer.from(signature).toString('base64url')}`
  }
  return { jwk, token }
}

beforeEach(async (t) => {
  now = epoch
  t.mock.method(Date, 'now', () => now)
  // Each test gets an empty isolate cache without adding a production reset API.
  ;({ verifyUser } = await import(`./auth.ts?test=${encodeURIComponent(t.name)}`))
  t.mock.method(console, 'error', () => undefined)
})
afterEach((t) => t.mock.restoreAll())

function serveKeys(t, getKeys) {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls += 1
    assert.equal(url, `${project}/auth/v1/.well-known/jwks.json`)
    // Keep the request pending across concurrent verifications.
    await new Promise((resolve) => setImmediate(resolve))
    return getKeys(calls)
  })
  return () => calls
}
const document = (...keys) => Response.json({ keys })

async function burst(token, expected = { id: account }) {
  const results = await Promise.all(Array.from({ length: 12 }, () => verifyUser(token, project)))
  for (const result of results) assert.deepEqual(result, expected)
}

test('a cold burst shares one lookup and later requests use the cache', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, () => document(key.jwk))
  const token = await key.token()
  await burst(token)
  assert.equal(count(), 1)
  assert.deepEqual(await verifyUser(token, project), { id: account })
  assert.equal(count(), 1)
})

test('a rotation burst shares one refresh and accepts the new signing key', async (t) => {
  const old = await signer('old')
  const next = await signer('next')
  const count = serveKeys(t, (call) => document(call === 1 ? old.jwk : next.jwk))
  assert.deepEqual(await verifyUser(await old.token(), project), { id: account })
  now += 31_000
  await burst(await next.token())
  assert.equal(count(), 2)
})

test('expired cached keys trigger one refresh for concurrent requests', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, () => document(key.jwk))
  const token = await key.token()
  await verifyUser(token, project)
  now += 601_000
  await burst(token)
  assert.equal(count(), 2)
})

test('unknown key IDs respect the refetch floor during and after a burst', async (t) => {
  const trusted = await signer('trusted')
  const unknown = await signer('unknown')
  const count = serveKeys(t, () => document(trusted.jwk))
  const token = await unknown.token()
  await burst(token, null)
  await burst(token, null)
  assert.equal(count(), 1)
  now += 31_000
  await burst(token, null)
  assert.equal(count(), 2)
})

test('a failed cold lookup is released so the next request can recover', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, (call) => {
    if (call === 1) throw new Error('offline')
    return document(key.jwk)
  })
  const token = await key.token()
  await burst(token, null)
  await burst(token)
  assert.equal(count(), 2)
})

test('an unavailable key endpoint retains trusted keys and releases the lookup', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, (call) =>
    call === 2 ? new Response(null, { status: 503 }) : document(key.jwk),
  )
  const token = await key.token()
  await verifyUser(token, project)
  now += 601_000
  await burst(token)
  assert.equal(count(), 2)
  await verifyUser(token, project)
  assert.equal(count(), 3)
})

test('sharing keys never bypasses signature verification', async (t) => {
  const trusted = await signer('same-id')
  const forged = await signer('same-id')
  const count = serveKeys(t, () => document(trusted.jwk))
  await burst(await forged.token(), null)
  await burst(await trusted.token())
  assert.equal(count(), 1)
})

test('verified tokens still require a live expiry, correct audience, issuer and account', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, () => document(key.jwk))
  for (const claims of [
    { exp: Math.floor(now / 1000) - 31 },
    { aud: 'anon' },
    { iss: 'https://other.supabase.co/auth/v1' },
    { sub: '' },
  ]) {
    assert.equal(await verifyUser(await key.token(claims), project), null)
  }
  assert.equal(count(), 1)
})

test('malformed tokens and unsupported algorithms never fetch signing keys', async (t) => {
  const key = await signer('first')
  const count = serveKeys(t, () => document(key.jwk))
  for (const token of [
    'bad',
    'bad.bad.bad',
    await key.token({}, { alg: 'none' }),
    await key.token({}, { alg: 'HS256' }),
  ]) {
    assert.equal(await verifyUser(token, project), null)
  }
  assert.equal(count(), 0)
})
