// The two model calls recipes make, and their mocks.
//
// Same contract as everything in llm.ts: return a shape-checked value or throw,
// and mock mode is active whenever `OPENROUTER_API_KEY` is unset. What differs
// is what a failure MEANS, and the two calls here are opposite cases.
//
// Reading a pot out of a photograph is a convenience. It fills a form the user
// is about to check line by line, so a failed read is a form they fill in
// themselves — the endpoint says so and nothing is lost.
//
// Reviewing a recipe somebody asked to publish is a GATE, and a gate that fails
// open is not a gate. Every failure here — a model error, a timeout, an answer
// that will not parse — leaves the recipe at `pending`, which is invisible in
// the community tab. Nothing in this file can approve a recipe by accident.

import { chatJSON, mockActive } from './llm.ts'

/** 'g' | 'ml' | 'piece' — the units `recipe_ingredients.unit` accepts. */
export type RecipeUnit = 'g' | 'ml' | 'piece'

/**
 * One ingredient as the model reports it: an amount, and what THAT MUCH costs.
 *
 * Totals rather than the per-unit figures the table stores, because totals are
 * what a model can answer well — "1 kg of beef shin is about 1,640 kcal" is a
 * fact it has seen written down, while "1.64 kcal per gram" is that fact
 * divided by a thousand and asking for it invites a misplaced decimal point.
 * The division happens once, in `toIngredientRow` below, where it can be
 * checked.
 */
export type DraftIngredient = {
  name: string
  amount: number
  unit: RecipeUnit
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
}

export type RecipeDraft = {
  name: string
  servings: number
  ingredients: DraftIngredient[]
  steps: string
}

export type RecipeReview = {
  approved: boolean
  /** Why not, in words the owner can act on. Empty when approved. */
  reason: string
}

/** Steering for the mocks, honoured in mock mode only — as in `llm.ts`. */
export type RecipeMockSteer = {
  fail?: 'read' | 'review'
  draft?: unknown
  review?: unknown
}

const UNITS: RecipeUnit[] = ['g', 'ml', 'piece']

