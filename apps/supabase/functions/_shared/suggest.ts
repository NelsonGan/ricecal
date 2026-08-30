// What to eat next: one model call, seven dishes, and why each one fits.
//
// The only model path here that does not start from something the user already
// has. There is nothing to identify: the subject is the rest of the day, and the
// answer is a suggestion rather than a fact. That decides the shape of the file.
//
// Nothing it returns is written anywhere. A guess about a meal somebody has not
// eaten must not become a row other people's diaries are priced from, which is
// the mistake tier 4 made and had to be unwound.
//
// So the figures may be approximate: they rank options against a budget rather
// than being counted against it. What says so is the absence of a way to log,
// since a suggestion has no add button anywhere.
//
// The reasons are the product. A list of dish names against a calorie figure is
// a list anybody could write; "you are 39 g short on protein and one bowl covers
// most of it" is a suggestion. So `why` is required and a pick without one is
// dropped.

import type { Meter } from './entitlement.ts'
import { guessIcon, ICON_INSTRUCTION, type IconChoice, resolveIcon, unslug } from './icons.ts'
import { chatJSON, KITCHEN, mockActive } from './llm.ts'

/** Which sitting this is for. The `public.meal` enum, verbatim. */
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** What the person wants the meal to be heavy in. */
export type Focus = 'protein' | 'balanced' | 'carbs'

/**
 * Which kitchen, in the words the person keeps it under.
 *
 * Free text, and it used to be a union of four. A fixed list is one somebody
 * wanting Thai or their grandmother's Nyonya cooking cannot reach, and the model
 * has no trouble with a cuisine it was not told about.
 *
 * The list lives on the phone, so nothing here validates against one. This end
 * bounds the string and keeps the curated phrasing for the four that had one.
 */
export type Cuisine = string

/**
 * How salty, in three words rather than milligrams. A sodium figure for a dish
 * nobody has cooked is a number with no provenance, and "1,840 mg" borrows the
 * macro panel's authority for a guess about a hawker's hand.
 */
export type Sodium = 'low' | 'medium' | 'high'

/**
 * What a reason is about, so the screen can put a picture beside it. A closed set
 * because the client draws one of five drawings and a sixth kind renders nothing.
 * The fallback is `calories`, true of every suggestion this makes.
 */
export type ReasonKind = 'protein' | 'carbs' | 'fat' | 'calories' | 'taste'

export type Reason = { kind: ReasonKind; text: string }

export type MealPick = {
  name: string
  /** "one bowl", "a plate", "two skewers". What the figures below are for. */
  portion: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  sodium: Sodium
  icon: IconChoice | null
  why: Reason[]
}

/** The day this is being suggested against, as the endpoint assembles it. */
export type DayContext = {
  meal: Meal
  focus: Focus
  cuisine: Cuisine
  /**
   * Lean towards the lighter of two dishes that both fit. A tie-break rather
   * than a filter: told to be healthy outright the model answers with boiled
   * eggs and steamed fish. Off, it is told plainly that there is no preference,
   * because silence reads as a default rather than its absence.
   */
  healthy: boolean
  /** The ceiling the user set on the sheet. */
  kcalLimit: number
  /** What is left of the day's budget. Zero or less when they are over. */
  kcalLeft: number
  proteinLeftG: number
  carbsLeftG: number
  fatLeftG: number
  /** What they have already eaten today, by name. Empty before breakfast. */
  eaten: string[]
}

export type SuggestMockSteer = {
  /** Throw instead of answering, to exercise the endpoint's failure path. */
  fail?: 'suggest'
  /** Answer with these picks verbatim, shaped like a real answer. */
  picks?: unknown
}

/**
 * How many dishes come back. Seven rather than five: the sheet scrolls, and the
 * retry button re-asks with one tap, which makes a short list the thing somebody
 * spends a scan escaping.
 */
export const PICK_COUNT = 7

const REASON_KINDS = new Set<ReasonKind>(['protein', 'carbs', 'fat', 'calories', 'taste'])
const SODIUMS = new Set<Sodium>(['low', 'medium', 'high'])

