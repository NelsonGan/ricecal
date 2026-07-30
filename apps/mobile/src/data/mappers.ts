import type { Entry, Food, FoodDetailsRow, FoodLogRow, IconRef, Meal, Serving } from './types'
import { fromDbSource } from './types'

/**
 * Row shapes to domain shapes.
 *
 * The whole point is that nothing downstream writes `?? 0`. A view column is
 * typed nullable because Postgres cannot prove otherwise, not because the data
 * is missing, so the coalescing happens once — here — and every screen gets a
 * type it can trust.
 *
 * `icon` is the other reason this file exists: the database stores a set and a
 * name as two loose columns, and the client wants the tagged pair `Icon`
 * takes, so that a `dishes` set cannot be handed a `food` name.
 */

/**
 * The illustration for a row that has one, and `undefined` for a row that does
 * not.
 *
 * Undefined rather than a stand-in plate, which is what this used to return. The
 * catalogue is far too large to illustrate — hundreds of megabytes of imported
 * rows against a few dozen drawings — so most foods genuinely have no icon, and
 * handing every one of them the same empty plate dressed that fact up as an
 * answer. A row with nothing to show should show nothing, and the curated local
 * dishes that DO have a drawing keep it.
 *
 * The cast is the seam between a text column and a closed union. A dish inserted
 * with a name no icon set has renders blank rather than crashing, which is the
 * other reason this is not just a spread.
 */
export function toIcon(set: string | null, name: string | null): IconRef | undefined {
  if (!set || !name) return undefined
  return { set, name } as IconRef
}

export function toServings(json: FoodDetailsRow['servings']): Serving[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const { id, label, factor } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof label !== 'string') return []
    return [{ id, label, factor: Number(factor) || 1 }]
  })
}

export type FoodStats = { timesLogged: number; meals: Meal[] }

export function toFood(row: FoodDetailsRow, stats?: FoodStats | undefined): Food {
  const servings = toServings(row.servings)
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    brand: row.brand ?? undefined,
    icon: toIcon(row.icon_set, row.icon_name),
    place: row.place ?? 'hawker',
    // The default serving is the one the macros are quoted per. Without it the
    // list's first entry is the next best thing, and it is factor 1 by design.
    servingLabel: row.serving_label ?? servings[0]?.label ?? '1 serving',
    servings,
    macros: {
      kcal: row.kcal ?? 0,
      carbs: Number(row.carbs_g ?? 0),
      protein: Number(row.protein_g ?? 0),
      fat: Number(row.fat_g ?? 0),
    },
    verified: row.verified ?? false,
    timesLogged: stats?.timesLogged,
    usualMeals: stats?.meals,
  }
}

export function toEntry(row: FoodLogRow): Entry {
  return {
    id: row.id ?? '',
    meal: row.meal ?? 'snack',
    quantity: Number(row.quantity ?? 1),
    loggedAt: row.logged_at ?? new Date(0).toISOString(),
    logDate: row.log_date ?? '',
    note: row.note ?? undefined,
    source: fromDbSource(row.source ?? 'search'),
    photoPath: row.photo_path ?? undefined,

    foodId: row.food_id ?? '',
    foodName: row.food_name ?? '',
    icon: toIcon(row.icon_set, row.icon_name),
    place: row.place ?? 'hawker',
    servingId: row.serving_id ?? '',
    servingLabel: row.serving_label ?? '',
    servingFactor: Number(row.serving_factor ?? 1),

    macros: {
      kcal: row.kcal ?? 0,
      carbs: Number(row.carbs_g ?? 0),
      protein: Number(row.protein_g ?? 0),
      fat: Number(row.fat_g ?? 0),
    },
  }
}
