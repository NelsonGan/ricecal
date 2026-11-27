import { isLanguage } from '@/i18n/languages'
import { ingredientIcon } from '@/lib/ingredient-icon'
import { isMeasureUnit, MEASURES, type MeasureUnit } from '@/lib/measures'
import type {
  Entry,
  EntryLocation,
  Food,
  FoodDetailsRow,
  FoodLogRow,
  IconRef,
  Recipe,
  RecipeIngredient,
  RecipeIngredientRow,
  RecipeRow,
  RecipeTranslation,
  RecipeUnit,
  Serving,
  VideoCredit,
  VideoPlatform,
} from './types'
import { fromDbSource, isRecipeTag } from './types'

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
 * The illustration for a row that has one, and `undefined` for a row that does not.
 *
 * Undefined rather than the stand-in plate this used to return. The catalogue is
 * far too large to illustrate, so most foods genuinely have no icon, and handing
 * every one of them the same empty plate dressed that up as an answer. The
 * curated local dishes that do have a drawing keep it.
 *
 * The cast is the seam between a text column and a closed union: a dish inserted
 * with a name no icon set has renders blank rather than crashing.
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
    const { id, label, factor, grams } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof label !== 'string') return []
    // The Worker sends each portion's weight, which is what lets a cup or a
    // spoon of this food be converted to grams. Absent or null is "nobody said".
    const weight = Number(grams)
    return [
      {
        id,
        label,
        factor: Number(factor) || 1,
        ...(grams !== null && grams !== undefined && Number.isFinite(weight) && weight > 0
          ? { grams: weight }
          : {}),
      },
    ]
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

    isMine: row.is_mine ?? false,
    isPublic: row.is_public ?? false,
    review: row.review_status ?? 'pending',
    reviewNote: row.review_note ?? undefined,
    authorName: row.author_name ?? '',
    ownerId: row.owner_id ?? '',
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

    prepMinutes: row.prep_minutes ?? undefined,
    cookMinutes: row.cook_minutes ?? undefined,
    // Filtered, so a key a newer build wrote is dropped here rather than drawn
    // as a chip with no words on it.
    tags: (row.tags ?? []).filter(isRecipeTag),
    sourceUrl: row.source_url ?? undefined,
    isFavourite: row.is_favourite ?? false,
    videoCredit: toVideoCredit(row.import_platform, row.import_author, row.import_url),
    translations: toRecipeTranslations(row.translations),
  }
}

/**
 * The translations an app language can use. A language this build does not
 * have, and any field that is not text, are dropped rather than drawn.
 */
export function toRecipeTranslations(value: unknown): Recipe['translations'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: NonNullable<Recipe['translations']> = {}
  for (const [language, raw] of Object.entries(value as Record<string, unknown>)) {
    if (language === 'en' || !isLanguage(language) || !raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const translation: RecipeTranslation = {}
    if (typeof o.name === 'string' && o.name.trim()) translation.name = o.name
    if (typeof o.steps === 'string' && o.steps.trim()) translation.steps = o.steps
    if (o.ingredients && typeof o.ingredients === 'object' && !Array.isArray(o.ingredients)) {
      const names = Object.entries(o.ingredients as Record<string, unknown>).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].trim() !== '',
      )
      if (names.length > 0) translation.ingredients = Object.fromEntries(names)
    }
    if (Object.keys(translation).length > 0) out[language] = translation
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const VIDEO_PLATFORMS = new Set<VideoPlatform>([
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'threads',
  'facebook',
  'rednote',
])

/**
 * The credit, or nothing. A platform this build has never heard of is dropped
 * rather than drawn with no name, and a link that is not https is not a link.
 */
export function toVideoCredit(
  platform: string | null | undefined,
  author: string | null | undefined,
  url: string | null | undefined,
): VideoCredit | undefined {
  if (!platform || !url || !VIDEO_PLATFORMS.has(platform as VideoPlatform)) return undefined
  if (!url.startsWith('https://')) return undefined
  return { platform: platform as VideoPlatform, author: author || undefined, url }
}

/**
 * The display unit, when there is one and it belongs to the stored unit's
 * family. The column's check says the same thing; this is the belt to it, since
 * a spoon read over an amount in grams would show a figure the cook never
 * measured.
 */
export function displayUnitOf(
  unit: RecipeUnit,
  value: string | null | undefined,
): { displayUnit?: MeasureUnit } {
  if (!isMeasureUnit(value) || value === unit) return {}
  return MEASURES[value].family === (unit === 'g' ? 'weight' : unit === 'ml' ? 'volume' : null)
    ? { displayUnit: value }
    : {}
}

export function toRecipeIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    foodId: row.food_id ?? undefined,
    amount: Number(row.amount ?? 0),
    unit: row.unit ?? 'g',
    ...displayUnitOf(row.unit ?? 'g', row.display_unit),
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
    icon: ingredientIcon(row.name ?? ''),
  }
}

