// What to eat next: one model call, five dishes, and why each one fits.
//
// The only model path in this app that does not start from something the user
// already has. A scan reads a plate, a refine reads a correction, a recipe read
// reads a pot — each has a subject, and the model's job is to identify it. Here
// there is nothing to identify: the subject is the REST OF THE DAY, and the
// answer is a suggestion rather than a fact.
//
// That difference decides the whole shape of this file.
//
// **Nothing it returns is written anywhere.** The picks are read and thrown
// away; nothing lands in `food_logs`, nothing lands in the catalogue. A guess
// about a meal somebody has not eaten is the last thing that should become a
// row other people's diaries are priced from — which is the mistake tier 4 made
// and had to be unwound (see the note on the estimate tier in CLAUDE.md).
//
// **So the figures are allowed to be approximate.** They exist to rank five
// options against a budget, not to be counted against it. Nothing on screen labels
// them as estimates, and what carries that instead is the ABSENCE of a way to log:
// a suggestion has no add button anywhere, so no figure here can reach a diary
// without somebody logging the meal themselves and the catalogue pricing it.
//
// **And the reasons are the product.** Five dish names against a calorie figure
// is a list anybody could write; "you are 39 g short on protein and one bowl
// covers most of it" is the thing that makes it a suggestion. Which is why
// `why` is required per pick and a pick without one is dropped.

import type { Meter } from './entitlement.ts'
import { guessIcon, ICON_INSTRUCTION, type IconChoice, resolveIcon, unslug } from './icons.ts'
import { chatJSON, KITCHEN, mockActive } from './llm.ts'

/** Which sitting this is for. The `public.meal` enum, verbatim. */
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** What the person wants the meal to be heavy in. */
export type Focus = 'protein' | 'balanced' | 'carbs'

/**
 * Which kitchen. Hardcoded rather than read from anywhere, because these are
 * the four a Malaysian eater picks between and a list assembled from the
 * catalogue would be a list of whatever happens to have been imported.
 *
 * `others` is not a fifth cuisine, it is the absence of the constraint: it
 * tells the model to pick on the merits rather than to go looking for a fourth
 * tradition.
 */
export type Cuisine = 'malay' | 'mamak' | 'chinese' | 'others'

/**
 * How salty, in three words rather than in milligrams.
 *
 * A sodium figure for a dish nobody has cooked yet is a number with no
 * provenance at all, and printing "1,840 mg" would borrow the authority of the
 * macro panel for a guess about a hawker's hand. Low / medium / high is what
 * the model can actually answer, and it is what the reader wants: sup kambing
 * is salty, and no one is going to act on the third digit.
 */
export type Sodium = 'low' | 'medium' | 'high'

/**
 * What a reason is ABOUT, so the screen can put a picture beside it.
 *
 * A closed set rather than free text, for the reason the icon name is a closed
 * set: the client draws one of five drawings, and a sixth kind renders nothing.
 * The fallback is `calories`, which is true of every suggestion this makes.
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

/** How many dishes come back. Five is what the sheet shows without scrolling. */
export const PICK_COUNT = 5

const REASON_KINDS = new Set<ReasonKind>(['protein', 'carbs', 'fat', 'calories', 'taste'])
const SODIUMS = new Set<Sodium>(['low', 'medium', 'high'])

const clamp = (value: unknown, lo: number, hi: number): number => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : 0
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/**
 * A dish name with a capital on it, when the model sent none.
 *
 * Shown a prompt whose largest block is a list of hyphenated lowercase
 * filenames, the model answers in that register: `nasi-lemak`, `roti-canai`,
 * `teh-tarik`. `unslug` takes the hyphens out and leaves the case, so the sheet
 * drew a list of five dishes in lower case beside a diary whose every row is
 * capitalised.
 *
 * Only when there is NO capital anywhere in the name, so "nasi lemak" is fixed
 * and "Nasi Lemak" and "roti telur with dhal" are left exactly as they came.
 * Nothing else about the case is touched: title case is a decision about a
 * language this app does not make on the user's behalf.
 */
function titled(name: string): string {
  if (!name || name !== name.toLowerCase()) return name
  return name[0].toUpperCase() + name.slice(1)
}