const clamp = (value: unknown, lo: number, hi: number): number => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : 0
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/**
 * A dish name with a capital on it, when the model sent none. Shown a prompt
 * whose largest block is a list of hyphenated lowercase filenames, the model
 * answers in that register, and `unslug` leaves the case alone.
 *
 * Only when there is no capital anywhere, so "nasi lemak" is fixed and "Nasi
 * Lemak" is left as it came. Title case is a decision about a language this app
 * does not make on the user's behalf.
 */
function titled(name: string): string {
  if (!name || name !== name.toLowerCase()) return name
  return name[0].toUpperCase() + name.slice(1)
}

/**
 * Sentences that belong to a meal other than the one being asked about. Only the
 * breakfast register, which is the one the model reaches for unprompted: "to
 * start your day" turns up on dinners however the prompt is worded.
 */
const BREAKFAST_TALK =
  // Loose around "start … your day", because the phrase mutates rather than
  // stopping: pinned on "start your day" it came back as "start your daily
  // intake". Both halves are still needed, so "after a long day at work" is
  // left alone.
  /\b(start\w*( to)? (your|the) da(y|ily)|morning|wake up|woke up|overnight|breakfast|first meal of the day)\b/i

/**
 * The reasons, with the ones about the wrong sitting taken out. A belt rather
 * than the rule itself: the prompt says this three times, which took the leak
 * from two reasons a request to about one in fifteen picks.
 *
 * It never empties a pick, since `shapePicks` drops a pick with nothing to say
 * and losing a dish to a badly worded sentence is worse than the sentence.
 */
function keepToTheSitting(why: Reason[], meal: Meal | undefined): Reason[] {
  if (!meal || meal === 'breakfast') return why
  const kept = why.filter((reason) => !BREAKFAST_TALK.test(reason.text))
  return kept.length > 0 ? kept : why
}

/**
 * The model's answer, made safe to render. Every field is clamped or dropped,
 * and a pick that loses its name or all of its reasons goes whole. The bar is
 * low otherwise: a dish whose protein figure is implausible is still worth
 * offering.
 *
 * Exported for its own test: every failure here renders as something odd rather
 * than as an error, which is the kind that ships.
 */
export function shapePicks(raw: unknown, meal?: Meal): MealPick[] {
  const list = (raw as { picks?: unknown })?.picks
  if (!Array.isArray(list)) return []

  const picks: MealPick[] = []
  for (const item of list.slice(0, PICK_COUNT)) {
    const row = item as Record<string, unknown>
    // Unslugged, because the icon list is the largest block of text in the
    // prompt and a model reads a long list of filenames as the vocabulary to
    // answer in: asked for Chinese breakfast it named five picks
    // `char-kuey-teow`, `hokkien-mee`, `mee-siam`. Fires only on an exact member
    // of a list we wrote, so a real hyphenated dish name is left alone.
    const name = titled(unslug(text(row.name, 80)))
    if (!name) continue

    const why: Reason[] = []
    for (const entry of Array.isArray(row.why) ? row.why.slice(0, 3) : []) {
      const reason = entry as Record<string, unknown>
      const body = text(reason.text, 160)
      if (!body) continue
      const kind = reason.kind as ReasonKind
      why.push({ kind: REASON_KINDS.has(kind) ? kind : 'calories', text: body })
    }
    // A pick with nothing to say for itself is a dish name on a list, which is
    // the thing this feature exists instead of.
    if (why.length === 0) continue
    const reasons = keepToTheSitting(why, meal)

    picks.push({
      name,
      portion: text(row.portion, 40) || 'one serving',
      // 2,000 kcal is well past anything a single meal is, and it is the point
      // at which a figure is more likely a day's total than a dish.
      kcal: clamp(row.kcal, 0, 2000),
      protein_g: clamp(row.protein_g, 0, 300),
      carbs_g: clamp(row.carbs_g, 0, 400),
      fat_g: clamp(row.fat_g, 0, 200),
      sodium: SODIUMS.has(row.sodium as Sodium) ? (row.sodium as Sodium) : 'medium',
      // The model's answer first, the dish's own name second. `guessIcon` is
      // the same backstop a typed meal gets, and it earns more here: a blank
      // tile reads as a dish the app does not know about.
      icon: resolveIcon(row.icon) ?? guessIcon(name),
      why: reasons,
    })
  }

  return picks
}

/**
 * The shape the model answers in, written out as a literal because that is the
 * only place a model reliably reads a field list from. Same as `recipeSchema`.
 */