/**
 * The columns of `food_log_details` that `toEntry` reads, for every select
 * that feeds it.
 *
 * Named rather than `*`. The view has seven more that no screen draws (the
 * owner, the fibre, sugar, sodium and gram totals, and the snapshot's name and
 * brand, which `food_name` and `food_brand` already are), about a sixth of
 * each row, and it is the diary's most frequent read and the two hundred rows
 * behind Past foods. A column `toEntry` starts reading goes on this list, and
 * it will not compile until it does: `EntryRow` is these and no others.
 */
const ENTRY_COLUMN_NAMES = [
  'id',
  'log_date',
  'quantity',
  'logged_at',
  'note',
  'source',
  'photo_path',
  'food_id',
  'scan_id',
  'suggested_edits',
  'food_name',
  'food_brand',
  'icon_set',
  'icon_name',
  'place',
  'serving_id',
  'serving_label',
  'serving_factor',
  'override_kcal',
  'override_carbs_g',
  'override_protein_g',
  'override_fat_g',
  'kcal',
  'carbs_g',
  'protein_g',
  'fat_g',
  'recipe_id',
  'base_kcal',
  'base_carbs_g',
  'base_protein_g',
  'base_fat_g',
  'base_fibre_g',
  'base_sugar_g',
  'base_sodium_mg',
  'base_serving_grams',
  'base_serving_ml',
  'ingredient_count',
  'plate_quantity',
  'latitude',
  'longitude',
  'location_name',
  'location_address',
  'location_id',
  'location_category',
] as const satisfies readonly (keyof FoodLogRow)[]

export const ENTRY_COLUMNS = ENTRY_COLUMN_NAMES.join(',')

/** A row of `food_log_details`, as far as `ENTRY_COLUMNS` asks for it. */
export type EntryRow = Pick<FoodLogRow, (typeof ENTRY_COLUMN_NAMES)[number]>

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id ?? '',
    quantity: Number(row.quantity ?? 1),
    // Defaulted like every other column here: a view's columns are typed
    // nullable. Both are on `ENTRY_COLUMNS`, so the database has to have them.
    plateQuantity: Number(row.plate_quantity ?? 1),
    ingredientCount: row.ingredient_count ?? 0,
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
    baseServingMl:
      row.base_serving_ml === null || row.base_serving_ml === undefined
        ? undefined
        : Number(row.base_serving_ml),

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
    location: toLocation(row),
  }
}

/**
 * The row's location, or undefined. A day cached before the view carried these
 * columns rehydrates without them, which reads as no location rather than as
 * a point at 0,0.
 */
function toLocation(
  row: Pick<
    FoodLogRow,
    | 'latitude'
    | 'longitude'
    | 'location_name'
    | 'location_address'
    | 'location_id'
    | 'location_category'
  >,
): EntryLocation | undefined {
  const { latitude, longitude, location_name: name } = row
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !name) return undefined
  return {
    latitude,
    longitude,
    name,
    ...(row.location_address ? { address: row.location_address } : {}),
    ...(row.location_id ? { placeId: row.location_id } : {}),
    ...(row.location_category ? { category: row.location_category } : {}),
  }
}

/**
 * The six `food_logs` columns for a location, all of them every time: `null`
 * clears the lot, and a partial write would trip `food_logs_location_complete`.
 */
export function locationColumns(location: EntryLocation | null) {
  // Cut to the columns' checks: a geocoder's long name would otherwise fail
  // the whole insert, and the meal with it. By code point, so an emoji at the
  // cut is dropped whole rather than leaving half a surrogate pair that
  // Postgres refuses just the same. (`char_length` counts code points too.)
  const cut = (value: string | undefined, max: number) => {
    const trimmed = value?.trim()
    return trimmed ? Array.from(trimmed).slice(0, max).join('') : null
  }
  const name = location ? cut(location.name, 200) : null
  const valid =
    location !== null &&
    name !== null &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180
  if (!valid) {
    return {
      latitude: null,
      longitude: null,
      location_name: null,
      location_address: null,
      location_id: null,
      location_category: null,
    }
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    location_name: name,
    location_address: cut(location.address, 300),
    location_id: cut(location.placeId, 200),
    location_category: cut(location.category, 64),
  }
}