/**
 * Sentences that belong to a meal other than the one being asked about.
 *
 * Only the breakfast register, because that is the only one the model reaches
 * for unprompted: "to start your day", "in the morning", "after fasting
 * overnight" turn up on dinners no matter how the prompt is worded. There is no
 * matching problem in the other direction — nothing has ever described a
 * breakfast as winding down the evening.
 */
const BREAKFAST_TALK =
  // Loose around "start … your day", because the phrase mutates rather than
  // stopping: pinned on "start your day" it came back as "start your daily
  // intake" on the next run. It still needs BOTH halves, so an ordinary
  // "warming after a long day at work" is left alone.
  /\b(start\w*( to)? (your|the) da(y|ily)|morning|wake up|woke up|overnight|breakfast|first meal of the day)\b/i

/**
 * The reasons, with the ones about the wrong sitting taken out.
 *
 * A BELT rather than the rule itself. The prompt says this three times — in the
 * system message, in the last line of the user message, and as a rule about the
 * words rather than the food — and it took the leak from roughly two reasons a
 * request to about one in fifteen picks. This removes that last one, on the
 * screen where it is most read: the first pick's first reason.
 *
 * It never empties a pick. A reason is dropped only when another survives,
 * because `shapePicks` drops a pick with nothing to say for itself and losing a
 * DISH to a badly worded sentence is a worse answer than the sentence. The
 * cases this leaves behind are rare and are still a real suggestion.
 */
function keepToTheSitting(why: Reason[], meal: Meal | undefined): Reason[] {
  if (!meal || meal === 'breakfast') return why
  const kept = why.filter((reason) => !BREAKFAST_TALK.test(reason.text))
  return kept.length > 0 ? kept : why
}

/**
 * The model's answer, made safe to render.
 *
 * Every field is clamped or dropped rather than trusted, and a pick that loses
 * its name or all of its reasons is dropped whole. The bar is deliberately low
 * otherwise: this is a suggestion, and a dish whose protein figure came back
 * implausible is still a dish worth offering — the number is clamped and the
 * name survives.
 *
 * Exported for its own test. Everything here has a failure that renders as
 * something odd rather than as an error, which is the kind that ships.
 */
export function shapePicks(raw: unknown, meal?: Meal): MealPick[] {
  const list = (raw as { picks?: unknown })?.picks
  if (!Array.isArray(list)) return []

  const picks: MealPick[] = []
  for (const item of list.slice(0, PICK_COUNT)) {
    const row = item as Record<string, unknown>
    // Unslugged, because the icon list is the largest block of text in the
    // prompt and a model reads a long list of filenames as the vocabulary it
    // should answer in — asked for Chinese breakfast it came back with five
    // picks named `char-kuey-teow`, `hokkien-mee`, `mee-siam`. The fence in
    // ICON_INSTRUCTION is not airtight and this is the belt behind it; it fires
    // only on an exact member of a list we wrote, so a real hyphenated dish name
    // is left alone.
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
      // the same backstop a typed meal gets, and it earns more here than
      // anywhere: a suggestion IS its picture in a list of five, and a row with
      // a blank tile reads as a dish the app does not know about.
      icon: resolveIcon(row.icon) ?? guessIcon(name),
      why: reasons,
    })
  }

  return picks
}

/**
 * The shape the model answers in.
 *
 * Written out as a literal because that is the only place in a prompt a model
 * reliably reads a field list from — the same reasoning as `recipeSchema`.
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
 * WHY EACH PICK FITS, which is the half of this feature that is not a list.
 *
 * Three rules, and each one is a way the reasons went wrong when it was absent.
 *
 * They must be about THIS PERSON'S DAY. "High in protein" is a fact about the
 * dish and would be true if nobody had eaten anything; "you are 39 g short on
 * protein" is the sentence that makes a suggestion a suggestion.
 *
 * They must not repeat the panel. The calories are printed in 30pt directly
 * above, and a first bullet reading "only 420 calories" spends the most-read
 * line on the number the eye has already landed on.
 *
 * And they are SHORT. Three of them sit in a card under a macro panel, and the
 * model's instinct is a paragraph each.
 */