const SUGGEST_SHAPE =
  'Respond with JSON only, in this exact shape: ' +
  '{"picks": [{"name": string, "portion": string, "kcal": number, ' +
  '"protein_g": number, "carbs_g": number, "fat_g": number, ' +
  '"sodium": "low" | "medium" | "high", "icon": string | null, ' +
  '"why": [{"kind": "protein" | "carbs" | "fat" | "calories" | "taste", "text": string}]}]}. ' +
  `Give exactly ${PICK_COUNT} picks. ` +
  // The portion is the unit the figures are in, and without it the panel on
  // screen is four numbers about an unstated amount of food. "One bowl" is
  // also the only part of a suggestion somebody can act on in a shop.
  '"portion" is the amount the figures describe, in the words a person would ' +
  'use: "one bowl", "a plate", "two skewers". Never a weight in grams. ' +
  '"sodium" is how salty the dish is as it is usually served. '

/**
 * Why each pick fits, which is the half of this feature that is not a list.
 * Three rules, each a way the reasons went wrong without it.
 *
 * About this person's day: "high in protein" would be true if nobody had eaten
 * anything, where "you are 39 g short on protein" is a suggestion.
 *
 * Not a repeat of the panel: the calories are printed in 30pt directly above,
 * and "only 420 calories" spends the most-read line on the number the eye has
 * already landed on.
 *
 * And short, because three of them sit in a card and the model writes
 * paragraphs.
 */
const WHY_RULES =
  // One to three, not "two or three": asked for two it always found two, and the
  // second was filler on any dish with one thing to say for itself. A floor on
  // the count is a floor on the padding.
  'Each pick carries 1 to 3 short reasons, one sentence each, at most 15 words. ' +
  'A reason is about THIS PERSON and the day they have had, not about the dish ' +
  'in general: what they are short of, what they have already eaten, what they ' +
  'asked for. Do not restate the calorie figure or the macro grams, which the ' +
  'app prints beside them. ' +
  // Both of these came back on the first live run, one after the other. A model
  // asked for a reason with nothing to say writes a sentence about the request
  // instead of about the food.
  'Never write a reason that would be true of any pick on the list: not "fits ' +
  'your calorie budget", not "a great choice", not "satisfies your craving". If ' +
  'a dish has only one real reason, give one. ' +
  // It wrote "contrasts with yesterday's heavy meals" having been told nothing
  // whatever about yesterday. A reason is only worth printing if it is true,
  // and the only facts about this person are the ones in the message.
  'Only say things the message actually tells you. You know nothing about any ' +
  'day but this one, nothing about their weight, and nothing about what they ' +
  'usually eat. ' +
  '"kind" says which of the five the reason is about, so the app can draw the ' +
  'right picture next to it. ' +
  'Do not use em dashes or en dashes anywhere. Use British spelling. '

/**
 * The prompt. Exported like the others in `llm.ts`, so `pnpm eval:prompts` grades
 * the string that is actually sent.
 *
 * What it is told not to do is most of it. It must not invent the person's
 * numbers, because a model that gets to state a budget states a convenient one.
 * It must not offer the same dish twice under two names, which is what "five
 * suggestions" produced: nasi goreng ayam, kampung, pattaya. And it must not
 * exceed the ceiling, because a ceiling that is a suggestion is not a ceiling.
 */
