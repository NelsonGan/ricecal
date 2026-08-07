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

import { ICON_INSTRUCTION, type IconChoice, resolveIcon } from './icons.ts'
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
  /**
   * The drawing for the pot, chosen out of our own set — see `icons.ts`.
   *
   * Only ever filled in on the DESCRIBED path. A photographed pot arrives with
   * a photograph, and the form shows that; asking a vision call to also pick a
   * drawing is paying for an answer nothing displays.
   */
  icon: IconChoice | null
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

/**
 * Nothing edible carries more than about 9 kcal a gram; pure fat is the
 * ceiling and everything else is diluted by water, protein or starch. So a
 * per-gram figure above it is not a rich ingredient, it is a decimal point in
 * the wrong place — a per-kilo figure written against a 100 g amount, say.
 *
 * The same reasoning `portion.ts` applies to a scanned plate, and the same
 * direction: mass bounds a calorie figure DOWNWARDS. Clamping loses nothing
 * true, because there was nothing true above the line.
 */
const KCAL_PER_UNIT_CEILING: Partial<Record<RecipeUnit, number>> = { g: 9.4, ml: 9.4 }

/** The rows, cleaned. Capped at twenty; see the note at the call site. */
function shapeIngredients(list: unknown[]): DraftIngredient[] {
  return list.slice(0, 20).flatMap((item): DraftIngredient[] => {
    const i = (item ?? {}) as Record<string, unknown>
    const name = text(i.name, 120)
    if (!name) return []
    const unit = UNITS.includes(i.unit as RecipeUnit) ? (i.unit as RecipeUnit) : 'g'
    const amount = clamp(i.amount, 0.01, 100000, 0)
    if (amount <= 0) return []

    const ceiling = KCAL_PER_UNIT_CEILING[unit]
    const kcal = clamp(i.kcal, 0, ceiling ? ceiling * amount : 100000, 0)
    // Macros are bounded by the mass for the same reason, and a piece has no
    // mass stated, so only a weighed ingredient can be checked this way.
    const macro = (value: unknown) => clamp(value, 0, ceiling ? amount : 20000, 0)

    return [
      {
        name,
        amount,
        unit,
        kcal,
        carbs_g: macro(i.carbs_g),
        protein_g: macro(i.protein_g),
        fat_g: macro(i.fat_g),
      },
    ]
  })
}

/**
 * The steps as one instruction a line, whatever shape they arrived in.
 *
 * The prompt asks for newlines and mostly gets them, but "mostly" is not a
 * format: the same model that separated a nasi lemak into five lines wrote a
 * butter chicken as one 250-character paragraph, and the screen renders what it
 * is given. A cook reading a wall of text has to find their place in it every
 * time they look up from the pan.
 *
 * So the shape is settled here rather than hoped for. Sentences become lines,
 * and any numbering the model added is taken off — the list is numbered where
 * it is DRAWN, so a "1." in the text would be a second number beside the first,
 * and it would survive into the field the user edits by hand.
 */
function shapeSteps(raw: unknown): string {
  const value = text(raw, 4000)
  if (!value) return ''

  return (
    value
      .split('\n')
      // A sentence end followed by the start of another. Written to need the
      // capital, so "1.5 kg" and "approx. 20" stay in one piece.
      .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"'(])/))
      .map((line) => line.replace(/^\s*(?:step\s*)?(?:\d+\s*[.):]|[-*•·])\s*/i, '').trim())
      .filter(Boolean)
      .join('\n')
  )
}