const WHY_RULES =
  // ONE TO THREE, not "two or three". Asked for two it always found two, and the
  // second was filler on any dish that only had one thing to say for itself:
  // "it fits comfortably within your calorie budget", which is the sentence
  // banned two lines below. A floor on the count is a floor on the padding.
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
 * The prompt.
 *
 * Exported like the others in `llm.ts`, so `pnpm eval:prompts` grades the
 * string that is actually sent.
 *
 * WHAT IT IS TOLD NOT TO DO is most of it, and the reasons are the same ones
 * the scan prompts learnt. It must not invent the person's numbers — those are
 * given, and a model asked to reason about a budget it also gets to state will
 * state a convenient one. It must not offer the same dish twice under two
 * names, which is what "five suggestions" produced left to itself: nasi goreng
 * ayam, nasi goreng kampung, nasi goreng pattaya. And it must not exceed the
 * ceiling, because a ceiling that is a suggestion is not a ceiling — the whole
 * sheet the user filled in is about what will fit.
 */
export const SUGGEST_MEAL_PROMPT =
  'You suggest what somebody could eat next, for a calorie-tracking app used in ' +
  'Malaysia. ' +
  KITCHEN +
  SUGGEST_SHAPE +
  // WHAT A PICK IS comes first, before any of the constraints, because it is the
  // one thing that was got wrong repeatedly and every constraint below is
  // wasted on an answer that is not a meal.
  //
  // Named foods, because "not a plate of separate ingredients" was not enough on
  // its own: released from a named cuisine the model answered with grilled
  // chicken breast, two boiled eggs, steamed fish and a cup of yoghurt, three
  // runs running. Every one of those is an ingredient wearing a meal's clothes,
  // and it is the failure that makes this feature read as a diet app rather
  // than as a diary.
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
  // The dishonest way out of that, which the model took the moment the ceiling
  // was tight: asked for a 300 kcal snack it offered "nasi lemak, one plate,
  // 280 kcal", which is less than half what a plate of nasi lemak is. A figure
  // bent to fit the request is worse than no suggestion, because it is the one
  // number on the screen somebody might act on.
  "NEVER shrink a dish's calories to make it fit. If it does not fit at the way " +
  'it is normally served, either say the smaller portion honestly in "portion" ' +
  '("half a plate", "two pieces") and price THAT, or suggest something else. ' +
  // Five DIFFERENT things. Left unsaid, the list came back as one dish with the
  // garnish changed.
  'The five are five different dishes, not one dish in five styles. Vary the ' +
  'main ingredient and the way it is cooked. ' +
  // THE SITTING GOVERNS, and it has to be said outright. Asked for dinner, the
  // first live run answered with a reason about starting the day — the meal was
  // in the message and the model read it as a label rather than as a
  // constraint. Both halves are needed: the food has to suit the sitting, and so
  // does the sentence written about it.
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
  // LEAN HEALTHIER, WITHIN THE DISH SOMEBODY WOULD ACTUALLY ORDER. The line
  // being walked here is the one this whole prompt is about: told nothing, it
  // suggests whatever is famous, and told to be healthy it answers with boiled
  // eggs and steamed fish — which is the failure the rule above exists to
  // prevent. So the nudge is a TIE-BREAK between real dishes rather than a
  // filter over them: soto ayam ahead of nasi goreng, ikan bakar ahead of ayam
  // goreng, the soup version of a noodle rather than the fried one. Every pick
  // is still something sold at a stall with a name people order it by.
  'Between dishes that fit equally well, lean towards the healthier one: grilled ' +
  'or steamed or in broth ahead of deep fried, more vegetables and less oil, a ' +
  'lighter version of the same dish where one is genuinely sold. This is a ' +
  'preference between real meals and NEVER a reason to answer with diet food, ' +
  'plain ingredients or anything a person would not order by name. Do not ' +
  'mention health, dieting or clean eating in the reasons; the dish speaks for ' +
  'itself. ' +
  // Likewise the cuisine. Asked for Malay, the same run offered mee goreng mamak
  // and roti canai, which are the neighbouring kitchen.
  'The cuisine you are given is a constraint, not a hint. Every pick belongs to ' +
  'it. Mamak and Malay are DIFFERENT kitchens here: roti canai, mee goreng mamak ' +
  'and nasi kandar are mamak, not Malay. ' +
  // The one thing the model must not do with the numbers it is handed.
  'The calories left, the macros left and what they have eaten are facts you are ' +
  'given. Use them and never restate them as something else. ' +
  // AND THE MACROS ARE BACKGROUND, NOT A SPECIFICATION. This is the failure
  // behind the bare ingredients above and it survived being told not to give
  // them: on a day already over budget, with no carbs and no fat left to spend,
  // the model read the shortfall as a recipe and answered with pure protein —
  // chicken breast, boiled eggs, steamed fish. It was solving the numbers
  // exactly, and a meal solved exactly is not a meal anybody eats.
  'The macros are context for the reasons, not a specification to hit. A day ' +
  'with no carbs left is not a day of eating no carbs: suggest real meals that ' +
  'lean the right way. Never assemble a pick to meet the numbers. ' +
  WHY_RULES +
  ' ' +
  ICON_INSTRUCTION

