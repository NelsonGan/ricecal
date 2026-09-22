import { assertEquals } from 'jsr:@std/assert@^1'

import { claimOwnedKeys, claimReadableKeys, claimSocialKeys, isRecipeShareSlug } from './access.ts'

const READER = '11111111-1111-1111-1111-111111111111'
const COOK = '22222222-2222-2222-2222-222222222222'
const OWN = `meals/${READER}/own.jpg`
const COMMUNITY = `meals/${COOK}/community.jpg`

Deno.test('social reads require a currently visible approved image version, including for self', async () => {
  assertEquals(await claimSocialKeys([OWN], async () => []), {
    error: 'not a visible reviewed social photo',
    status: 403,
  })
  assertEquals(
    await claimSocialKeys([COMMUNITY, COMMUNITY], async () => [
      {
        owner_id: COOK,
        photo_path: COMMUNITY,
        photo_etag: '"abc123"',
        kind: 'meal',
      },
    ]),
    { keys: [COMMUNITY], etags: { [COMMUNITY]: '"abc123"' } },
  )
})

Deno.test('social image grants cannot borrow a foreign key, private avatar, or wildcard version', async () => {
  for (const row of [
    { owner_id: READER, photo_path: COMMUNITY, photo_etag: '"abc"', kind: 'meal' as const },
    { owner_id: COOK, photo_path: COMMUNITY, photo_etag: '*', kind: 'meal' as const },
    { owner_id: COOK, photo_path: COMMUNITY, photo_etag: null, kind: 'meal' as const },
    { owner_id: COOK, photo_path: COMMUNITY, photo_etag: '"abc"', kind: 'avatar' as const },
  ]) {
    assertEquals(await claimSocialKeys([COMMUNITY], async () => [row]), {
      error: 'not a visible reviewed social photo',
      status: 403,
    })
  }
  const avatar = `avatars/${COOK}/avatar.jpg`
  assertEquals(
    await claimSocialKeys([avatar], async () => [
      {
        owner_id: COOK,
        photo_path: avatar,
        photo_etag: '"123"',
        kind: 'avatar',
      },
    ]),
    { keys: [avatar], etags: { [avatar]: '"123"' } },
  )
})

Deno.test('one unauthorized social image denies the entire bounded batch', async () => {
  assertEquals(
    await claimSocialKeys([OWN, COMMUNITY], async () => [
      {
        owner_id: COOK,
        photo_path: COMMUNITY,
        photo_etag: '"abc"',
        kind: 'meal',
      },
    ]),
    { error: 'not a visible reviewed social photo', status: 403 },
  )
  assertEquals(await claimSocialKeys([], async () => []), {
    error: 'keys must be a non-empty array',
    status: 400,
  })
  assertEquals(await claimSocialKeys(Array(101).fill(OWN), async () => []), {
    error: 'at most 100 keys per request',
    status: 400,
  })
})

Deno.test('private recipe credentials accept only opaque share tokens', () => {
  assertEquals(isRecipeShareSlug('0123456789abcdef0123456789abcdef'), true)
  assertEquals(isRecipeShareSlug('family-dinner-0123456789abcdef'), false)
  assertEquals(isRecipeShareSlug(''), false)
  assertEquals(isRecipeShareSlug(123), false)
})

Deno.test('a caller can read and delete their own image without a recipe lookup', async () => {
  let lookedUp = false
  const read = await claimReadableKeys([OWN], READER, async () => {
    lookedUp = true
    return []
  })

  assertEquals(read, { keys: [OWN] })
  assertEquals(claimOwnedKeys([OWN], READER), { keys: [OWN] })
  assertEquals(lookedUp, false)
})

Deno.test('an RLS-visible community recipe grants a read but never a delete', async () => {
  const read = await claimReadableKeys([OWN, COMMUNITY], READER, async () => [
    { owner_id: COOK, photo_path: COMMUNITY },
  ])

  assertEquals(read, { keys: [OWN, COMMUNITY] })
  assertEquals(claimOwnedKeys([COMMUNITY], READER), { error: 'not your object', status: 403 })
})

Deno.test('a recipe hidden by RLS grants no image access', async () => {
  const read = await claimReadableKeys([OWN, COMMUNITY], READER, async () => [])

  assertEquals(read, { error: 'not your object or a visible recipe photo', status: 403 })
})

Deno.test('a visible recipe cannot grant access to another account image', async () => {
  const read = await claimReadableKeys([COMMUNITY], READER, async () => [
    { owner_id: READER, photo_path: COMMUNITY },
  ])

  assertEquals(read, { error: 'not your object or a visible recipe photo', status: 403 })
})

Deno.test('a visible recipe cannot escape its owner folder with path traversal', async () => {
  const traversal = `meals/${COOK}/../${READER}/secret.jpg`
  const read = await claimReadableKeys([traversal], READER, async () => [
    { owner_id: COOK, photo_path: traversal },
  ])

  assertEquals(read, { error: 'not your object or a visible recipe photo', status: 403 })
})

Deno.test('a recipe cannot expose its author avatar as a food photo', async () => {
  const avatar = `avatars/${COOK}/avatar.jpg`
  const read = await claimReadableKeys([avatar], READER, async () => [
    { owner_id: COOK, photo_path: avatar },
  ])

  assertEquals(read, { error: 'not your object or a visible recipe photo', status: 403 })
})