function shapeDraft(raw: unknown): RecipeDraft {
  const o = (raw ?? {}) as Record<string, unknown>
  // Capped at twenty. A pot with more parts than that is a model listing
  // seasonings it cannot weigh, and every row past the twentieth is one more
  // line the user has to read before they can trust the total.
  const ingredients = shapeIngredients(Array.isArray(o.ingredients) ? o.ingredients : [])

  return {
    // "Home recipe" only once there is a recipe to call that. Applied
    // unconditionally it filled the name in on the empty answer too, and the
    // caller's "nothing cookable in it" test — no name AND no ingredients —
    // could never be true again: a photo of a cat and a reminder to buy milk
    // both came back as a pot called Home recipe with nothing in it.
    name: text(o.name, 120) || (ingredients.length > 0 ? 'Home recipe' : ''),
    servings: Math.round(clamp(o.servings, 1, 100, 1)),
    ingredients,
    steps: shapeSteps(o.steps),
    // Null unless the model named a drawing we actually have. The photo prompt
    // never asks for one, so this is null on that path by construction.
    icon: resolveIcon(o.icon),
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

/**
 * The half of the two prompts that is the same, and it is most of them.
 *
 * Shared as a CONSTANT rather than copied, for the reason `llm.ts` gives about
 * the meal prompts: the sizing rules below were expensive to get right, and a
 * second prompt carrying its own copy relearns them wrong. What differs between
 * a photograph and a sentence is one thing only, and it is stated separately
 * below — WHO THE AUTHORITY IS.
 */
const RECIPE_SHAPE =
  'Respond with JSON only, matching: ' +
  '{"name": string, "servings": number, "steps": string, "ingredients": [' +
  '{"name": string, "amount": number, "unit": "g"|"ml"|"piece", "kcal": number, ' +
  '"carbs_g": number, "protein_g": number, "fat_g": number}]} ' +
  // The name is the dish. "A pot of curry on a stove" is a caption; "Kari ayam"
  // is what somebody would look for in their own recipes.
  //
  // And it is the dish's OWN name. Most of the cooking here is Malaysian, and
  // saying so used to be how this sentence was written — which taught the model
  // that a Malay name was the house style rather than the local one. Asked for
  // beef tacos it answered "Nasi goreng kampung"; asked for a Thai green curry
  // it answered "Kari hijau ayam". A cook looking for last week's tacos will
  // never find them under either.
  'The name is what the person cooking it calls the dish, in the language the ' +
  'dish itself carries: "Nasi goreng kampung", "Rendang daging", "Spaghetti ' +
  'carbonara", "Kimchi jjigae", "Coq au vin", "Tacos de carne molida". Never ' +
  "translate a dish into another cuisine's words. " +
  // Amounts are for the whole pot, and the calories are for that amount. Stated
  // twice on purpose: a per-100g figure here silently divides the whole recipe
  // by ten.
  'Each ingredient is what went into the WHOLE pot, and "kcal", "carbs_g", ' +
  '"protein_g" and "fat_g" are the totals for THAT amount, not per 100 g and not ' +
  'per serving. 1000 g of beef shin is about 1640 kcal; write amount 1000, unit "g", ' +
  'kcal 1640. Use "ml" for liquids, "piece" for things counted whole (eggs, ' +
  'chicken thighs, whole chillies). ' +
  // Anchors, for the same reason the meal prompts carry size anchors: a model
  // asked for a calorie figure in the abstract drifts high on exactly the
  // ingredients that dominate a pot. Told nothing, it priced a tin of santan at
  // 1520 kcal and put a chicken curry at 760 a serving.
  'Price them against these: 100 g of raw rice is about 360 kcal; 400 ml of ' +
  'tinned coconut milk is about 800 kcal; 15 ml of cooking oil is about 120 kcal; ' +
  'one large egg is about 72 kcal; 100 g of raw skinless chicken thigh is about ' +
  '120 kcal. ' +
  'Name each ingredient the way a shopping list does: singular, capitalised, and ' +
  'specific enough to price. "Chicken thigh", "Coconut milk", "Potato". ' +
  'Six to ten ingredients is a full answer; do not pad it with seasonings you ' +
  'cannot weigh. ' +
  // The fat is the part that goes missing, and it is the part that costs. A pot
  // whose steps say "fry" and whose list has no oil in it is understating the
  // meal by a few hundred calories.
  'Include the cooking fat and anything else the dish plainly needs to be that ' +
  'dish, even when nobody mentioned it. Everything your steps name has to appear ' +
  'in the list: steps that fry a rempah the ingredients never list describe a ' +
  'different pot. '

/**
 * How the steps are written, and it is a rule about PLAINNESS.
 *
 * What a model writes unprompted is a paragraph of food writing: the rempah
 * "sings", the gravy "kisses" the meat. What a cook wants back is what to do
 * next. So: imperative, one action a sentence, in the order they happen.
 *
 * No long dashes, because this text is displayed and the house rule reaches
 * anything a user reads. See the conventions in CLAUDE.md.
 */
const RECIPE_STEPS =
  '"steps" is how the dish is cooked, written straightforwardly: short plain ' +
  'sentences, one action each, in the order they happen, starting with a verb ' +
  '("Fry the rempah until it darkens."). Three to six of them. ' +
  // Said as a fact about the string rather than as a preference about layout.
  // Asked for "sentences separated by newlines" the model wrote a paragraph
  // about a third of the time, and a paragraph is what the screen then draws.
  'Each step is a separate line: put a \\n between them and nothing else, so the ' +
  '"steps" value reads as one instruction per line. No numbering, no bullets and ' +
  'no headings; the app numbers them itself. ' +
  'Say the times and temperatures that matter and nothing else. Do not describe ' +
  'how it tastes or smells, and do not use em dashes or en dashes anywhere.'

/**
 * Where the cooking is from, said once for both prompts.
 *
 * Malaysian food is the common case and the model should reach for it when the
 * dish is ambiguous, but "a Malaysian app" as the whole framing is what turned
 * every other cuisine into a Malay approximation of itself. The bias belongs on
 * the tie-break, not on the dish.
 */
const RECIPE_KITCHEN =
  'Most of the cooking is Malaysian and southeast Asian, so read an ambiguous ' +
  'dish that way, but people cook everything and a dish from anywhere else is ' +
  'answered on its own terms. '

export const READ_RECIPE_PROMPT =
  'You read home cooking out of photographs for a calorie-tracking app. ' +
  RECIPE_KITCHEN +
  'The photo is a pot, a tray or a spread of ingredients that somebody cooked. ' +
  RECIPE_SHAPE +
  // A photograph has one witness and it is the model. Everything it says is
  // inference, which is why it is told to describe only what is in front of it.
  'Never describe the photograph itself. ' +
  '"servings" is how many people the WHOLE pot feeds, read off how much food is ' +
  'visible: a wok for a family is 4 to 6, a single bowl is 1. ' +
  'List only what you can see or what the dish plainly requires. ' +
  RECIPE_STEPS +
  ' If the photo has no cooking in it at all, answer {"name": "", "servings": 1, ' +
  '"ingredients": [], "steps": ""}.'

export const DESCRIBE_RECIPE_PROMPT =
  "You turn a description of somebody's home cooking into a recipe for a " +
  'calorie-tracking app. ' +
  RECIPE_KITCHEN +
  RECIPE_SHAPE +
  // Only on this path. A photographed pot has its photograph, and the form
  // shows that instead — see `RecipeDraft.icon`.
  'One more key goes alongside those: "icon", a string or null, described at ' +
  'the end. ' +
  // THE DIFFERENCE FROM THE PHOTO PROMPT, and the only one that matters. A
  // sentence was written by the person who cooked the dish, so what it STATES
  // is the answer rather than evidence to weigh: the amounts they gave are the
  // amounts, and the servings they gave are the servings. The model is filling
  // in what they left out, not second-guessing what they said.
  'The person describing it COOKED it, so anything they state is the answer. ' +
  // The other half of that: what they did NOT state still has to be there. A
  // sentence that is only a dish name and a serving count is the ordinary way
  // this feature is used, and a half-written list is a light pot — "Moussaka,
  // feeds 8" came back without the bechamel or the frying oil and priced a
  // 600 kcal serving at 258.
  'Where they gave no amounts, write the dish out IN FULL as it is normally ' +
  'cooked, including the fat it is fried or baked in and the parts assembled at ' +
  'the end, and size it for the number of people it feeds. ' +
  'Use their amounts exactly where they gave one, and their serving count where ' +
  'they gave one. Only estimate what they left out, and keep those estimates ' +
  'ordinary for the dish. ' +
  'If they did not say how many it feeds, read it off the amounts they did give: ' +
  'a kilo of meat feeds 4 to 6. ' +
  RECIPE_STEPS +
  ' Write the steps from what they told you. If they described no method, write ' +
  'the ordinary way the dish is cooked. ' +
  // The escape hatch, fenced. Read loosely it swallowed real cooking: "Coq au
  // vin, feeds 6" and "Chicken shawarma wraps for 4" both came back as the
  // empty answer, because naming a dish and listing nothing looked to the model
  // like describing no food. A named dish with no amounts is the ordinary case
  // this feature exists for.
  'A dish named with no amounts is still a dish: cook it the usual way and ' +
  'estimate what a pot of it holds. Answer {"name": "", "servings": 1, ' +
  '"ingredients": [], "steps": ""} ONLY when the text names no food at all, as a ' +
  'reminder, a greeting or a question would. ' +
  // Dead last, and see the note on ICON_INSTRUCTION for why: the list of ids
  // is the biggest block of text in this prompt and everything after it is
  // read in its shadow.
  ICON_INSTRUCTION

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
      // Written the way the prompt asks for: one action a sentence, in order,
      // starting with a verb, no flourishes and no long dashes. The mock is
      // what a local run reads, so it has to model the house style too.
      steps:
        'Fry the rempah in oil until it darkens, about 12 minutes.\n' +
        'Add the beef and turn it until it is coated.\n' +
        'Pour in the coconut milk, kerisik and turmeric leaf.\n' +
        'Simmer on the smallest flame for 3 hours, until the gravy clings to the meat.',
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

/**
 * The same form, filled in from a sentence instead of a photograph.
 *
 * Same shape out, same mock, same `null`-on-nothing contract: only the first
 * model call differs, exactly as `describeMeal` differs from `analysePhoto` in
 * `llm.ts`. Nothing downstream of this knows which way the draft arrived.
 */
export async function describeRecipe(
  text_: string,
  mock: RecipeMockSteer | undefined,
): Promise<RecipeDraft> {
  if (mockActive()) {
    if (mock?.fail === 'read') throw new Error('mocked recipe read failure')
    if (mock?.draft) return shapeDraft(mock.draft)
    // Echoes the words back as the name, so a local run shows the typing
    // actually reached the server rather than a fixture that would have come
    // back regardless.
    return shapeDraft({
      name: text_.slice(0, 60) || 'Home recipe',
      servings: 4,
      // A local run exercises the icon path too, or the one thing that only
      // happens on this path is the one thing never seen before it deploys.
      icon: 'gulai',
      ingredients: [
        {
          name: 'Chicken thigh',
          amount: 600,
          unit: 'g',
          kcal: 1254,
          carbs_g: 0,
          protein_g: 156,
          fat_g: 66,
        },
        {
          name: 'Coconut milk',
          amount: 200,
          unit: 'ml',
          kcal: 390,
          carbs_g: 6,
          protein_g: 4,
          fat_g: 42,
        },
        {
          name: 'Rempah paste',
          amount: 120,
          unit: 'g',
          kcal: 168,
          carbs_g: 14,
          protein_g: 3,
          fat_g: 11,
        },
        { name: 'Potato', amount: 300, unit: 'g', kcal: 231, carbs_g: 52, protein_g: 6, fat_g: 0 },
      ],
      steps:
        'Fry the rempah in oil until it darkens, about 8 minutes.\n' +
        'Add the chicken and turn it until the outside is sealed.\n' +
        'Pour in the coconut milk and add the potato.\n' +
        'Simmer on a low flame for 30 minutes, until the potato gives to a fork.',
    })
  }

  const raw = await chatJSON(
    [
      { role: 'system', content: DESCRIBE_RECIPE_PROMPT },
      { role: 'user', content: describeRecipeUserMessage(text_) },
    ],
    2000,
  )
  return shapeDraft(raw)
}

/**
 * What the model is shown, exported for the same reason `describeUserMessage`
 * is: the eval harness grades the prompt as it is actually called, and a
 * harness with its own copy of the wrapper grades a message nobody sends.
 */
export const describeRecipeUserMessage = (described: string): string =>
  `The person cooking it wrote: "${described}"`

/**
 * The publishing gate's prompt, and it asks ONE question: is this a recipe?
 *
 * It used to ask two, and the second was whether the nutrition was credible.
 * That ground reads as an invitation to audit, and a model handed a licence to
 * audit arithmetic finds something wrong with almost every real pot: a rendang
 * whose kerisik looked light, a serving count it would have written as five
 * rather than six. Ordinary home cooking was being rejected at a rate that made
 * publishing feel broken, and the author could do nothing with a reason like
 * "the calories seem low for this much chicken" — the figures came from OUR
 * cascade, not from them.
 *
 * So accuracy is explicitly none of the reviewer's business. What is left is
 * what the gate was for: keeping the community tab from filling up with abuse,
 * adverts and things that are not food. Everything else is somebody's cooking
 * and goes through.
 */
export const REVIEW_RECIPE_PROMPT =
  'You check whether a submission to a recipe-sharing app is actually a recipe. ' +
  'Respond with JSON only: {"approved": boolean, "reason": string}. ' +
  // Two grounds and no others. Both are about what the text IS, never about
  // whether it is any good or whether its numbers add up.
  'Reject it, with a short reason the author can act on, if EITHER: ' +
  '(1) it is not a recipe at all: random or placeholder text, a note to nobody, ' +
  'a test entry, a question, or ingredients that are not food; or ' +
  '(2) the text contains vulgarity, slurs, sexual content, harassment, hate, ' +
  'spam, advertising or a link. ' +
  // Said as plainly as possible, because this is the half that was getting it
  // wrong. A model told only "approve everything else" still hunts for a
  // reason; told the numbers are not its job, it stops.
  'Approve everything else. You are NOT judging the recipe: the calories, the ' +
  'macros, the amounts and the serving count are calculated by the app and are ' +
  "not the author's work, so never reject over a figure that looks wrong, high, " +
  'low or inconsistent. An unusual dish, an unhealthy dish, a terse recipe, odd ' +
  'amounts, a recipe with two ingredients or no steps written down are all fine. ' +
  "This is somebody's home cooking, not a cookbook submission. " +
  'If it names a dish and lists things that go in it, it is a recipe. When in ' +
  'doubt, approve. ' +
  'The reason is one sentence, addressed to the author, and is empty when approved. ' +
  // The reason is SHOWN, so it is copy and the house rule reaches it: no long
  // dashes anywhere a user reads. See the conventions in CLAUDE.md.
  'Write it in plain sentences with no em dashes or en dashes; use a comma, a ' +
  'full stop or a semicolon instead.'

/**
 * What the reviewer is shown, and it is the WORDS rather than the numbers.
 *
 * No calorie figures anywhere, which is a deliberate omission and the other
 * half of the prompt above. A reviewer shown "394 kcal a serving" audits it
 * whatever it has been told not to do, and the figure is not the author's to
 * defend: it comes out of the ingredient rows the app priced. Nothing in the
 * two remaining grounds needs a calorie count to be decided.
 *
 * The amounts stay. They cost almost nothing and they are part of reading
 * whether this is a recipe at all: "2 cups bleach" is caught by the name and
 * the amount together.
 */
export type ReviewInput = {
  name: string
  servings: number
  steps: string
  ingredients: Array<{ name: string; amount: number; unit: string }>
}

export const reviewUserMessage = (recipe: ReviewInput): string =>
  [
    `Name: ${recipe.name}`,
    `Feeds: ${recipe.servings}`,
    'Ingredients:',
    ...recipe.ingredients.map((i) => `- ${i.name}, ${i.amount} ${i.unit}`),
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
