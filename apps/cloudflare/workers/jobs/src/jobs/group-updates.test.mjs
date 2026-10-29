import assert from 'node:assert/strict'
import test from 'node:test'
import { runJob } from '../job.ts'
import { groupUpdates } from './group-updates.ts'
import { UPDATE_LANGUAGES, updatePush } from './group-updates-copy.ts'

const target = (overrides) => ({
  token: 'ExponentPushToken[a]',
  language: 'en',
  group_id: '22222222-2222-4222-8222-222222222222',
  group_name: 'Makan Buddies',
  actor_name: 'Aisha',
  body: 'Nasi lemak (640 kcal)',
  more: 0,
  ...overrides,
})

test('reads like a chat message from the group, and opens its chat', () => {
  const push = updatePush(target())
  assert.equal(push.title, 'Makan Buddies')
  assert.equal(push.body, 'Aisha: Nasi lemak (640 kcal)')
  assert.deepEqual(push.data, {
    kind: 'group',
    groupId: '22222222-2222-4222-8222-222222222222',
    chat: true,
  })
})

test('counts the rest when it stands for several, in any language', () => {
  assert.equal(updatePush(target({ more: 2 })).body, 'Aisha: Nasi lemak (640 kcal) and 2 more')
  assert.equal(updatePush(target({ more: 2, language: 'xx' })).body.endsWith('and 2 more'), true)
  assert.equal(updatePush(target({ actor_name: ' ' })).body, 'RiceCal: Nasi lemak (640 kcal)')
})

test('carries every app language, with no dashes in a sentence', () => {
  assert.equal(UPDATE_LANGUAGES.length, 13)
  for (const language of UPDATE_LANGUAGES) {
    const body = updatePush(target({ language, more: 3 })).body
    assert.ok(body.includes('3'), language)
    assert.doesNotMatch(body, /[–—]/, language)
  }
})

/** Expo's answer: a dead device for any token ending `[dead]`. */
function fakeExpo() {
  const posted = []
  const real = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    posted.push(body)
    return new Response(
      JSON.stringify({
        data: body.map((m) =>
          m.to.endsWith('[dead]')
            ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok' },
        ),
      }),
    )
  }
  return { posted, restore: () => (globalThis.fetch = real) }
}

test('posts what the digest returns and forgets dead devices', async () => {
  const expo = fakeExpo()
  const calls = []
  try {
    const detail = await groupUpdates.run({
      env: {},
      rpc: async (name, args) => {
        calls.push([name, args])
        return name === 'group_update_digests'
          ? [target(), target({ token: 'ExponentPushToken[dead]' })]
          : null
      },
      log: () => undefined,
      scheduledAt: new Date(),
    })
    assert.equal(expo.posted[0].length, 2)
    assert.deepEqual(calls[1], ['forget_push_tokens', { p_tokens: ['ExponentPushToken[dead]'] }])
    assert.deepEqual(detail, { devices: 2, sent: 1, failed: 1 })
  } finally {
    expo.restore()
  }
})

test('an idle minute posts nothing and writes no job_runs row', async () => {
  const expo = fakeExpo()
  const calls = []
  const realFetch = globalThis.fetch
  // PostgREST, as `postgres.ts` calls it.
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/rest/v1/rpc/')) {
      calls.push(String(url).split('/rpc/')[1])
      return new Response(String(url).endsWith('group_update_digests') ? '[]' : '')
    }
    return realFetch(url, init)
  }
  try {
    await runJob(groupUpdates, new Date(), {
      SUPABASE_URL: 'https://example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
    })
    assert.deepEqual(calls, ['group_update_digests'])
    assert.equal(expo.posted.length, 0)
  } finally {
    globalThis.fetch = realFetch
    expo.restore()
  }
})

test('a busy minute is recorded, closed, in one call', async () => {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/rest/v1/rpc/')) {
      calls.push([String(url).split('/rpc/')[1], JSON.parse(init.body)])
      return new Response(
        String(url).endsWith('group_update_digests') ? JSON.stringify([target()]) : '',
      )
    }
    return new Response(JSON.stringify({ data: [{ status: 'ok' }] }))
  }
  try {
    await runJob(groupUpdates, new Date(), {
      SUPABASE_URL: 'https://example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'key',
    })
    assert.deepEqual(
      calls.map(([name]) => name),
      ['group_update_digests', 'record_job_run'],
    )
    assert.deepEqual(calls[1][1], {
      p_job: 'group-updates',
      p_ok: true,
      p_detail: { devices: 1, sent: 1, failed: 0 },
    })
  } finally {
    globalThis.fetch = real
  }
})
