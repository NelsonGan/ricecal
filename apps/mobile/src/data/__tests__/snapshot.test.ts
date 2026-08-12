import {
  ENTRY_FOOD_ID,
  ENTRY_SERVING_ID,
  packetCode,
  packetFoodId,
  snapshotFromFood,
} from '@/data/snapshot'
import type { Food } from '@/data/types'

/**
 * The ids this app invents, and where they stop.
 *
 * Three kinds of food reach the detail screen without a catalogue row behind
 * them: an entry the scan wrote itself, a recipe, and a SCANNED PACKET — which
 * lives in D1 keyed by its barcode and has no `foods.id` at all. Each one still
 * needs something to put in a `[id]` route segment and something for the
 * portion picker to select, so each one travels under a placeholder.
 *
 * `food_logs.food_id` is a uuid column. A placeholder reaching it is not a
 * dangling reference that a later job could tidy up: it is a 22P02 that fails
 * the save, on the last tap of the flow. That is the whole reason these tests
 * exist, and both directions matter — the filter that drops a placeholder must
 * not also drop a real id, or every entry logged from search would lose its
 * provenance silently.
 */

const food = (over: Partial<Food> = {}): Food => ({
  id: 'a3f1c2d4-0000-4000-8000-000000000001',
  name: 'Milo Activ-Go 3-in-1',
  place: 'packaged',
  servingLabel: '33 g',
  servings: [{ id: 'a3f1c2d4-0000-4000-8000-000000000001:base', label: '33 g', factor: 1 }],
  macros: { kcal: 140, carbs: 24, protein: 3, fat: 3.5 },
  extras: {},
  verified: false,
  ...over,
})

describe('packet ids', () => {
  it('round-trips the code printed on the packet', () => {
    expect(packetCode(packetFoodId('9556001234567'))).toBe('9556001234567')
  })

  it('does not claim an ordinary catalogue id', () => {
    expect(packetCode('a3f1c2d4-0000-4000-8000-000000000001')).toBeUndefined()
    expect(packetCode(undefined)).toBeUndefined()
  })
})

describe('snapshotFromFood', () => {
  it('keeps the ids of a dish that really is in the catalogue', () => {
    const snapshot = snapshotFromFood(food())

    expect(snapshot.foodId).toBe('a3f1c2d4-0000-4000-8000-000000000001')
    expect(snapshot.servingId).toBe('a3f1c2d4-0000-4000-8000-000000000001:base')
  })

  it('drops a scanned packet placeholder, and keeps its numbers', () => {
    const id = packetFoodId('9556001234567')
    const snapshot = snapshotFromFood(
      food({ id, servings: [{ id: `${id}:base`, label: '33 g', factor: 1 }] }),
    )

    expect(snapshot.foodId).toBeUndefined()
    expect(snapshot.servingId).toBeUndefined()
    // The entry carries its own figures, which is what makes the missing
    // reference harmless rather than a hole in the diary.
    expect(snapshot.base.kcal).toBe(140)
    expect(snapshot.servingLabel).toBe('33 g')
  })

  it('drops the placeholders an entry with no catalogue row travels under', () => {
    const snapshot = snapshotFromFood(
      food({
        id: ENTRY_FOOD_ID,
        servings: [{ id: ENTRY_SERVING_ID, label: '1 serving', factor: 1 }],
      }),
    )

    expect(snapshot.foodId).toBeUndefined()
    expect(snapshot.servingId).toBeUndefined()
  })
})
