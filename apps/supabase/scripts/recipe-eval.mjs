/**
 * Grades the recipe reader against the deployed stack.
 *
 *   pnpm eval:recipe                    every case
 *   pnpm eval:recipe --grep=rendang     cases whose name matches
 *   pnpm eval:recipe --repeat=3         score the pass RATE, not one sample
 *   pnpm eval:recipe --show             print the full draft for every case
 *   pnpm eval:recipe --save out.json
 *
 * The sibling of `eval:scan`, for the other model path in this app. A recipe is
 * graded differently from a meal because it is a different kind of answer: a
 * scanned meal is a number, and a recipe is a NUMBER AND A SET OF INSTRUCTIONS
 * somebody is going to stand at a stove and follow. So the checks come in two
 * halves.
 *
 * THE ARITHMETIC, which is what the app is for. Every ingredient is priced for
 * the whole pot, so the pot's calories divided by its servings has to land
 * somewhere a person would recognise, and the macros have to agree with the
 * calories the way they do in any composition table.
 *
 * THE WRITING, which is what the cook reads. Measured against how recipes are
 * actually written — one action per step, imperative, in order, times and
 * temperatures where they matter, a doneness cue so the cook knows when to move
 * on. Those are checkable: a step that starts with a verb, a line that is one
 * sentence, a `\n` between them, no numbering because the app draws the
 * numerals itself.
 *
 * What cannot be checked mechanically is whether the method is RIGHT, so the
 * cases carry `must_mention` — the few things a person who has cooked the dish
 * would notice missing. A rendang that never reduces, a carbonara with cream in
 * it, a nasi lemak whose rice never meets coconut milk.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import * as live from './lib/live.mjs'

const CASES_FILE = fileURLToPath(new URL('./recipe-eval.cases.json', import.meta.url))

const args = process.argv.slice(2)
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=')
const has = (name) => args.includes(`--${name}`)

const grep = flag('grep')
const repeat = Math.max(1, Number(flag('repeat') ?? 1))
const show = has('show')
const savePath = flag('save')

const norm = (s) => String(s ?? '').toLowerCase()

/**
 * Words that begin an instruction.
 *
 * Not an exhaustive verb list — it does not have to be. The failure this
 * catches is a step written as prose ("The rempah is then fried until…", "Once
 * the oil separates…"), and prose reliably starts with something that is not a
 * cooking verb.
 */
const VERBS = new Set([
  'add',
  'arrange',
  'assemble',
  'bake',
  'blanch',
  'blend',
  'boil',
  'bring',
  'brown',
  'brush',
  'chop',
  'coat',
  'combine',
  'cook',
  'cool',
  'cover',
  'crush',
  'cut',
  'deep',
  'dice',
  'drain',
  'drizzle',
  'dry',
  'fill',
  'finish',
  'flip',
  'fold',
  'fry',
  'garnish',
  'grate',
  'grill',
  'grind',
  'heat',
  'knead',
  'ladle',
  'layer',
  'leave',
  'let',
  'lower',
  'marinate',
  'mash',
  'melt',
  'mix',
  'peel',
  'place',
  'pound',
  'pour',
  'preheat',
  'prepare',
  'press',
  'put',
  'reduce',
  'remove',
  'repeat',
  'rest',
  'return',
  'rinse',
  'roast',
  'roll',
  'rub',
  'saute',
  'sauté',
  'scatter',
  'season',
  'serve',
  'set',
  'simmer',
  'skim',
  'slice',
  'soak',
  'spoon',
  'spread',
  'sprinkle',
  'steam',
  'stir',
  'strain',
  'sweat',
  'take',
  'taste',
  'toast',
  'top',
  'toss',
  'transfer',
  'turn',
  'warm',
  'wash',
  'whisk',
  'wrap',
  'crack',
  'discard',
  'divide',
  'dust',
  'grease',
  'line',
  'pat',
  'reserve',
  'scramble',
  'shred',
  'skewer',
  'squeeze',
  'stack',
  'stuff',
  'thicken',
  'tip',
  'whip',
  'zest',
  'adjust',
  'sift',
  'check',
  'deglaze',
  'nestle',
  'scoop',
  'seal',
  'trim',
  'beat',
  'push',
  'crumble',
  'sear',
  'submerge',
  'swirl',
  'tilt',
  'unwrap',
  'weigh',
])

