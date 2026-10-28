import assert from 'node:assert/strict'
import test from 'node:test'
import { photoWarnings } from './photo-warnings.ts'
import { WARNING_LANGUAGES, warningPush } from './photo-warnings-copy.ts'

// A Wednesday morning in Kuala Lumpur.
const now = new Date('2026-10-28T03:07:00.000Z')
const target = (overrides) => ({
  token: 'ExponentPushToken[a]',
  user_id: '11111111-1111-4111-8111-111111111111',
  language: 'en',
  timezone: 'Asia/Kuala_Lumpur',
  photo_count: 14,
  removes_by: '2026-10-30T09:00:00.000Z',
  ...overrides,
})

test('names the weekday the photos are gone by', () => {
  const push = warningPush(target(), now)
  assert.equal(push.title, 'Meal photos expiring')
  assert.equal(push.body, '14 meal photos will be removed by Friday.')
  assert.deepEqual(push.data, { kind: 'photos' })
})

test('says today, tomorrow and one photo plainly', () => {
  assert.equal(
    warningPush(target({ photo_count: 1, removes_by: '2026-10-28T10:00:00.000Z' }), now).body,
    '1 meal photo will be removed today.',
  )
  assert.match(
    warningPush(target({ removes_by: '2026-10-29T10:00:00.000Z' }), now).body,
    /tomorrow/,
  )
})

test('reads the day in the account zone and falls back on a bad one', () => {
  // 23:30 UTC Thursday is already Friday in Kuala Lumpur.
  assert.match(
    warningPush(target({ removes_by: '2026-10-29T23:30:00.000Z' }), now).body,
    /by Friday/,
  )
  assert.match(warningPush(target({ timezone: 'Not/AZone' }), now).body, /by Friday/)
  assert.equal(warningPush(target({ language: 'xx' }), now).title, 'Meal photos expiring')
})

test('carries every app language, with no dashes in a sentence', () => {
  assert.equal(WARNING_LANGUAGES.length, 13)
  for (const language of WARNING_LANGUAGES) {
    const push = warningPush(target({ language }), now)
    assert.ok(push.body.includes('14'), language)
    assert.doesNotMatch(`${push.title} ${push.body}`, /[–—]/, language)
  }
})

test('pushes each batch, forgets dead devices and stops when drained', async () => {
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
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
  try {
    const detail = await photoWarnings.run({
      env: {},
      rpc: async (name, args) => {
        calls.push([name, args])
        if (name === 'forget_push_tokens') return 1
        const first = calls.filter(([n]) => n === 'photo_removal_push_targets').length === 1
        return first ? [target(), target({ token: 'ExponentPushToken[dead]' })] : []
      },
      log: () => undefined,
      scheduledAt: now,
    })
    assert.deepEqual(calls[0], [
      'photo_removal_push_targets',
      { p_days: 6, p_limit: 200, p_after: null },
    ])
    assert.deepEqual(calls[1], ['forget_push_tokens', { p_tokens: ['ExponentPushToken[dead]'] }])
    // The second call starts after the last account the first one returned.
    assert.equal(calls[2][1].p_after, '11111111-1111-4111-8111-111111111111')
    assert.deepEqual(detail, { accounts: 1, sent: 1, failed: 1, batches: 2, drained: true })
  } finally {
    globalThis.fetch = realFetch
  }
})
