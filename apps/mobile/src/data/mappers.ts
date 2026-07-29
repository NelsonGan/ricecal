import type { Tables } from '@/lib/database.types'
import type {
  ActivitySession,
  Entry,
  Food,
  FoodDetailsRow,
  FoodLogRow,
  IconRef,
  Meal,
  Serving,
} from './types'
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
 * The illustration for a row that has one.
 *
 * The cast is the seam between a text column and a closed union. A dish
 * inserted with a name no icon set has renders blank rather than crashing,
 * which is why the fallback exists at all.
 */
export function toIcon(set: string | null, name: string | null): IconRef {
  if (!set || !name) return { set: 'food', name: 'empty-plate' } as IconRef
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

export function toFood(row: FoodDetailsRow, userId?: string, stats?: FoodStats | undefined): Food {
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
    imagePath: row.image_path ?? undefined,
    ownerId: row.owner_id,
    verified: row.verified ?? false,
    timesLogged: stats?.timesLogged,
    usualMeals: stats?.meals,
    custom: Boolean(row.owner_id) && row.owner_id === userId,
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

/** The illustration for each kind of workout. Presentation, not data. */
const SESSION_ICONS: Record<string, IconRef> = {
  run: { set: 'body', name: 'running' } as IconRef,
  badminton: { set: 'body', name: 'badminton' } as IconRef,
  gym: { set: 'body', name: 'dumbbell' } as IconRef,
  walk: { set: 'body', name: 'footprints' } as IconRef,
  cycle: { set: 'body', name: 'cycling' } as IconRef,
  swim: { set: 'body', name: 'swimming' } as IconRef,
  other: { set: 'body', name: 'heart-rate' } as IconRef,
}

export function toSession(row: Tables<'workouts'>): ActivitySession {
  return {
    id: row.id,
    kind: row.kind,
    // Falls back to the kind, which the screen translates. A workout synced
    // from a watch usually names itself; one added by hand often does not.
    title: row.title ?? row.kind,
    icon: SESSION_ICONS[row.kind] ?? SESSION_ICONS.other,
    startedAt: row.started_at,
    minutes: row.duration_min,
    kcal: row.kcal,
    distanceKm: row.distance_km === null ? undefined : Number(row.distance_km),
    avgHr: row.avg_hr ?? undefined,
    elevationM: row.elevation_m ?? undefined,
    splitSeconds: row.split_seconds ?? undefined,
  }
}
