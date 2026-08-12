import type {
  Entry,
  Food,
  FoodDetailsRow,
  FoodLogRow,
  IconRef,
  Recipe,
  RecipeIngredient,
  RecipeIngredientRow,
  RecipeRow,
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

/**
 * A nullable numeric column as a number, or nothing.
 *
 * The rest of this file coalesces to zero, and these three columns are the
 * exception: `fibre_g`, `sugar_g` and `sodium_mg` are null for most of the
 * imported catalogue, and null there means nobody recorded it. A zero would put
 * "0 g of sugar" on a slice of cake.
 */
function optionalNumber(value: number | string | null): number | undefined {
  if (value === null || value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
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

export type FoodStats = { timesLogged: number }

export function toFood(row: FoodDetailsRow, stats?: FoodStats | undefined): Food {
  const parsed = toServings(row.servings)
  // NEVER EMPTY. `toServings` drops anything without a string id and label, so
  // a row whose portions are missing or malformed arrives here as `[]` — and
  // every screen that shows a food reads `servings[0]`, which is `Serving`
  // rather than `Serving | undefined` because `noUncheckedIndexedAccess` is
  // off. The compiler cannot see it; the app crashes with "cannot get label of
  // undefined" on the food detail page, after a scan that looked like it
  // worked.
  //
  // The fallback is the portion the row's own macros are quoted per, which is
  // what a single-serving food would have had anyway. A dish with one portion
  // and a dish whose portions failed to parse look the same on screen, and that
  // is the right trade: the numbers are still the row's.
  const servings: Serving[] = parsed.length
    ? parsed
    : [{ id: `${row.id ?? 'food'}:base`, label: row.serving_label ?? '1 serving', factor: 1 }]

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
    extras: {
      fibre: optionalNumber(row.fibre_g),
      sugar: optionalNumber(row.sugar_g),
      sodium: optionalNumber(row.sodium_mg),
    },
    verified: row.verified ?? false,
    timesLogged: stats?.timesLogged,
    servingGrams: optionalNumber(row.serving_g),
    barcode: row.barcode ?? undefined,
    sourceAttribution: row.source_attribution ?? undefined,
  }
}

export function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    icon: toIcon(row.icon_set, row.icon_name),
    photoPath: row.photo_path ?? undefined,
    servings: row.servings ?? 1,
    steps: row.steps ?? undefined,

    isOfficial: row.is_official ?? false,
    isMine: row.is_mine ?? false,
    isPublic: row.is_public ?? false,
    review: row.review_status ?? 'pending',
    reviewNote: row.review_note ?? undefined,
    authorName: row.author_name ?? '',
    shareSlug: row.share_slug ?? '',
    savedCount: row.saved_count ?? 0,

    ingredientCount: row.ingredient_count ?? 0,
    total: {
      kcal: row.total_kcal ?? 0,
      carbs: Number(row.total_carbs_g ?? 0),
      protein: Number(row.total_protein_g ?? 0),
      fat: Number(row.total_fat_g ?? 0),
    },
    perServing: {
      kcal: row.serving_kcal ?? 0,
      carbs: Number(row.serving_carbs_g ?? 0),
      protein: Number(row.serving_protein_g ?? 0),
      fat: Number(row.serving_fat_g ?? 0),
    },
  }
}

export function toRecipeIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    foodId: row.food_id ?? undefined,
    amount: Number(row.amount ?? 0),
    unit: row.unit ?? 'g',
    perUnit: {
      kcal: Number(row.kcal_per_unit ?? 0),
      carbs: Number(row.carbs_g_per_unit ?? 0),
      protein: Number(row.protein_g_per_unit ?? 0),
      fat: Number(row.fat_g_per_unit ?? 0),
    },
    macros: {
      kcal: row.kcal ?? 0,
      carbs: Number(row.carbs_g ?? 0),
      protein: Number(row.protein_g ?? 0),
      fat: Number(row.fat_g ?? 0),
    },
    position: row.position ?? 0,
  }
}

export function toEntry(row: FoodLogRow): Entry {
  return {
    id: row.id ?? '',
    quantity: Number(row.quantity ?? 1),
    loggedAt: row.logged_at ?? new Date(0).toISOString(),
    logDate: row.log_date ?? '',
    note: row.note ?? undefined,
    source: fromDbSource(row.source ?? 'search'),
    photoPath: row.photo_path ?? undefined,

    foodId: row.food_id ?? undefined,
    recipeId: row.recipe_id ?? undefined,
    foodName: row.food_name ?? '',
    brand: row.food_brand ?? undefined,
    icon: toIcon(row.icon_set, row.icon_name),
    place: row.place ?? 'hawker',
    servingId: row.serving_id ?? undefined,
    servingLabel: row.serving_label ?? '',
    servingFactor: Number(row.serving_factor ?? 1),

    macros: {
      kcal: row.kcal ?? 0,
      carbs: Number(row.carbs_g ?? 0),
      protein: Number(row.protein_g ?? 0),
      fat: Number(row.fat_g ?? 0),
    },

    // Per one base serving, for the one caller that copies an entry instead of
    // reading it. `base_kcal` is what the view exposes unmultiplied; `kcal`
    // above is the same figure through the portion and the quantity.
    base: {
      kcal: Number(row.base_kcal ?? 0),
      carbs: Number(row.base_carbs_g ?? 0),
      protein: Number(row.base_protein_g ?? 0),
      fat: Number(row.base_fat_g ?? 0),
    },
    baseExtras: {
      ...(row.base_fibre_g === null || row.base_fibre_g === undefined
        ? {}
        : { fibre: Number(row.base_fibre_g) }),
      ...(row.base_sugar_g === null || row.base_sugar_g === undefined
        ? {}
        : { sugar: Number(row.base_sugar_g) }),
      ...(row.base_sodium_mg === null || row.base_sodium_mg === undefined
        ? {}
        : { sodium: Number(row.base_sodium_mg) }),
    },
    baseServingGrams:
      row.base_serving_grams === null || row.base_serving_grams === undefined
        ? undefined
        : Number(row.base_serving_grams),

    // Only the fields that were actually typed. The macros above are what to
    // SHOW; these are what the editor needs to know it must not clear.
    overrides: {
      ...(row.override_kcal === null || row.override_kcal === undefined
        ? {}
        : { kcal: Number(row.override_kcal) }),
      ...(row.override_carbs_g === null || row.override_carbs_g === undefined
        ? {}
        : { carbs: Number(row.override_carbs_g) }),
      ...(row.override_protein_g === null || row.override_protein_g === undefined
        ? {}
        : { protein: Number(row.override_protein_g) }),
      ...(row.override_fat_g === null || row.override_fat_g === undefined
        ? {}
        : { fat: Number(row.override_fat_g) }),
    },

    scanId: row.scan_id ?? undefined,
    suggestedEdits: Array.isArray(row.suggested_edits)
      ? row.suggested_edits.filter((edit): edit is string => typeof edit === 'string')
      : undefined,
  }
}