/**
 * Things a step can name that have to be in the ingredient list.
 *
 * The prompt already states this rule — "everything your steps name has to
 * appear in the list" — and it is the one the drafts break most often, because
 * it competes with an instruction not to pad the list with seasonings. What
 * comes back is a rendang whose first step fries a rempah the list never
 * mentions, a bak kut teh seasoned with salt and pepper it does not contain,
 * and a banana bread folding in baking soda that is not there.
 *
 * It matters twice over. A cook cannot follow a method whose ingredients are
 * missing, and half of these carry real calories — a rempah is chillies,
 * shallots and the oil they are fried in.
 *
 * Deliberately a short curated list rather than a parser. These are the words
 * that actually go missing; a general noun extractor would flag "heat" and
 * "pan".
 */
const NAMEABLE = [
  'salt',
  'pepper',
  'sugar',
  'soy sauce',
  'fish sauce',
  'oyster sauce',
  'vinegar',
  'tamarind',
  'belacan',
  'shrimp paste',
  'wine',
  'garlic',
  'onion',
  'shallot',
  'ginger',
  'galangal',
  'lemongrass',
  'turmeric',
  'vanilla',
  'baking soda',
  'baking powder',
  'flour',
  'butter',
  'cheese',
  'egg',
  'potato',
  'tomato',
  'carrot',
]

/**
 * Names for one thing, so a synonym is not reported as an omission.
 *
 * A recipe that lists Spaghetti and then says "drain the pasta" is right, and so
 * is one that lists Chicken thigh and says "add the chicken".
 */
const SAME_THING = {
  pasta: ['spaghetti', 'noodle', 'macaroni', 'penne'],
  chilli: ['chili', 'chile'],
  chili: ['chilli', 'chile'],
  aubergine: ['eggplant', 'terung'],
  cheese: ['parmesan', 'pecorino', 'cheddar', 'mozzarella', 'feta'],
  sugar: ['palm sugar', 'gula melaka', 'brown sugar'],
}

/** A cue that tells the cook when a step is finished. */
const DONENESS =
  // "for another ten minutes" and "for 20 minutes" are both times. The words
  // between "for" and the unit are why this is a span rather than a digit.
  /\b(until|for [\w ]{0,14}(minutes?|hours?|mins?|seconds?)|\d+ ?(minutes?|hours?|mins?)|degrees|°c|°f|golden|crisp\w*|tender|softened|thickened|reduced|separates?|fragrant|browned)\b/i

/**
 * Steps that put food over heat, which are the ones that need a cue.
 *
 * Requiring every step to say when it is done was the wrong bar and it fired on
 * good recipes: "Add the beef and stir to coat" and "Pour in the coconut milk"
 * are complete instructions with nothing to wait for. What a cook cannot do
 * without is knowing when to STOP — how long to fry the rempah, how long to
 * simmer the pot — so the cue is required exactly where time passes.
 */
const HEAT =
  /^(fry|deep|sauté|saute|simmer|boil|bake|roast|grill|steam|cook|sear|braise|poach|stew)/i

/**
 * Verbs that ARE their own cue.
 *
 * "Brown the lamb" and "Caramelise the onions" name the end state in the
 * instruction: the cook stops when the thing is brown. Asking for a further
 * "until browned" is asking them to write "brown until browned".
 */
const SELF_CUEING = /^(brown|caramelis|caramaliz|reduce|thicken|crisp|toast|blanch|melt)/i

