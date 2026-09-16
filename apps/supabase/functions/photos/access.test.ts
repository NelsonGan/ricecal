import { assertEquals } from 'jsr:@std/assert@^1'

import { claimOwnedKeys, claimReadableKeys } from './access.ts'

const READER = '11111111-1111-1111-1111-111111111111'
const COOK = '22222222-2222-2222-2222-222222222222'
const OWN = `meals/${READER}/own.jpg`
const COMMUNITY = `meals/${COOK}/community.jpg`

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

Deno.test('a recipe cannot expose its author avatar as a food photo', async () => {
  const avatar = `avatars/${COOK}/avatar.jpg`
  const read = await claimReadableKeys([avatar], READER, async () => [
    { owner_id: COOK, photo_path: avatar },
  ])

  assertEquals(read, { error: 'not your object or a visible recipe photo', status: 403 })
})