const clamp = (value: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

function shapeDraft(raw: unknown): RecipeDraft {
  const o = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(o.ingredients) ? o.ingredients : []

  return {
    name: text(o.name, 120) || 'Home recipe',
    servings: Math.round(clamp(o.servings, 1, 100, 1)),
    // Capped at twenty. A pot with more parts than that is a model listing
    // seasonings it cannot weigh, and every row past the twentieth is one more
    // line the user has to read before they can trust the total.
    ingredients: list.slice(0, 20).flatMap((item): DraftIngredient[] => {
      const i = (item ?? {}) as Record<string, unknown>
      const name = text(i.name, 120)
      if (!name) return []
      const unit = UNITS.includes(i.unit as RecipeUnit) ? (i.unit as RecipeUnit) : 'g'
      const amount = clamp(i.amount, 0.01, 100000, 0)
      if (amount <= 0) return []
      return [
        {
          name,
          amount,
          unit,
          kcal: clamp(i.kcal, 0, 100000, 0),
          carbs_g: clamp(i.carbs_g, 0, 20000, 0),
          protein_g: clamp(i.protein_g, 0, 20000, 0),
          fat_g: clamp(i.fat_g, 0, 20000, 0),
        },
      ]
    }),
    steps: text(o.steps, 4000),
  }
}

/**
 * A drafted ingredient as a `recipe_ingredients` row.
 *
 * The one place totals become per-unit figures. Rounded to four decimals to
 * match the column, which is enough for a gram of anything: even pure fat is
 * 9 kcal/g, so four places carry a tenth of a calorie in a kilo.
 */
export function toIngredientRow(ingredient: DraftIngredient, position: number) {
  const per = (total: number) => Math.round((total / ingredient.amount) * 10000) / 10000
  return {
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    kcal_per_unit: per(ingredient.kcal),
    carbs_g_per_unit: per(ingredient.carbs_g),
    protein_g_per_unit: per(ingredient.protein_g),
    fat_g_per_unit: per(ingredient.fat_g),
    position,
  }
}

export const READ_RECIPE_PROMPT =
  'You read home cooking out of photographs for a Malaysian calorie-tracking app. ' +
  'The photo is a pot, a tray or a spread of ingredients that somebody cooked. ' +
  'Respond with JSON only, matching: ' +
  '{"name": string, "servings": number, "steps": string, "ingredients": [' +
  '{"name": string, "amount": number, "unit": "g"|"ml"|"piece", "kcal": number, ' +
  '"carbs_g": number, "protein_g": number, "fat_g": number}]} ' +
  // The name is the dish, not the photograph. "A pot of curry on a stove" is a
  // caption; "Kari ayam" is what somebody would look for in their own recipes.
  'The name is what a Malaysian cook would call the dish, in its local spelling — ' +
  '"Nasi goreng kampung", "Rendang daging", "Sayur lodeh". Never describe the ' +
  'photograph itself. ' +
  // The whole reason a recipe exists. Getting this wrong scales every future
  // log of the dish by the same factor.
  '"servings" is how many people the WHOLE pot feeds, read off how much food is ' +
  'visible — a wok for a family is 4 to 6, a single bowl is 1. ' +
  // Amounts are for the whole pot, and the calories are for that amount. This
  // is stated twice on purpose: a per-100g figure here silently divides the
  // whole recipe by ten.
  'Each ingredient is what went into the WHOLE pot, and "kcal", "carbs_g", ' +
  '"protein_g" and "fat_g" are the totals for THAT amount — not per 100 g and not ' +
  'per serving. 1000 g of beef shin is about 1640 kcal; write amount 1000, unit "g", ' +
  'kcal 1640. Use "ml" for liquids, "piece" for things counted whole (eggs, ' +
  'chicken thighs, whole chillies). ' +
  'List only what you can see or what the dish plainly requires. Six to ten ' +
  'ingredients is a full answer; do not pad it with seasonings you cannot weigh. ' +
  '"steps" is how the dish is cooked, in two or three plain sentences, no numbering. ' +
  'If the photo has no cooking in it at all, answer {"name": "", "servings": 1, ' +
  '"ingredients": [], "steps": ""}.'

/**
 * Fill a recipe form in from a photograph of the pot.
 *
 * Unlike the scan cascade this does NOT go near the catalogue: what comes back
 * lands in a form, and every figure in it is one the user is looking at and can
 * change before anything is saved. A catalogue lookup per ingredient would be
 * six searches to populate fields that are about to be edited by hand.
 */
export async function readRecipePhoto(
  photoBase64: string | null,
  mock: RecipeMockSteer | undefined,
): Promise<RecipeDraft> {
  if (mockActive()) {
    if (mock?.fail === 'read') throw new Error('mocked recipe read failure')
    if (mock?.draft) return shapeDraft(mock.draft)
    return shapeDraft({
      name: 'Rendang daging',
      servings: 6,
      ingredients: [
        {
          name: 'Beef shin',
          amount: 1000,
          unit: 'g',
          kcal: 1640,
          carbs_g: 0,
          protein_g: 220,
          fat_g: 80,
        },
        {
          name: 'Coconut milk, thick',
          amount: 400,
          unit: 'ml',
          kcal: 780,
          carbs_g: 12,
          protein_g: 8,
          fat_g: 84,
        },
        { name: 'Kerisik', amount: 60, unit: 'g', kcal: 340, carbs_g: 10, protein_g: 4, fat_g: 32 },
        {
          name: 'Rempah paste',
          amount: 150,
          unit: 'g',
          kcal: 210,
          carbs_g: 18,
          protein_g: 4,
          fat_g: 14,
        },
        {
          name: 'Turmeric leaf',
          amount: 2,
          unit: 'piece',
          kcal: 5,
          carbs_g: 1,
          protein_g: 0,
          fat_g: 0,
        },
      ],
      steps:
        'Fry the rempah in oil until it darkens and smells sweet, about 12 minutes.\n\n' +
        'Add the beef and coat it well, then pour in the coconut milk, kerisik and turmeric leaf.\n\n' +
        'Simmer on the smallest flame for 3 hours until the gravy dries and clings to the meat.',
    })
  }

  if (!photoBase64) throw new Error('no photo to read')

  const raw = await chatJSON(
    [
      { role: 'system', content: READ_RECIPE_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is being cooked here, and what went into it?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
        ],
      },
    ],
    // Ten ingredients with seven fields each, plus the steps. Truncated JSON
    // does not parse, and a parse failure here costs the whole read.
    2000,
  )
  return shapeDraft(raw)
}