export const SUGGEST_MEAL_PROMPT =
  'You suggest what somebody could eat next, for a calorie-tracking app used in ' +
  'Malaysia. ' +
  KITCHEN +
  SUGGEST_SHAPE +
  // What a pick is comes first, because every constraint below is wasted on an
  // answer that is not a meal.
  //
  // Named foods, because "not a plate of separate ingredients" was not enough:
  // released from a named cuisine the model answered with grilled chicken breast,
  // boiled eggs and steamed fish three runs running, which is what makes this
  // read as a diet app rather than a diary.
  'Every pick is a DISH SOMEBODY ORDERS BY NAME: a hawker plate, a mamak order, ' +
  'something from a food court, a meal a person cooks and sits down to. A bare ' +
  'ingredient is not a pick and never can be, however well it fits the numbers: ' +
  'not plain grilled chicken breast, not boiled eggs, not steamed fish on its ' +
  'own, not a cup of yoghurt, not a protein shake. If a food needs something ' +
  'served with it, name the whole dish instead. Not a recipe, not a diet plan. ' +
  // The ceiling, from both ends. A pick over it is useless because it is the
  // number the person set; a pick far under it is nearly as useless, and given a
  // 700 kcal ceiling the model offered five things between 100 and 180.
  'Every pick must come in at or under the calorie ceiling you are given, and ' +
  'most of them should be within about a quarter of it. The ceiling is the SIZE ' +
  'of meal being asked for, not a limit to come in far beneath. ' +
  // The dishonest way out, taken as soon as the ceiling was tight: asked for a
  // 300 kcal snack it offered "nasi lemak, one plate, 280 kcal". A figure bent to
  // fit the request is worse than no suggestion.
  "NEVER shrink a dish's calories to make it fit. If it does not fit at the way " +
  'it is normally served, either say the smaller portion honestly in "portion" ' +
  '("half a plate", "two pieces") and price THAT, or suggest something else. ' +
  // ALL DIFFERENT THINGS. Left unsaid, the list came back as one dish with the
  // garnish changed.
  'Every pick is a different dish, not one dish in several styles. Vary the ' +
  'main ingredient and the way it is cooked. ' +
  // The sitting governs, said outright: asked for dinner, the first live run
  // answered with a reason about starting the day, having read the meal as a
  // label rather than a constraint. Both the food and the sentence have to suit
  // the sitting.
  'The meal you are given is the sitting this is for. Suggest what that sitting ' +
  'is actually eaten at, and never write a reason belonging to another one: ' +
  'nothing about starting the day unless it is breakfast, nothing about winding ' +
  'down unless it is dinner, nothing about either one for a snack. ' +
  // And a snack is a KIND of food, not a small meal. Asked for one it offered a
  // plate of nasi lemak with a sentence about starting the day, at five in the
  // afternoon.
  'A snack is a small thing eaten between meals: kuih, a drink, fruit, a piece ' +
  'of something fried, a few skewers. It is never a rice plate or a bowl of ' +
  'noodles, however few calories you claim for it. ' +
  // The half of the healthy lean that holds whichever way it is set. The lean
  // itself is per-request and lives in the user message; this is the guard rail
  // either side of it.
  'Whatever the person asks for, never answer with diet food, plain ingredients ' +
  'or anything nobody orders by name, and never mention health, dieting or ' +
  'clean eating in the reasons. The dish speaks for itself. ' +
  // Likewise the cuisine. Asked for Malay, the same run offered mee goreng mamak
  // and roti canai, which are the neighbouring kitchen.
  'The cuisine you are given is a constraint, not a hint. Every pick belongs to ' +
  'it. Mamak and Malay are DIFFERENT kitchens here: roti canai, mee goreng mamak ' +
  'and nasi kandar are mamak, not Malay. ' +
  // The one thing the model must not do with the numbers it is handed.
  'The calories left, the macros left and what they have eaten are facts you are ' +
  'given. Use them and never restate them as something else. ' +
  // The macros are background rather than a specification. This is the failure
  // behind the bare ingredients above: on a day with no carbs and no fat left to
  // spend, the model read the shortfall as a recipe and answered with pure
  // protein. A meal solved exactly is not a meal anybody eats.
  'The macros are context for the reasons, not a specification to hit. A day ' +
  'with no carbs left is not a day of eating no carbs: suggest real meals that ' +
  'lean the right way. Never assemble a pick to meet the numbers. ' +
  WHY_RULES +
  ' ' +
  ICON_INSTRUCTION

/**
 * No constraint on the kitchen at all. Said as a release rather than a category,
 * or the model looks for a cuisine called "other". "Still real food sold
 * somewhere" is the half that needed saying: released from a cuisine, it reached
 * for diet food rather than a wider menu.
 */
const ANY_CUISINE = 'any cuisine at all, whatever fits best, as long as it is a dish people order'

/**
 * The names that carry curated wording, which were the whole list once. Each
 * phrase came from a failure: "Chinese" alone fetched mainland dishes nobody
 * sells here. Everything else a user types is phrased as "<name> food".
 *
 * A `Map` rather than an object, because the key is whatever somebody typed: an
 * object literal answers `constructor` and `toString` off `Object.prototype`.
 */
