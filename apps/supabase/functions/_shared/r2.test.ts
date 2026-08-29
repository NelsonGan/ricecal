import { assertEquals } from 'jsr:@std/assert@^1'

import { deleteUserObjects, listKeys, ownsKey } from './r2.ts'

/**
 * The two things in `r2.ts` that a mistake would make silently wrong.
 *
 * `ownsKey` is the only authorization there is, so it is tested here rather than
 * only in the functions that call it.
 *
 * The sweep is the other. `deleteUserObjects` is what account deletion relies on
 * to leave nothing behind, and every way it can fail leaves a user's photographs
 * in a bucket with no row naming them: a second page never asked for, a prefix
 * built without its trailing slash, an escaped key the regex misses. None of
 * those throw; they delete less than everything and report success.
 */

const USER = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'

/**
 * A fake S3, as a `fetch`.
 *
 * aws4fetch signs against this the same way it signs against R2 — the
 * signature is Web Crypto over the request, so nothing about it needs a
 * network — which means the URL each call arrives at is the real one this
 * module would have sent.
 */
function fakeS3(pages: Record<string, string[]>) {
  const listed: string[] = []
  const deleted: string[] = []

  const fetcher = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // aws4fetch signs by building a `Request` and handing THAT to fetch, so the
    // url and the method are on the object rather than in the arguments.
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : String(input))
    const method = request?.method ?? init?.method ?? 'GET'

    if (method === 'DELETE') {
      deleted.push(url.pathname.replace('/ricecal/', ''))
      return Promise.resolve(new Response(null, { status: 204 }))
    }

    const prefix = url.searchParams.get('prefix') ?? ''
    listed.push(prefix)
    const keys = pages[prefix] ?? []
    // One page per 2 keys, so the continuation path is exercised by a fixture
    // small enough to read.
    const from = Number(url.searchParams.get('continuation-token') ?? '0')
    const page = keys.slice(from, from + 2)
    const truncated = from + 2 < keys.length

    return Promise.resolve(
      new Response(
        `<?xml version="1.0"?><ListBucketResult>` +
          page.map((key) => `<Contents><Key>${key}</Key></Contents>`).join('') +
          `<IsTruncated>${truncated}</IsTruncated>` +
          (truncated ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : '') +
          `</ListBucketResult>`,
        { status: 200 },
      ),
    )
  }

  return { fetcher, listed, deleted }
}

/**
 * `async`, and it has to be: restoring `globalThis.fetch` in a `finally` that
 * runs before the work it wraps has settled puts the real fetch back under a
 * request still in flight, and the test then fails on a network permission
 * rather than on anything it is about.
 */
async function withS3<T>(
  pages: Record<string, string[]>,
  work: (fake: ReturnType<typeof fakeS3>) => T | Promise<T>,
): Promise<T> {
  Deno.env.set('R2_ACCOUNT_ID', 'test')
  Deno.env.set('R2_ACCESS_KEY_ID', 'key')
  Deno.env.set('R2_SECRET_ACCESS_KEY', 'secret')
  Deno.env.set('R2_BUCKET', 'ricecal')
  Deno.env.set('R2_ENDPOINT', 'https://s3.example')

  const fake = fakeS3(pages)
  const original = globalThis.fetch
  globalThis.fetch = fake.fetcher as typeof fetch
  try {
    return await work(fake)
  } finally {
    globalThis.fetch = original
  }
}

Deno.test('a key belongs to its own folder and to no other', () => {
  assertEquals(ownsKey(`meals/${USER}/a.jpg`, USER), true)
  assertEquals(ownsKey(`avatars/${USER}/a.jpg`, USER), true)
  assertEquals(ownsKey(`meals/${OTHER}/a.jpg`, USER), false)
  // A prefix that merely STARTS with the id is not the id's folder.
  assertEquals(ownsKey(`meals/${USER}x/a.jpg`, USER), false)
  assertEquals(ownsKey(`meals/${USER}/../${OTHER}/a.jpg`, USER), false)
  assertEquals(ownsKey(`meals/${USER}/a.jpg?x=1`, USER), false)
})

Deno.test('listing follows the continuation token to the last page', async () => {
  const keys = ['a', 'b', 'c', 'd', 'e'].map((name) => `meals/${USER}/${name}.jpg`)

  const listed = await withS3({ [`meals/${USER}/`]: keys }, () => listKeys(`meals/${USER}/`))

  // Five keys over three pages. Stopping at the first would have returned two
  // and looked like a complete answer.
  assertEquals(listed, keys)
})

Deno.test('the sweep clears both prefixes and nobody else', async () => {
  const mine = [`meals/${USER}/one.jpg`, `meals/${USER}/two.jpg`]
  const avatar = [`avatars/${USER}/me.jpg`]

  const { count, fake } = await withS3(
    {
      [`meals/${USER}/`]: mine,
      [`avatars/${USER}/`]: avatar,
      // Present in the fixture and not under either prefix, so a sweep that
      // listed the bucket instead of the folder would take it.
      [`meals/${OTHER}/`]: [`meals/${OTHER}/theirs.jpg`],
    },
    async (fake) => ({ count: await deleteUserObjects(USER), fake }),
  )

  assertEquals(count, 3)
  assertEquals(fake.deleted.sort(), [...mine, ...avatar].sort())
  assertEquals(fake.listed.sort(), [`avatars/${USER}/`, `meals/${USER}/`])
})

Deno.test('a user with nothing stored is a sweep that deletes nothing', async () => {
  const { count, fake } = await withS3({}, async (fake) => ({
    count: await deleteUserObjects(USER),
    fake,
  }))

  assertEquals(count, 0)
  assertEquals(fake.deleted, [])
})
