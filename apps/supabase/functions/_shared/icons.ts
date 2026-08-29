// Which drawing goes on a typed meal or a described recipe.
//
// Neither arrives with a photograph, so the row would otherwise be a name over
// an empty square in a diary where the meals beside it have pictures. The
// catalogue cannot be illustrated (a few hundred drawings against half a million
// rows), but the model that just read "nasi lemak with fried chicken" knows
// which of our drawings that is.
//
// So the prompt carries the list and the model picks a name out of it. An
// invented name renders nothing, so `resolveIcon` only ever answers with
// something that exists.
//
// The names come from `icons.generated.ts`, written by the same script that

import { ICON_NAMES } from './icons.generated.ts'

/** 'dishes' | 'food' — the two `icon_set` values a plate can be drawn from. */
export type IconSet = keyof typeof ICON_NAMES

export type IconChoice = { set: IconSet; name: string }

/**
 * The drawings that are not food.
 *
 * `food` is a mixed set: alongside the ingredients it carries the kitchen (a
 * wok, a scale), the dietary badges and the nutrient markers. All are legitimate
 * for a screen to draw and none is a meal, so they are excluded here rather than
 * in the generated file: the generator knows what exists, this knows what a
 * plate looks like.
 *
 * Hand-kept, and the default is to include, which is the safe direction for
 * drift: a new drawing becomes offerable and the worst case is an odd picture,
 * where the reverse default would silently stop offering new food.
 *
 * The picker the user taps through offers all of these: somebody choosing
 * "vegan" for their salad means it, and a model choosing "kitchen-scale" for a
 * plate of rice is a bug.
 */
const NOT_A_MEAL = new Set([
  // The kitchen itself.
  'air-fryer',
  'blender',
  'chopping-board',
  'chopsticks',
  'fork-spoon',
  'frying-pan',
  'kitchen-scale',
  'knife',
  'ladle',
  'measuring-cup',
  'microwave',
  'rice-cooker',
  'salt-shaker',
  'pepper-grinder',
  'spatula',
  'steamer',
  'sugar-spoon',
  'teapot',
  'tray',
  'wok',
  // Dietary badges. A claim about a food, never the food.
  'dairy-free',
  'gluten-free',
  'halal',
  'high-protein',
  'low-sugar',
  'nut-free',
  'organic',
  'spicy-meter',
  'vegan',
  'vegetarian',
  'verified-food',
  // Nutrients and labels, which is chrome for the reports.
  'calcium',
  'carb-block',
  'cholesterol',
  'expiry-date',
  'fat-block',
  'fibre',
  'iron',
  'kcal-tag',
  'nutrition-label',
  'protein-block',
  'vitamin-c',
  // Empty packaging. The drink containers stay: a canned drink IS the log.
  'delivery-bag',
  'drink-bag',
  'empty-plate',
  'food-container',
  'food-parcel',
  'lunch-box',
  'paper-cup',
  'portion-plate',
  'straw-cup',
  'takeaway-packet',
  'tiffin-carrier',
  // Neither food nor a container of it.
  'ice-cubes',
  'salt-pinch',
])

/** Which set each offerable name belongs to. */
const SET_OF = new Map<string, IconSet>()
for (const set of Object.keys(ICON_NAMES) as IconSet[]) {
  for (const name of ICON_NAMES[set]) {
    if (NOT_A_MEAL.has(name)) continue
    // `dishes` is read first and wins, though nothing collides today: the two
    // sets have no name in common, which is the reason the model is asked for
    // a bare name rather than a set-and-name pair. Half the tokens, and one
    // fewer field to get wrong.
    if (!SET_OF.has(name)) SET_OF.set(name, set)
  }
}

/**
 * The names, for the prompt. Built once at module load: about 200 slugs and
 * 2 kB, which is real money on every typed meal.
 *
 * `dishes` first, because that is where the local food is and the first thing in
 * a list is what a model reaches for when two answers fit.
 */
export const ICON_LIST: string = [...SET_OF.keys()].join(', ')

/**
 * An icon id that has turned up somewhere it does not belong, unslugged.
 *
 * ICON_INSTRUCTION fences the list off and the fence is not airtight, since a
 * model reads a long list of names as the vocabulary to answer in. This is the
 * belt, and it can be blunt because it only fires on an exact member of a list
 * we wrote, leaving a real hyphenated food name alone.
 *
 * Only worth doing for text about to be searched: a hyphen costs nothing in the
 * catalogue's own matching, but it costs the exact-name arm and fills the misses
 * backlog, which a person reads.
 */
export function unslug(text: string): string {
  const trimmed = text.trim()
  return SET_OF.has(trimmed.toLowerCase()) ? trimmed.replaceAll('-', ' ') : trimmed
}

