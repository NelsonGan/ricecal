import assert from 'node:assert/strict'
import test from 'node:test'
import { retention } from './retention.ts'

test('clears only the exact meal key deleted from R2', async () => {
  const photo = {
    id: '11111111-1111-4111-8111-111111111111',
    photo_path: 'meals/22222222-2222-4222-8222-222222222222/old.jpg',
    item_name: 'Nasi lemak',
  }
  const events = []
  let clearRows
  const detail = await retention.run({
    env: {
      PHOTOS: {
        delete: async (keys) => {
          events.push('delete')
          assert.deepEqual(keys, [photo.photo_path])
        },
      },
    },
    rpc: async (name, args) => {
      events.push(name)
      if (name === 'expired_meal_photos') {
        assert.deepEqual(args, { p_limit: 500 })
        return [photo]
      }
      assert.equal(name, 'clear_meal_photos')
      clearRows = args.p_rows
      return args.p_rows.length
    },
    log: () => undefined,
    scheduledAt: new Date('2026-09-23T00:17:00.000Z'),
  })

  assert.deepEqual(events, ['expired_meal_photos', 'delete', 'clear_meal_photos'])
  assert.deepEqual(clearRows, [
    {
      id: photo.id,
      photo_path: photo.photo_path,
      icon_set: 'dishes',
      icon_name: 'nasi-lemak',
    },
  ])
  assert.deepEqual(detail, { swept: 1, batches: 1, drained: true })
})