function gradeWriting(draft, kase, problems) {
  const lines = String(draft.steps ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (!lines.length) {
    problems.push('no steps at all')
    return lines
  }

  const [lo, hi] = kase.steps ?? [3, 10]
  if (lines.length < lo || lines.length > hi) {
    problems.push(`${lines.length} steps, wanted ${lo}-${hi}`)
  }

  for (const [i, line] of lines.entries()) {
    // A leading clause is ordinary recipe English — "While the rice cooks, fry
    // the anchovies", "In the same oil, stir-fry the shallots", "Meanwhile,
    // whisk the eggs". The instruction is still one action; the verb has simply
    // moved past a comma. So the check is that a step CONTAINS an imperative at
    // the head of a clause, not that it opens with one.
    // Adverbs come before the verb and do not change the mood: "Gradually whisk
    // in the milk" is as imperative as "Whisk in the milk".
    const ADVERB =
      /^(gradually|slowly|carefully|gently|quickly|evenly|lightly|thoroughly|meanwhile|finally|immediately|then|next|now|first|once|again|repeatedly|firmly)\s+/
    const heads = norm(line)
      .split(/,\s*/)
      .map(
        (clause) =>
          clause
            .replace(/[^a-zà-ÿ]/g, ' ')
            .trim()
            .replace(ADVERB, '')
            .split(' ')[0],
      )
    if (!heads.some((h) => VERBS.has(h))) {
      problems.push(`step ${i + 1} does not start with a verb: "${line}"`)
    }
    // The app draws the numerals, so a numbered line renders "1. 1. Rinse…".
    if (/^\s*(\d+[.)]|[-*•])/.test(line)) problems.push(`step ${i + 1} is numbered or bulleted`)
    if (/[—–]/.test(line)) problems.push(`step ${i + 1} has a long dash in it`)
    // Two sentences in one line is the "one action per step" rule breaking.
    // A trailing full stop is not a split, and neither is a decimal.
    const sentences = line.replace(/\.\s*$/, '').split(/\.\s+(?=[A-Z])/).length
    if (sentences > 2) problems.push(`step ${i + 1} runs ${sentences} sentences together`)
  }

  // A step that cooks has to say when it is done. Everything else may not need
  // one — pouring, adding and stirring have nothing to wait for.
  for (const [i, line] of lines.entries()) {
    // Boiling water is done when it boils; there is nothing for a cue to add.
    // `[\s\S]*` rather than `[^.]*` because "1.2 litres of water" has a full
    // stop in it and the tighter pattern never matched the case it was for.
    const boilingWater = /^boil\b[\s\S]*\bwater\b/i.test(line.trim())
    const step = line.trim()
    if (HEAT.test(step) && !SELF_CUEING.test(step) && !DONENESS.test(line) && !boilingWater) {
      problems.push(`step ${i + 1} cooks but never says when it is done: "${line}"`)
    }
  }

  return lines
}

