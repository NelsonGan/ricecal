import assert from 'node:assert/strict'
import test from 'node:test'
import { runJob } from '../job.ts'
import { groupUpdates } from './group-updates.ts'
import { UPDATE_LANGUAGES, updatePush } from './group-updates-copy.ts'
import { WARNING_LANGUAGES } from './photo-warnings-copy.ts'

const target = (overrides) => ({
  user_id: '11111111-1111-4111-8111-111111111111',
  token: 'ExponentPushToken[a]',
  language: 'en',
  group_id: '22222222-2222-4222-8222-222222222222',
  group_name: 'Makan Buddies',
  actor_name: 'Aisha',
  body: 'Nasi lemak (640 kcal)',
  more: 0,
  ...overrides,
})

const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'key' }

/**
 * PostgREST and Expo in one stub. `digests` answers each call in turn; Expo
 * answers DeviceNotRegistered for a token ending `[dead]`, InvalidCredentials
 * for one ending `[android]` (no FCM key on the project), or `expoStatus`.
 */
function stub({ digests = [], expoStatus = 200 } = {}) {
  const rpcs = []
  const posted = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    if (href.includes('/rest/v1/rpc/')) {
      const name = href.split('/rpc/')[1]
      rpcs.push([name, JSON.parse(init.body)])
      if (name === 'group_update_digests')
        return new Response(JSON.stringify(digests.shift() ?? []))
      return new Response('')
    }
    const body = JSON.parse(init.body)
    posted.push(body)
    if (expoStatus !== 200)
      return new Response('{"errors":[{"code":"UNAUTHORIZED"}]}', { status: expoStatus })
    return new Response(
      JSON.stringify({
        data: body.map((m) =>
          m.to.endsWith('[dead]')
            ? {
                status: 'error',
                message: `"${m.to}" is not a registered push notification recipient`,
                details: { error: 'DeviceNotRegistered' },
              }
            : m.to.endsWith('[android]')
              ? {
                  status: 'error',
                  message: 'Unable to retrieve the FCM server key',
                  details: { error: 'InvalidCredentials' },
                }
              : { status: 'ok' },
        ),
      }),
    )
  }
  return { rpcs, posted, restore: () => (globalThis.fetch = real) }
}

test('is a chat push from the group, which opens its chat', () => {
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
  assert.equal(updatePush(target({ actor_name: ' ' })).body, 'RiceCal: Nasi lemak (640 kcal)')
  // A language an app wrote that is no language, prototype keys included.
  for (const language of ['xx', '__proto__', 'toString', 'constructor']) {
    assert.equal(
      updatePush(target({ more: 2, language })).body.endsWith('and 2 more'),
      true,
      language,
    )
  }
})

test('carries the same languages as the other pushes, with no dashes', () => {
  assert.deepEqual([...UPDATE_LANGUAGES].sort(), [...WARNING_LANGUAGES].sort())
  for (const language of UPDATE_LANGUAGES) {
    const body = updatePush(target({ language, more: 3 })).body
    assert.ok(body.includes('3'), language)
    assert.doesNotMatch(body, /[–—]/, language)
  }
})

test('posts each page and forgets dead devices, stopping at a short page', async () => {
  const full = Array.from({ length: 90 }, (_, i) =>
    target({ user_id: `u${i}`, token: `ExponentPushToken[${i}]` }),
  )
  const s = stub({ digests: [full, [target({ token: 'ExponentPushToken[dead]' })]] })
  try {
    const detail = await groupUpdates.run({
      env,
      rpc: rpcOf(),
      log: () => undefined,
      scheduledAt: new Date(),
    })
    assert.deepEqual(
      s.rpcs.map(([name]) => name),
      ['group_update_digests', 'group_update_digests', 'forget_push_tokens'],
    )
    assert.deepEqual(s.rpcs[0][1], { p_limit: 90 })
    assert.deepEqual(s.rpcs[2][1], { p_tokens: ['ExponentPushToken[dead]'] })
    assert.equal(s.posted.length, 2)
    assert.deepEqual(detail, {
      people: 91,
      devices: 91,
      sent: 90,
      failed: 1,
      refused_DeviceNotRegistered: 1,
    })
  } finally {
    s.restore()
  }
})

