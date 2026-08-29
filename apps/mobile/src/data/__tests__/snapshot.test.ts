import {
  ENTRY_FOOD_ID,
  ENTRY_SERVING_ID,
  foodFromEntry,
  packetCode,
  packetFoodId,
  snapshotFromFood,
  withCataloguePortions,
} from '@/data/snapshot'
import type { Food } from '@/data/types'

/**
 * The ids this app invents, and where they stop.
 *
 * Three kinds of food reach the detail screen with no catalogue row behind them:
 * an entry the scan wrote itself, a recipe, and a scanned packet, which lives in
 * D1 keyed by its barcode and has no `foods.id` at all. Each still needs
 * something for the `[id]` route segment, so each travels under a placeholder.
 *
 * `food_logs.food_id` is a uuid column, so a placeholder reaching it is a 22P02
 * that fails the save on the last tap of the flow. Both directions matter: the
 * filter that drops a placeholder must not also drop a real id, or every entry
 * logged from search would lose its provenance silently.
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

/**
 * What the detail screen is allowed to take from the catalogue when it is
 * editing a saved entry, which is the portions and nothing else.
 *
 * The bug these guard against showed a soy milk logged at 108 kcal off its own
 * nutrition panel as 511, priced from an unrelated catalogue row while still
 * wearing the entry's own name and photograph. The day went on showing 108, so
 * the two screens disagreed about one meal.
 */
describe('withCataloguePortions', () => {
  const entry = foodFromEntry({
    foodName: "Yeo's Less Sugar Soy Milk",
    base: { kcal: 108, carbs: 13.3, protein: 6.3, fat: 3.3 },
    servingLabel: '1 serving',
    servingFactor: 1,
  })

  it('never takes the catalogue row’s numbers', () => {
    const other = food({ macros: { kcal: 511, carbs: 54, protein: 15, fat: 27 } })

    expect(withCataloguePortions(entry, other).macros.kcal).toBe(108)
  })

  it('offers the catalogue’s other portions when this entry’s is among them', () => {
    const id = 'a3f1c2d4-0000-4000-8000-000000000009'
    const logged = foodFromEntry({
      foodId: id,
      foodName: 'Nasi lemak',
      base: { kcal: 650, carbs: 75, protein: 18, fat: 30 },
      servingId: `${id}:serving`,
      servingLabel: '1 serving',
      servingFactor: 1,
    })
    const catalogue = food({
      id,
      servings: [
        { id: `${id}:half`, label: 'Half', factor: 0.5 },
        { id: `${id}:serving`, label: '1 serving', factor: 1 },
        { id: `${id}:large`, label: 'Large', factor: 1.5 },
      ],
    })

    const merged = withCataloguePortions(logged, catalogue)
    expect(merged.servings).toHaveLength(3)
    // Still the entry's own figures underneath the wider choice.
    expect(merged.macros.kcal).toBe(650)
  })

  /**
   * The case that makes the check worth having rather than just taking whatever
   * the catalogue offers. A row re-cut since it was logged — or one that was
   * never this entry's row — no longer lists the portion the entry holds, so
   * `servings.find` misses and the screen falls through to `servings[0]`,
   * repricing the meal simply by being opened.
   */
  it('keeps the entry’s own portion when the catalogue cannot offer it', () => {
    const merged = withCataloguePortions(entry, food())

    expect(merged.servings).toEqual(entry.servings)
    expect(merged.servings[0].label).toBe('1 serving')
  })

  /**
   * An entry the old bug left inconsistent: `serving_id` was moved to "large"
   * while `serving_factor` stayed at 1, so the row counts one serving and
   * claims to be a large one. Trusting the id alone would price it at 1.5x and
   * disagree with the day all over again, in the other direction.
   */
  it('distrusts a portion list that disagrees about the size this entry is at', () => {
    const id = 'a3f1c2d4-0000-4000-8000-000000000009'
    const damaged = foodFromEntry({
      foodId: id,
      foodName: 'Nasi lemak',
      base: { kcal: 650, carbs: 75, protein: 18, fat: 30 },
      servingId: `${id}:large`,
      servingLabel: '1 serving',
      servingFactor: 1,
    })
    const catalogue = food({
      id,
      servings: [
        { id: `${id}:serving`, label: '1 serving', factor: 1 },
        { id: `${id}:large`, label: 'Large', factor: 1.5 },
      ],
    })

    const merged = withCataloguePortions(damaged, catalogue)
    expect(merged.servings).toEqual(damaged.servings)
    expect(merged.servings[0].factor).toBe(1)
  })

  it('is the entry alone when there is no catalogue row at all', () => {
    expect(withCataloguePortions(entry, null)).toEqual(entry)
    expect(withCataloguePortions(entry, undefined)).toEqual(entry)
  })
})