const KNOWN_CUISINES = new Map<string, string>([
  ['malay', 'Malay food'],
  ['mamak', 'mamak food'],
  ['chinese', 'Chinese food, the Malaysian kind'],
  ['indian', 'Indian food, the kind eaten in Malaysia'],
  ['others', ANY_CUISINE],
  ['anything', ANY_CUISINE],
])

/**
 * The longest a cuisine may be. The client holds the same bound; this one holds
 * for anything else that reaches the endpoint.
 */
export const MAX_CUISINE_LENGTH = 40

/**
 * The cuisine, as a phrase the prompt can put after "It must be". Bounded rather
 * than validated, because there is no list to validate against: trimmed, capped,
 * and stripped of the line breaks that would let it pose as another instruction.
 * An empty one is the release rather than an error.
 */
export const cuisinePhrase = (cuisine: string): string => {
  const clean = String(cuisine ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CUISINE_LENGTH)
  if (!clean) return ANY_CUISINE
  return KNOWN_CUISINES.get(clean.toLowerCase()) ?? `${clean} food`
}

const FOCUS: Record<Focus, string> = {
  protein: 'They want it protein heavy.',
  balanced: 'They want it balanced across the macros.',
  carbs: 'They want it carb heavy.',
}

/**
 * The user message: the day, in the fewest facts that decide an answer. Exported
 * for the eval harness.
 *
 * What they have already eaten is the least obvious of them. Without it the
 * reasons are about a budget and nothing else, where the best line this feature
 * produces connects the two ends of a day: "only 9 g carbs, so it balances the
 * nasi lemak from breakfast". Names only, since the totals are already given.
 *
 * Shortfalls are left out rather than sent as zeroes: a zero here reads as a
 * rule about the food rather than the absence of a shortfall.
 */
const macroLine = (day: DayContext): string => {
  const short = [
    day.proteinLeftG > 0 ? `${day.proteinLeftG} g protein` : null,
    day.carbsLeftG > 0 ? `${day.carbsLeftG} g carbs` : null,
    day.fatLeftG > 0 ? `${day.fatLeftG} g fat` : null,
  ].filter(Boolean)

  return short.length > 0
    ? `They could still use: ${short.join(', ')}.`
    : 'They have met every macro target for today.'
}

export const suggestUserMessage = (day: DayContext): string => {
  const lines = [
    day.kcalLeft > 0
      ? `They have ${day.kcalLeft} kcal left in today's budget.`
      : "They have already used today's calorie budget.",
    // Only the macros they are actually short of. "0 g carbs" told the model to
    // suggest food with no carbs in it, where the question was which way to
    // lean.
    macroLine(day),
    day.eaten.length > 0
      ? `Already eaten today: ${day.eaten.slice(0, 8).join(', ')}.`
      : 'They have not eaten anything yet today.',
    // The ask goes last. Written first, with the day's figures under it, the
    // sitting read as a label on a report. The three constraints are the
    // question; everything above them is background.
    `Suggest ${PICK_COUNT} things to eat.`,
    `It must be ${cuisinePhrase(day.cuisine)}.`,
    FOCUS[day.focus],
    `No pick may be over ${day.kcalLimit} kcal.`,
    day.healthy
      ? 'Between dishes that fit equally well, lean towards the lighter one: grilled, ' +
        'steamed or in broth ahead of deep fried, more vegetables and less oil, the ' +
        'lighter version of a dish where one is genuinely sold.'
      : 'No health preference. Suggest what people actually enjoy eating, the rich ' +
        'and the fried included, and do not quietly lighten the list.',
    // And the sitting is the very last line, twice stated. Named at the top it
    // read as a label; as one constraint among four, "to start your day" still
    // came back on a third of dinners. It is the constraint the model's prior
    // fights hardest, so it gets the position a model weights most, and it is a
    // rule about the words as well as the food.
    `This is for their ${day.meal.toUpperCase()}. Every pick and every reason ` +
      `must belong to that sitting: do not write about starting the day, ` +
      `breakfast, morning or waking up unless the meal is breakfast.`,
  ]
  return lines.join('\n')
}

/**
 * Seven things to eat, or an empty list. Empty is a real answer: the screen says
 * "we could not think of anything, try again" rather than showing a broken list.
 * There is no fallback here and none in the scan cascade either, because an
 * answer nobody worked out wearing the clothes of one that was is the failure
 * both are written to avoid.
 */