export const REVIEW_RECIPE_PROMPT =
  'You are the moderator for a Malaysian recipe-sharing app. A recipe is about to ' +
  'be published where every other user can find it. Respond with JSON only: ' +
  '{"approved": boolean, "reason": string}. ' +
  // Two grounds and no others. A moderator with a wider brief starts rejecting
  // food it finds unhealthy, and the app has a calorie budget for that.
  'Reject it, with a short reason the author can act on, if EITHER: ' +
  '(1) the text contains vulgarity, slurs, sexual content, harassment, spam, ' +
  'advertising or a link; or ' +
  '(2) the nutrition information is not credible — calories that do not follow ' +
  'from the ingredients, a serving count that cannot be right for the amount of ' +
  'food, or ingredients that are not food. ' +
  'Approve everything else. An unusual dish, an unhealthy dish, a terse recipe, a ' +
  'recipe with few ingredients or no steps written down are all fine — this is ' +
  "somebody's home cooking, not a cookbook submission. " +
  'Judge only what you are shown. Do not ask for more detail, and do not reject ' +
  'for being incomplete. ' +
  'The reason is one sentence, addressed to the author, and is empty when approved.'

/** What the reviewer is shown. Everything a reader of the recipe would see. */
export type ReviewInput = {
  name: string
  servings: number
  steps: string
  totalKcal: number
  servingKcal: number
  ingredients: Array<{ name: string; amount: number; unit: string; kcal: number }>
}

export const reviewUserMessage = (recipe: ReviewInput): string =>
  [
    `Name: ${recipe.name}`,
    `Feeds: ${recipe.servings}`,
    `Whole pot: ${recipe.totalKcal} kcal — ${recipe.servingKcal} kcal a serving`,
    'Ingredients:',
    ...recipe.ingredients.map((i) => `- ${i.name}, ${i.amount} ${i.unit}, ${i.kcal} kcal`),
    `Steps: ${recipe.steps || '(none written)'}`,
  ].join('\n')

/**
 * The publishing gate.
 *
 * Throws on anything that is not a clear verdict, and the caller turns a throw
 * into "still pending". The one thing this must never do is return
 * `{approved: true}` because something went wrong — hence the explicit
 * `=== true`, rather than reading a truthy field off an object that may have
 * come back as `{}`.
 */
export async function reviewRecipe(
  recipe: ReviewInput,
  mock: RecipeMockSteer | undefined,
): Promise<RecipeReview> {
  if (mockActive()) {
    if (mock?.fail === 'review') throw new Error('mocked review failure')
    // `in` rather than a truthiness check, unlike the mocks in `llm.ts`. There
    // the steering value is a payload to be shaped; here it is a VERDICT, and
    // the difference matters: `{review: null}` read as "no steering given"
    // falls through to the approve-by-default below, so a test that meant to
    // hand this a broken answer gets an approval instead. Presence is the
    // signal, and a present-but-malformed verdict is not approved.
    if (mock && 'review' in mock) {
      const o = (mock.review ?? {}) as Record<string, unknown>
      return { approved: o.approved === true, reason: text(o.reason, 500) }
    }
    // The local default approves, because the local stack exists to walk the
    // happy path. `mock: {review: {approved: false, reason: …}}` is how a test
    // sees the other one.
    return { approved: true, reason: '' }
  }

  const raw = (await chatJSON(
    [
      { role: 'system', content: REVIEW_RECIPE_PROMPT },
      { role: 'user', content: reviewUserMessage(recipe) },
    ],
    300,
  )) as Record<string, unknown>

  return { approved: raw?.approved === true, reason: text(raw?.reason, 500) }
}