function gradeArithmetic(draft, kase, problems) {
  const ingredients = draft.ingredients ?? []
  if (!ingredients.length) {
    problems.push('no ingredients')
    return
  }

  const [iLo, iHi] = kase.ingredients ?? [4, 16]
  if (ingredients.length < iLo || ingredients.length > iHi) {
    problems.push(`${ingredients.length} ingredients, wanted ${iLo}-${iHi}`)
  }

  // The rows come back PER UNIT, which is what `recipe_ingredients` stores.
  const total = ingredients.reduce(
    (sum, i) => ({
      kcal: sum.kcal + Number(i.kcal_per_unit) * Number(i.amount),
      carbs: sum.carbs + Number(i.carbs_per_unit) * Number(i.amount),
      protein: sum.protein + Number(i.protein_per_unit) * Number(i.amount),
      fat: sum.fat + Number(i.fat_per_unit) * Number(i.amount),
    }),
    { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  )

  const servings = Number(draft.servings) || 1
  const perServing = Math.round(total.kcal / servings)
  const [sLo, sHi] = kase.per_serving
  if (!(perServing >= sLo && perServing <= sHi)) {
    problems.push(`${perServing} kcal a serving, wanted ${sLo}-${sHi}`)
  }

  if (kase.servings) {
    const [vLo, vHi] = kase.servings
    if (!(servings >= vLo && servings <= vHi)) {
      problems.push(`serves ${servings}, wanted ${vLo}-${vHi}`)
    }
  }

  // Atwater over the whole pot: the same 25% the catalogue importer and the
  // scan cascade hold their own figures to.
  if (total.kcal > 0) {
    const atwater = total.carbs * 4 + total.protein * 4 + total.fat * 9
    const drift = Math.abs(atwater - total.kcal) / total.kcal
    if (drift > 0.25) {
      problems.push(
        `macros imply ${Math.round(atwater)} kcal, the pot says ${Math.round(total.kcal)} ` +
          `(${Math.round(drift * 100)}% apart)`,
      )
    }
  }

  return { total, perServing }
}

async function runOne(kase) {
  const started = Date.now()
  const res = await live.readRecipe(kase.text)
  const result = { name: kase.name, ms: Date.now() - started, status: res.status, problems: [] }

  if (!res.body?.ok) {
    result.problems.push(`read failed: ${res.body?.error ?? res.status}`)
    return result
  }

  if (res.body.food === false) {
    result.noFood = true
    if (!kase.expect_no_food) result.problems.push('answered "nothing cookable here" for a dish')
    return result
  }
  if (kase.expect_no_food) result.problems.push('wrote a recipe for something that is not a dish')

  const draft = res.body.draft
  result.name_out = draft.name
  result.servings = draft.servings
  result.icon = draft.icon_name

  for (const want of kase.name_has ?? []) {
    if (!norm(draft.name).includes(norm(want))) {
      result.problems.push(`name "${draft.name}" lacks "${want}"`)
    }
  }
  for (const avoid of kase.name_lacks ?? []) {
    if (norm(draft.name).includes(norm(avoid))) {
      result.problems.push(`name "${draft.name}" contains "${avoid}"`)
    }
  }

  const sums = gradeArithmetic(draft, kase, result.problems)
  const lines = gradeWriting(draft, kase, result.problems)

  result.perServing = sums?.perServing ?? null
  result.totalKcal = sums ? Math.round(sums.total.kcal) : null
  result.ingredients = (draft.ingredients ?? []).map(
    (i) => `${i.name} ${i.amount}${i.unit === 'piece' ? '' : i.unit}`,
  )
  result.steps = lines

  const listed = norm((draft.ingredients ?? []).map((i) => i.name).join(' | '))
  const said = `${listed} || ${norm(lines.join(' '))}`
  for (const want of kase.must_mention ?? []) {
    // A `|` separates spellings of one thing, not two requirements: a moussaka
    // is right whether its vegetable is called aubergine, eggplant or terung.
    if (!want.split('|').some((form) => said.includes(norm(form)))) {
      result.problems.push(`nothing about "${want}"`)
    }
  }
  for (const avoid of kase.must_not ?? []) {
    if (listed.includes(norm(avoid)))
      result.problems.push(`"${avoid}" does not belong in this dish`)
  }

  // The prompt's own rule, checked: a step that names an ingredient the list
  // does not have describes a different pot.
  const stepText = norm(lines.join(' '))
  const missing = NAMEABLE.filter(
    (word) =>
      // Word boundaries, or "cream" matches "creamy sauce" and a correct
      // carbonara is reported as containing cream.
      new RegExp(`\\b${word}s?\\b`).test(stepText) &&
      !new RegExp(`\\b${word}`).test(listed) &&
      !(SAME_THING[word] ?? []).some((alt) => listed.includes(alt)),
  )
  if (missing.length) {
    result.problems.push(`steps name what the list does not have: ${missing.join(', ')}`)
  }

  // A pot whose steps fry and whose list has no fat in it is understating the
  // meal by a few hundred calories — the check the prompt asks the model to run
  // on itself. Meat that renders its own fat is the honest exception: a
  // carbonara does not add oil to pancetta, and flagging it taught nothing.
  const rendersFat =
    /\b(pancetta|bacon|lardon|guanciale|sausage|chorizo|lap cheong|pork belly|duck|skin)\b/i
  if (/\b(fry|fried|frying|sauté|saute|sear)\b/i.test(lines.join(' '))) {
    if (
      !/\b(oil|butter|ghee|margarine|lard|fat|santan|coconut milk)\b/i.test(listed) &&
      !rendersFat.test(listed)
    ) {
      result.problems.push('the steps fry something and the list has no cooking fat in it')
    }
  }

  return result
}

const all = JSON.parse(await readFile(CASES_FILE, 'utf8'))
const cases = all.filter((k) => !grep || k.name.toLowerCase().includes(grep.toLowerCase()))
if (!cases.length) {
  console.error('no cases matched')
  process.exit(1)
}

console.log(`${cases.length} cases${repeat > 1 ? ` x ${repeat}` : ''}\n`)
const results = []
let passes = 0
let attempts = 0

for (const kase of cases) {
  const runs = []
  for (let n = 0; n < repeat; n++) {
    try {
      runs.push(await runOne(kase))
    } catch (error) {
      runs.push({ name: kase.name, problems: [`threw: ${error.message}`] })
    }
  }
  results.push(...runs)

  const ok = runs.filter((r) => !r.problems?.length).length
  passes += ok
  attempts += runs.length
  console.log(
    `${ok === runs.length ? '✓' : ok === 0 ? '✗' : '~'} ${kase.name}` +
      `${repeat > 1 ? `   [${ok}/${runs.length}]` : ''}`,
  )

  for (const r of runs) {
    console.log(
      `    ${r.noFood ? 'nothing cookable' : `${r.name_out} · serves ${r.servings} · ${r.perServing} kcal each (${r.totalKcal} in the pot)`}  (${r.ms} ms)`,
    )
    if (show && r.ingredients) console.log(`    ${r.ingredients.join(', ')}`)
    if (show && r.steps) for (const [i, s] of r.steps.entries()) console.log(`      ${i + 1}. ${s}`)
    for (const p of r.problems ?? []) console.log(`    ! ${p}`)
  }
}

console.log(`\n${passes}/${attempts} passed`)
if (savePath) {
  await writeFile(savePath, `${JSON.stringify(results, null, 2)}\n`)
  console.log(`wrote ${savePath}`)
}
process.exit(passes === attempts ? 0 : 1)