export async function suggestMeals(
  day: DayContext,
  mock: SuggestMockSteer | undefined,
  meter: Meter,
): Promise<MealPick[]> {
  if (mockActive()) {
    if (mock?.fail === 'suggest') throw new Error('mocked suggestion failure')
    if (mock?.picks) return shapePicks({ picks: mock.picks }, day.meal)
    return shapePicks({ picks: MOCK_PICKS }, day.meal)
  }

  const raw = await chatJSON(
    meter,
    [
      { role: 'system', content: SUGGEST_MEAL_PROMPT },
      { role: 'user', content: suggestUserMessage(day) },
    ],
    // Seven picks with eight fields and three reasons each. Truncated JSON does
    // not parse, and a parse failure here costs the whole suggestion, so the
    // ceiling moved with the count rather than being left at the old one.
    3000,
  )
  return shapePicks(raw, day.meal)
}

/**
 * What a local stack answers with. Real dishes with real-ish figures rather than
 * "Mock dish 1", because what is being exercised locally is the screen.
 */
const MOCK_PICKS = [
  {
    name: 'Sup kambing',
    portion: 'one bowl',
    kcal: 420,
    protein_g: 42,
    carbs_g: 9,
    fat_g: 19,
    sodium: 'high',
    icon: 'sup-kambing',
    why: [
      { kind: 'protein', text: 'You are short on protein and one bowl covers most of it.' },
      { kind: 'carbs', text: 'Barely any carbs, so it balances a heavy breakfast.' },
    ],
  },
  {
    name: 'Yong tau foo soup',
    portion: 'one bowl',
    kcal: 380,
    protein_g: 31,
    carbs_g: 22,
    fat_g: 14,
    sodium: 'medium',
    icon: 'yong-tau-foo',
    why: [
      { kind: 'protein', text: 'Tofu and fish paste put the protein where you need it.' },
      { kind: 'calories', text: 'Leaves room in the budget for a drink later.' },
    ],
  },
  {
    name: 'Ayam percik',
    portion: 'half a chicken',
    kcal: 460,
    protein_g: 44,
    carbs_g: 12,
    fat_g: 26,
    sodium: 'medium',
    icon: 'ayam-percik',
    why: [
      { kind: 'protein', text: 'Grilled rather than fried, so the protein comes cheap.' },
      { kind: 'taste', text: 'You asked for Malay food and this is the classic one.' },
    ],
  },
  {
    name: 'Kuey teow soup',
    portion: 'one bowl',
    kcal: 310,
    protein_g: 24,
    carbs_g: 44,
    fat_g: 6,
    sodium: 'high',
    icon: 'kuey-teow-soup',
    why: [
      { kind: 'calories', text: 'The lightest thing here that still counts as dinner.' },
      { kind: 'fat', text: 'Broth rather than a wok, so almost no added oil.' },
    ],
  },
  {
    name: 'Nasi kerabu ayam',
    portion: 'one plate',
    kcal: 560,
    protein_g: 34,
    carbs_g: 62,
    fat_g: 18,
    sodium: 'medium',
    icon: 'nasi-kerabu',
    why: [
      { kind: 'carbs', text: 'A full plate if you want dinner to actually be dinner.' },
      { kind: 'taste', text: 'The herbs make it the least heavy rice plate going.' },
    ],
  },
  {
    name: 'Popiah basah',
    portion: 'two rolls',
    kcal: 240,
    protein_g: 9,
    carbs_g: 34,
    fat_g: 8,
    sodium: 'medium',
    icon: 'popiah',
    why: [
      { kind: 'calories', text: 'Small enough to sit beside something else later.' },
      { kind: 'taste', text: 'Mostly turnip and egg, so it does not sit heavy.' },
    ],
  },
  {
    name: 'Ikan bakar with rice',
    portion: 'one plate',
    kcal: 520,
    protein_g: 38,
    carbs_g: 55,
    fat_g: 14,
    sodium: 'high',
    icon: 'ikan-bakar',
    why: [
      { kind: 'protein', text: 'Grilled fish puts the protein in without the oil.' },
      { kind: 'fat', text: 'Over the coals rather than the wok, so very little added fat.' },
    ],
  },
]