const CUISINES: Record<Cuisine, string> = {
  malay: 'Malay food',
  mamak: 'mamak food',
  chinese: 'Chinese food, the Malaysian kind',
  // Said as a release rather than as a category, or the model looks for a
  // cuisine literally called "other".
  // Still real food sold somewhere, which is the half that needed saying:
  // released from a cuisine the model reached for diet food rather than for a
  // wider menu.
  others: 'any cuisine at all, whatever fits best, as long as it is a dish people order',
}

const FOCUS: Record<Focus, string> = {
  protein: 'They want it protein heavy.',
  balanced: 'They want it balanced across the macros.',
  carbs: 'They want it carb heavy.',
}

/**
 * The user message: the day, in the fewest facts that decide an answer.
 *
 * Exported for the eval harness, for the reason `describeUserMessage` is.
 *
 * WHAT THEY HAVE ALREADY EATEN is in here and is the least obvious of the
 * facts. Without it the reasons are about a budget and nothing else, and the
 * best line this feature produces is the one that connects the two ends of a
 * day: "only 9 g carbs, so it balances the nasi lemak from breakfast". Names
 * only, and never the figures beside them — the totals are already given as
 * what is left.
 */
/**
 * What they are still short of, or that they are not short of anything.
 *
 * Zeroes are LEFT OUT rather than sent as zeroes. See the note at the call
 * site: a zero in this line is read as a rule about the food rather than as the
 * absence of a shortfall.
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
    // Only the macros they are ACTUALLY short of. Listing all three with zeros
    // in it reads as a specification — "0 g carbs" told the model to suggest
    // food with no carbs in it — where the question was only ever which way to
    // lean.
    macroLine(day),
    day.eaten.length > 0
      ? `Already eaten today: ${day.eaten.slice(0, 8).join(', ')}.`
      : 'They have not eaten anything yet today.',
    // The ask goes LAST. Written first, with the day's figures under it, the
    // sitting read as a label on a report and the model answered a dinner
    // request with a sentence about starting the day. The three constraints are
    // the question; everything above them is the background to it.
    `Suggest ${PICK_COUNT} things to eat.`,
    `It must be ${CUISINES[day.cuisine]}.`,
    FOCUS[day.focus],
    `No pick may be over ${day.kcalLimit} kcal.`,
    // And the SITTING is the very last line, twice stated.
    //
    // Named once at the top it was read as a label; moved into this group it was
    // read as one constraint among four, and "to start your day" still came back
    // on roughly a third of dinners. It is the constraint the model's prior
    // fights hardest, so it gets the last word — which is the position a model
    // weights most — and it is spelled out as a rule about the WORDS rather than
    // only about the food, because the food had already stopped being wrong
    // while the sentences had not.
    `This is for their ${day.meal.toUpperCase()}. Every pick and every reason ` +
      `must belong to that sitting: do not write about starting the day, ` +
      `breakfast, morning or waking up unless the meal is breakfast.`,
  ]
  return lines.join('\n')
}

/**
 * Five things to eat, or an empty list.
 *
 * Empty is a real answer and the endpoint treats it as one — it is what a model
 * that would not answer in the shape asked for comes to, and the screen says
 * "we could not think of anything, try again" rather than showing a broken
 * list. There is no archetype floor here and there should not be: a scan that
 * falls back to "Mixed meal" is still telling somebody what they ate, while a
 * suggestion that falls back to a generic is telling them nothing.
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
    // Five picks with eight fields and three reasons each. Truncated JSON does
    // not parse, and a parse failure here costs the whole suggestion.
    2200,
  )
  return shapePicks(raw, day.meal)
}

/**
 * What a local stack answers with.
 *
 * Real dishes with real-ish figures rather than "Mock dish 1", because the
 * thing being exercised locally is the SCREEN — five rows, a macro panel, three
 * reasons and an icon — and lorem ipsum draws a layout nobody can judge.
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
]
