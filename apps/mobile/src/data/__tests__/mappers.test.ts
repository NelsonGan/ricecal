import { toEntry, toFood, toIcon, toServings } from '@/data/mappers'
import type { FoodDetailsRow, FoodLogRow } from '@/data/types'

/**
 * The edge between Postgres and the screens.
 *
 * Every column of every view is typed nullable, because Postgres cannot prove
 * otherwise through a join. These functions are where that stops being true,
 * so what is worth pinning is the behaviour on a row that really is missing
 * things — the case the type system insists on and the happy path never shows.
 */

const logRow = (over: Partial<FoodLogRow> = {}): FoodLogRow =>
  ({
    id: 'entry-1',
    user_id: 'user-1',
    log_date: '2026-03-10',
    meal: 'lunch',
    quantity: 2,
    logged_at: '2026-03-10T13:00:00+08:00',
    note: null,
    source: 'quick_add',
    photo_path: null,
    food_id: 'food-1',
    food_name: 'Nasi lemak',
    food_brand: null,
    icon_set: 'dishes',
    icon_name: 'nasi-lemak',
    place: 'mamak',
    serving_id: 'serving-1',
    serving_label: '1 plate',
    serving_factor: 1,
    kcal: 640,
    carbs_g: 78,
    protein_g: 27,
    fat_g: 25,
    fibre_g: null,
    sugar_g: null,
    ...over,
  }) as FoodLogRow

const foodRow = (over: Partial<FoodDetailsRow> = {}): FoodDetailsRow =>
  ({
    id: 'food-1',
    owner_id: null,
    slug: 'nasi-lemak-ayam',
    name: 'Nasi lemak ayam',
    brand: null,
    icon_set: 'dishes',
    icon_name: 'nasi-lemak',
    image_path: null,
    place: 'mamak',
    kcal: 640,
    carbs_g: 78,
    protein_g: 27,
    fat_g: 25,
    fibre_g: null,
    sugar_g: null,
    sodium_mg: null,
    verified: true,
    default_serving_id: 'serving-1',
    serving_label: '1 plate',
    servings: [
      { id: 'serving-1', slug: 'plate', label: '1 plate', factor: 1, default: true },
      { id: 'serving-2', slug: 'half', label: 'Half', factor: 0.5, default: false },
    ],
    ...over,
  }) as FoodDetailsRow

describe('toIcon', () => {
  it('pairs a set with a name', () => {
    expect(toIcon('dishes', 'laksa')).toEqual({ set: 'dishes', name: 'laksa' })
  })

  it('falls back rather than rendering nothing', () => {
    // A dish whose illustration was renamed still has to draw a row.
    expect(toIcon(null, 'laksa')).toEqual({ set: 'food', name: 'empty-plate' })
    expect(toIcon('dishes', null)).toEqual({ set: 'food', name: 'empty-plate' })
  })
})

describe('toServings', () => {
  it('reads the JSON the view aggregates', () => {
    expect(toServings(foodRow().servings)).toEqual([
      { id: 'serving-1', label: '1 plate', factor: 1 },
      { id: 'serving-2', label: 'Half', factor: 0.5 },
    ])
  })

  it('drops anything that is not a serving', () => {
    // The column is `jsonb`. Nothing stops a bad row from being in there, and
    // one malformed portion must not take the whole dish down.
    expect(toServings([null, 'nope', { label: 'no id' }] as never)).toEqual([])
  })

  it('is an empty list when the dish has no portions', () => {
    expect(toServings(null as never)).toEqual([])
  })
})

describe('toEntry', () => {
  it('carries the macros the view already costed', () => {
    // Not recomputed here: the view multiplied the dish by the portion by the
    // quantity, rounding once, so a total and its rows cannot disagree.
    expect(toEntry(logRow()).macros).toEqual({ kcal: 640, carbs: 78, protein: 27, fat: 25 })
  })

  it('camelCases the source enum', () => {
    expect(toEntry(logRow()).source).toBe('quickAdd')
  })

  it('survives a row with nothing in it', () => {
    const empty = toEntry({} as FoodLogRow)
    expect(empty.macros).toEqual({ kcal: 0, carbs: 0, protein: 0, fat: 0 })
    expect(empty.quantity).toBe(1)
    expect(empty.source).toBe('search')
  })
})

describe('toFood', () => {
  it('marks a dish as the user own dish only when they own it', () => {
    expect(toFood(foodRow(), 'user-1').custom).toBe(false)
    expect(toFood(foodRow({ owner_id: 'user-1' }), 'user-1').custom).toBe(true)
    // Someone else's private dish should never be reachable, but if RLS ever
    // let one through it is still not "yours".
    expect(toFood(foodRow({ owner_id: 'user-2' }), 'user-1').custom).toBe(false)
  })

  it('falls back to the first portion when no default is marked', () => {
    const food = toFood(foodRow({ serving_label: null }), 'user-1')
    expect(food.servingLabel).toBe('1 plate')
  })

  it('names a serving even for a dish with none', () => {
    const food = toFood(foodRow({ serving_label: null, servings: [] }), 'user-1')
    expect(food.servingLabel).toBe('1 serving')
  })
})