test('every push refused is a failure, with Expo’s reason in the log', async () => {
  const s = stub({ digests: [[target()]], expoStatus: 401 })
  const errors = []
  const realError = console.error
  console.error = (...args) => errors.push(args)
  try {
    await assert.rejects(runJob(groupUpdates, new Date(), env), /refused all 1 update pushes/)
    assert.match(JSON.stringify(errors[0]), /401.*UNAUTHORIZED/)
    const recorded = s.rpcs.find(([name]) => name === 'record_job_run')[1]
    assert.equal(recorded.p_ok, false)
    assert.equal(recorded.p_detail.runs, 1)
    assert.equal(recorded.p_detail.refused_Unanswered, 1)
  } finally {
    console.error = realError
    s.restore()
  }
})

test('says why Expo refused, in the error and in the hour it records', async () => {
  const s = stub({ digests: [[target({ token: 'ExponentPushToken[android]' })]] })
  const realWarn = console.warn
  console.warn = () => {}
  try {
    await assert.rejects(
      runJob(groupUpdates, new Date(), env),
      /refused all 1 update pushes \(InvalidCredentials 1\)/,
    )
    const recorded = s.rpcs.find(([name]) => name === 'record_job_run')[1]
    assert.equal(recorded.p_ok, false)
    assert.equal(recorded.p_detail.runs, 1)
    assert.equal(recorded.p_detail.refused_InvalidCredentials, 1)
  } finally {
    console.warn = realWarn
    s.restore()
  }
})

test('counts each refusal by reason when some pushes go through', async () => {
  const s = stub({
    digests: [
      [
        target(),
        target({
          user_id: '33333333-3333-4333-8333-333333333333',
          token: 'ExponentPushToken[android]',
        }),
        target({
          user_id: '44444444-4444-4444-8444-444444444444',
          token: 'ExponentPushToken[dead]',
        }),
      ],
    ],
  })
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    await runJob(groupUpdates, new Date(), env)
    const recorded = s.rpcs.find(([name]) => name === 'record_job_run')[1]
    assert.equal(recorded.p_ok, true)
    assert.equal(recorded.p_detail.sent, 1)
    assert.equal(recorded.p_detail.failed, 2)
    assert.equal(recorded.p_detail.refused_InvalidCredentials, 1)
    assert.equal(recorded.p_detail.refused_DeviceNotRegistered, 1)
    // record_job_run sums every value as a number, so the detail stays flat.
    for (const value of Object.values(recorded.p_detail)) assert.equal(typeof value, 'number')
    assert.match(JSON.stringify(warnings), /InvalidCredentials/)
    // Expo quotes the dead token, and a token is enough to push to a phone.
    assert.doesNotMatch(JSON.stringify(warnings), /ExponentPushToken\[dead\]/)
    assert.match(JSON.stringify(warnings), /ExponentPushToken\[redacted\]/)
  } finally {
    console.warn = realWarn
    s.restore()
  }
})

test('an idle minute posts nothing and adds one run to the hour', async () => {
  const s = stub()
  try {
    await runJob(groupUpdates, new Date(), env)
    assert.deepEqual(
      s.rpcs.map(([name]) => name),
      ['group_update_digests', 'record_job_run'],
    )
    assert.deepEqual(s.rpcs[1][1], {
      p_job: 'group-updates',
      p_ok: true,
      p_detail: { runs: 1, people: 0, devices: 0, sent: 0, failed: 0 },
    })
    assert.equal(s.posted.length, 0)
  } finally {
    s.restore()
  }
})

/** The job's own `rpc`, through the stubbed fetch, as `postgres.ts` makes it. */
function rpcOf() {
  return async (name, args) => {
    const response = await fetch(`https://example.test/rest/v1/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(args ?? {}),
    })
    const body = await response.text()
    return body ? JSON.parse(body) : null
  }
}

test('keeps Expo’s request-level errors when it answers with no tickets', async () => {
  const real = globalThis.fetch
  const rpcs = []
  let digests = [[target()]]
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    if (href.includes('/rest/v1/rpc/')) {
      const name = href.split('/rpc/')[1]
      rpcs.push([name, JSON.parse(init.body)])
      if (name === 'group_update_digests')
        return new Response(JSON.stringify(digests.shift() ?? []))
      return new Response('')
    }
    return new Response(
      JSON.stringify({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'mixed' }] }),
    )
  }
  const warnings = []
  const realWarn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    await assert.rejects(runJob(groupUpdates, new Date(), env), /\(NoTicket 1\)/)
    assert.match(JSON.stringify(warnings), /PUSH_TOO_MANY_EXPERIENCE_IDS/)
  } finally {
    console.warn = realWarn
    globalThis.fetch = real
    digests = []
  }
})
