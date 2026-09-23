import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@^1'

import {
  containsSocialLink,
  localReviewAllowed,
  parseReviewRequest,
  parseVerdict,
  readBoundedBytes,
  reviewPhotoBody,
  reviewSubmission,
} from './review.ts'

const ID = '11111111-1111-1111-1111-111111111111'

Deno.test('review requests accept only the named content types and UUIDs', () => {
  for (const kind of ['post', 'profile', 'comment']) {
    const body = { action: 'review', kind, id: ID }
    assertEquals(parseReviewRequest(body), body)
  }
  for (const invalid of [
    null,
    [],
    'review',
    {},
    { action: 'delete', kind: 'post', id: ID },
    { action: 'review', kind: 'food_logs', id: ID },
    { action: 'review', kind: ['post'], id: ID },
    { action: 'review', kind: 'post', id: 'anything' },
  ]) {
    assertEquals(parseReviewRequest(invalid), null)
  }
})

Deno.test('mock approval is restricted to exact local infrastructure hosts', () => {
  for (const url of ['http://kong:8000', 'http://localhost:54421', 'http://127.0.0.1:54421']) {
    assertEquals(localReviewAllowed(url), true)
  }
  for (const url of [
    '',
    'https://project.supabase.co',
    'https://localhost',
    'http://localhost.attacker.example',
    'http://kong@attacker.example',
  ]) {
    assertEquals(localReviewAllowed(url), false)
  }
})

Deno.test('a missing or malformed model verdict never approves', () => {
  assertEquals(parseVerdict({ approved: true }), true)
  assertEquals(parseVerdict({ approved: false }), false)
  for (const invalid of [null, {}, [], { approved: 'true' }, { approved: 1 }]) {
    assertThrows(() => parseVerdict(invalid))
  }
})

Deno.test('local review exercises approval, rejection and failure without a provider', async () => {
  const names = ['SUPABASE_URL', 'OPENROUTER_API_KEY', 'MOCK_AI']
  const previous = names.map((name) => Deno.env.get(name))
  try {
    Deno.env.set('SUPABASE_URL', 'http://kong:8000')
    Deno.env.delete('OPENROUTER_API_KEY')
    assertEquals(await reviewSubmission('post', 'Nasi lemak\nLunch with friends', null), true)
    assertEquals(await reviewSubmission('comment', 'A comment', null, { approved: false }), false)
    await assertRejects(() => reviewSubmission('profile', 'Cook', null, { fail: true }))
    assertEquals(await reviewSubmission('post', 'Visit https://spam.example', null), false)
    Deno.env.set('SUPABASE_URL', 'https://project.supabase.co')
    Deno.env.set('MOCK_AI', 'true')
    await assertRejects(
      () => reviewSubmission('post', 'Lunch', null, { approved: true }),
      Error,
      'not set',
    )
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) Deno.env.delete(name)
      else Deno.env.set(name, previous[i] as string)
    })
  }
})

Deno.test('link filtering works for common spam without rejecting punctuation in food names', () => {
  for (const text of [
    'www.example.com',
    'buy at example.shop',
    'https://example.test',
    'example.COM',
    'buy at example.Shop',
  ]) {
    assertEquals(containsSocialLink(text), true)
  }
  assertEquals(containsSocialLink('炒饭 with sambal. Very good!'), false)
})

Deno.test('bounded streaming rejects oversized input even without a content length', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]))
      controller.enqueue(new Uint8Array([3, 4]))
      controller.close()
    },
  })
  assertEquals(await readBoundedBytes(body, 4), new Uint8Array([1, 2, 3, 4]))
  await assertRejects(() => readBoundedBytes(new Response('12345').body, 4), Error, 'too large')
  await assertRejects(() => readBoundedBytes(null, 4), Error, 'missing body')
})

Deno.test('image review captures the exact object version and refuses non-images', () => {
  assertEquals(reviewPhotoBody(new Uint8Array([1, 2]), 'image/jpeg', '"abc123"'), {
    image: 'data:image/jpeg;base64,AQI=',
    etag: '"abc123"',
  })
  assertThrows(() => reviewPhotoBody(new Uint8Array([1]), 'text/html', '"abc"'))
  assertThrows(() => reviewPhotoBody(new Uint8Array([1]), 'image/jpeg', null))
  assertThrows(() => reviewPhotoBody(new Uint8Array([1]), 'image/jpeg', '*'))
  assertThrows(() => reviewPhotoBody(new Uint8Array(), 'image/jpeg', '"abc"'))
})