/**
 * The model's answer as a real icon, or nothing. Nothing is a good outcome and
 * the callers treat it as one. What this prevents is writing `icon_name: 'nasi
 * lemak'` or `'ramen'`, either of which passes the database's checks (the column
 * is free text, only the set is an enum) and renders blank forever.
 */
export function resolveIcon(raw: unknown): IconChoice | null {
  if (typeof raw !== 'string') return null
  // Slugged, because a model that has been shown hyphenated names still
  // answers "Nasi Lemak" often enough to be worth the two lines.
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  if (!name) return null

  const set = SET_OF.get(name)
  if (set) return { set, name }

  // Logged, because this failure has no symptom: a rejected name looks exactly
  // like a row without a drawing, so a prompt answering `char-kway-teow` for a
  // picture filed under `char-kuey-teow` degrades silently. A near miss says the
  // model is trying and the list is what needs a word adding to it.
  console.warn(`[icons] the model named a drawing we do not have: ${name}`)
  return null
}

/**
 * A drawing worked out from the dish's own name, when the model gave none or
 * answered in a spelling we do not carry. Our slugs have one spelling of each
 * dish and the world has several, and a near miss is indistinguishable, on the
 * row, from having no drawing at all.
 *
 * Two shared words minimum. One is far too loose: "Chicken soup" shares
 * `chicken` with `chicken-rice`. Two is enough for `char kway teow` to find
 * `char-kuey-teow`, and it stops a single common word carrying a match.
 *
 * An exact slug wins outright, which is the ordinary case.
 */
export function guessIcon(name: unknown): IconChoice | null {
  if (typeof name !== 'string') return null
  const slug = name
    .trim()
    .toLowerCase()
    // Everything that is not a letter or a digit becomes a separator, so
    // "Kari ayam (pedas)" and "char-kuey-teow" arrive in the same shape.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) return null

  const exact = SET_OF.get(slug)
  if (exact) return { set: exact, name: slug }

  // Words worth matching on. The one-letter and two-letter ones are dropped
  // because they are the joins — "of", "in", "a" — and a shared join is not a
  // shared word.
  const words = new Set(slug.split('-').filter((word) => word.length > 2))
  if (words.size < 2) return null

  let best: IconChoice | null = null
  let bestScore = 1
  for (const [candidate, set] of SET_OF) {
    const shared = candidate.split('-').filter((word) => words.has(word)).length
    // Strictly greater, so the FIRST icon at a given score keeps it — and
    // `dishes` is inserted before `food`, which is the tie-break we want: the
    // drawing of the dish beats the drawing of one thing in it.
    if (shared > bestScore) {
      bestScore = shared
      best = { set, name: candidate }
    }
  }
  return best
}

/**
 * What to say to the model about picking one. Shared by the meal and recipe
 * prompts so the two cannot drift on the rule that matters: an exact name from
 * the list, or nothing. Told to "choose the closest", a model handed a bowl of
 * pho picks `laksa` and the diary shows the wrong dish rather than no dish.
 *
 * Two hundred hyphenated slugs is the largest block of example text in either
 * prompt, and a model reads a long list of names as the vocabulary to answer in:
 * asked for "Fried flat rice noodles with prawns" it came back named
 * `Char-kuey-teow`. So the block goes last, after every field it could
 * contaminate, it says outright that these are filenames, and the fence comes
 * before the list, since whatever follows 2 kB of slugs is read in their shadow.
 */
export const ICON_INSTRUCTION =
  'Last, "icon". This is the little picture the app draws next to it, and the ' +
  'value is an image FILENAME, not words: it is one of the fixed ids below, ' +
  'copied character for character, or null. ' +
  // Said before the list, because after it is too late.
  //
  // The fields are enumerated rather than covered by "any other field", which is
  // what this used to say: the leak simply moved to the search fields, since a
  // query reads as more filename-like than a name does. It searched anyway, so
  // nothing looked broken; what it cost was the exact-name arm and a backlog of
  // hyphenated nonsense in the misses table.
  'These ids are not names of anything, and they are not search terms. Never ' +
  'copy one into "name", "specific_query", "generic_query", a component name, an ' +
  'ingredient, the steps, or any other field: they are hyphenated because they ' +
  'are filenames. Everywhere else the food is called what a person calls it, in ' +
  'ordinary words with spaces — "chicken rice", never "chicken-rice". ' +
  'Choose the id that is the dish itself, or failing that its main ingredient. ' +
  'Answer null when nothing in the list is either; a wrong picture is worse ' +
  `than none. The ids: ${ICON_LIST}.`
