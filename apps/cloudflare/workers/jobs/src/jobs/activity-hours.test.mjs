import assert from 'node:assert/strict'
import test from 'node:test'
import { activityHours } from './activity-hours.ts'

const scheduledAt = new Date('2026-10-03T12:37:00.000Z')
const before = '2026-09-02'

test('keeps the scheduled time fixed and drains several bounded batches', async () => {
  const counts = [1000, 1000, 7]
  const detail = await activityHours.run({
    scheduledAt,
    rpc: async (name, args) => {
      assert.equal(name, 'prune_activity_hours')
      assert.deepEqual(args, { p_asof: scheduledAt.toISOString(), p_limit: 1000 })
      return { pruned: counts.shift(), before, remaining: counts.length > 0 }
    },
    log: () => assert.fail('completed cleanup should not report a backlog'),
  })
  assert.deepEqual(detail, { pruned: 2007, batches: 3, before, drained: true })
})

test('bounds a backlog and records that the next hour must continue', async () => {
  let calls = 0
  const logs = []
  const detail = await activityHours.run({
    scheduledAt,
    rpc: async () => {
      calls += 1
      return { pruned: 1000, before, remaining: true }
    },
    log: (...args) => logs.push(args),
  })
  assert.equal(calls, 20)
  assert.deepEqual(detail, { pruned: 20000, batches: 20, before, drained: false })
  assert.equal(logs.length, 1)
})

test('does not mistake locked expired rows for a completed cleanup or spin on them', async () => {
  let calls = 0
  const detail = await activityHours.run({
    scheduledAt,
    rpc: async () => {
      calls += 1
      return { pruned: 0, before, remaining: true }
    },
    log: () => undefined,
  })
  assert.equal(calls, 1)
  assert.equal(detail.drained, false)
})

test('an empty table is a completed cleanup', async () => {
  const detail = await activityHours.run({
    scheduledAt,
    rpc: async () => ({ pruned: 0, before, remaining: false }),
    log: () => assert.fail('empty table should not report a backlog'),
  })
  assert.deepEqual(detail, { pruned: 0, batches: 1, before, drained: true })
})

test('database failures propagate so the wrapper records and retries the run', async () => {
  await assert.rejects(
    activityHours.run({
      scheduledAt,
      rpc: async () => {
        throw new Error('database unavailable')
      },
      log: () => undefined,
    }),
    /database unavailable/,
  )
})
