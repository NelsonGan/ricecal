/**
 * Repoints a catalogue row whose default portion is a unit of measure.
 *
 *   pnpm foods:servings            say what is wrong, change nothing
 *   pnpm foods:servings --apply    repoint the defaults
 *   pnpm foods:servings --limit=20 look at a sample first
 *
 * `food.kcal` is per one serving, and which serving that is comes from
 * `food_serving.is_default`. On a few hundred imported rows the flag is on a
 * unit of measure rather than on a portion: "Coffee, Iced Latte" is published by
 * the fluid ounce, so the catalogue says a latte is 30 g and 8 kcal, and the
 * "1 cup (8 fl oz)" the same row already carries sits beside it at factor 8.
 *
 * That is wrong twice over. The app shows "8 kcal · 1 fl oz" to anybody who
 * searches for the drink, and the scan cascade divides the weight it measured by
 * 30 g and gets eleven servings of a latte. `measuredQuantity` in
 * `_shared/cascade.ts` now prices that honestly instead of capping it at three,
 * so the calories come out right either way; this is what stops the entry ALSO
 * reading "x11.75" for one glass of coffee.
 *
 * The distinction between a portion and a measurement is not re-derived here.
 * `namesAPortion` in `functions/_shared/portion.ts` already draws it, the
 * cascade already sizes plates by it, and a second copy that folded "1 cup (8 fl
 * oz)" the other way would repoint exactly the rows that were already right.
 *
 * NOT durable against a reload. The rows this fixes come from the bulk USDA
 * import, which lives outside this repo, so a rebuild of the catalogue brings
 * the shape back. That is what makes this a re-runnable script rather than a
 * one-off migration: run it after a load, the way `foods:reindex` is run.
 */

import { namesAPortion } from '../functions/_shared/portion.ts'
import { d1, d1batch, n, q } from './lib/d1.mjs'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0)

/**
 * A USDA placeholder, not a portion anybody was served. It passes
 * `namesAPortion` on the letter of the rule (it is words rather than a
 * measurement) and would then be picked as a default over the "1 cup" beside it,
 * which is how a rule about labels becomes a wrong number.
 */
const PLACEHOLDER = /^\s*quantity not specified\s*$/i

/**
 * One fluid ounce, which is the unit a table is published in and never a serving
 * of anything. Thirty millilitres is a splash; the row it labels is a drink.
 *
 * NARROWER than "the default is a measurement", and the first draft of this
 * script was that broader rule. It proposed 2,004 rows, and most of them were
 * fine: USDA states a cut of meat in "3.0 oz" and a snack in "1.0 oz", both of
 * which are real helpings, and the only other portion those rows carry is the
 * whole article. Repointing them would have moved a roast beef from 188 kcal to
 * "1.0 roast (yield from 714 g raw meat)" at 1,307, which is a worse answer than
 * the one being fixed and would have reached every diary that searched for it.
 *
 * So this fixes the case that is wrong by construction rather than every case
 * that is merely stated in units. An ounce by weight is left alone, and so is a
 * larger volume: "8.0 fl oz" is 240 g and is what one drink is.
 */
const ONE_FLUID_OUNCE = /^\s*1(?:\.0+)?\s*fl\s*oz\s*$/i

/**
 * The liquids that are POURED INTO a drink rather than drunk, where a fluid
 * ounce really is about one serving and a cup would be a worse default than the
 * measurement it replaced.
 *
 * Seven rows out of 461, and worth naming individually rather than reaching for
 * a word like "cream": half this catalogue's frozen coffee drinks are "with
 * whipped cream" and every one of them is a drink. Evaporated milk is the one
 * that has to be right, because it is what goes in kopi, and 42 kcal a fluid
 * ounce becoming 336 a cup would follow it into a diary.
 */
const POURED = /^(cream,|cream substitute|milk, canned)/i

/**
 * A concentrate, which is diluted before anybody drinks it. The portion beside
 * the fluid ounce is the whole tin it comes in: repointing "Cranberry juice
 * cocktail, frozen concentrate" would have made its default a 435 g can at 877
 * kcal, which is a true statement about the tin and a wrong answer about a
 * drink. Neither serving is a helping of anything, so the row is left as it is.
 *
 * "Prepared with water" is the diluted twin of the same row and IS a drink, so
 * it stays in.
 */
const CONCENTRATE = (name) => /concentrat/i.test(name) && !/prepared/i.test(name)

/** The columns that are per one serving, and so move with the default. */
const SCALED = ['kcal', 'carbs_g', 'protein_g', 'fat_g', 'fibre_g', 'sugar_g', 'sodium_mg']
const INTEGER = new Set(['kcal', 'sodium_mg'])

const scale = (value, by, column) => {
  if (value === null || value === undefined) return null
  const scaled = Number(value) * by
  return INTEGER.has(column) ? Math.round(scaled) : Math.round(scaled * 100) / 100
}

/** `where id in (...)` for more ids than D1 will bind in one statement. */
async function inChunks(sql, ids, size = 80) {
  const out = []
  for (let i = 0; i < ids.length; i += size) {
    const slice = ids.slice(i, i + size).map((id) => q(id))
    out.push(...(await d1(sql.replace('@ids', slice.join(',')))))
  }
  return out
}

/**
 * The portion to make default, or null to leave the row alone.
 *
 * The smallest portion that weighs more than the measurement currently in the
 * flag: "1 cup (8 fl oz)" at 248 g over the "1 small" at 372 g, because one
 * serving of a drink is a cup of it and the sizes above it are how many cups.
 */
function target(servings, current) {
  const candidates = servings.filter(
    (s) =>
      s.slug !== current.slug &&
      namesAPortion(s.label) &&
      !PLACEHOLDER.test(s.label) &&
      Number(s.factor) > 0 &&
      s.grams !== null &&
      Number(s.grams) > Number(current.grams ?? 0),
  )
  candidates.sort((a, b) => Number(a.grams) - Number(b.grams))
  return candidates[0] ?? null
}

// Every default, which is one row per food and small enough to bring back whole.
// Everything else is fetched only for the rows that turn out to be wrong.
const defaults = await d1(
  `select s.food_id, s.slug, s.label, s.grams from food_serving s where s.is_default = 1`,
)
const suspect = defaults.filter((d) => !namesAPortion(d.label) && ONE_FLUID_OUNCE.test(d.label))
console.log(
  `${defaults.length} rows with a default portion, ` +
    `${suspect.length} of them stated as one fluid ounce`,
)
if (!suspect.length) process.exit(0)

const ids = suspect.map((s) => s.food_id)

const servings = new Map()
for (const row of await inChunks(
  'select food_id, slug, label, factor, grams from food_serving where food_id in (@ids)',
  ids,
)) {
  if (!servings.has(row.food_id)) servings.set(row.food_id, [])
  servings.get(row.food_id).push(row)
}

const foods = new Map(
  (
    await inChunks(`select id, name, place, ${SCALED.join(', ')} from food where id in (@ids)`, ids)
  ).map((f) => [f.id, f]),
)

const statements = []
const changes = []

for (const current of suspect) {
  if (limit && changes.length >= limit) break

  const list = servings.get(current.food_id) ?? []
  const food = foods.get(current.food_id)
  const chosen = target(list, current)
  // No portion to move to. A row published only in fluid ounces is stating the
  // truth about itself, and inventing a cup for it would be worse than leaving
  // the measurement where it is.
  if (!food || !chosen) continue
  // Not a drink as the row sells it: see POURED and CONCENTRATE.
  if (POURED.test(food.name) || CONCENTRATE(food.name)) continue

  const by = Number(chosen.factor)
  changes.push({
    name: food.name,
    place: food.place,
    from: `${current.label}, ${current.grams ?? '?'} g, ${food.kcal} kcal`,
    to: `${chosen.label}, ${chosen.grams} g, ${scale(food.kcal, by, 'kcal')} kcal`,
  })

  const sets = SCALED.map((c) => `${c} = ${n(scale(food[c], by, c))}`).join(', ')
  statements.push(`update food set ${sets} where id = ${q(current.food_id)}`)

  // Every portion's factor is relative to the default, so all of them move.
  // Computed literals rather than `factor / by` in SQL, so the arithmetic is in
  // one place and a re-run cannot compound it.
  for (const s of list) {
    statements.push(
      `update food_serving set factor = ${n(Math.round((Number(s.factor) / by) * 1e6) / 1e6)}, ` +
        `is_default = ${s.slug === chosen.slug ? 1 : 0} ` +
        `where food_id = ${q(current.food_id)} and slug = ${q(s.slug)}`,
    )
  }
}

const byPlace = {}
for (const c of changes) byPlace[c.place] = (byPlace[c.place] ?? 0) + 1
console.log(`\n${changes.length} rows to repoint  ${JSON.stringify(byPlace)}\n`)
for (const c of changes.slice(0, 25)) console.log(`  ${c.name}\n    ${c.from}  →  ${c.to}`)
if (changes.length > 25) console.log(`  ... and ${changes.length - 25} more`)

if (!apply) {
  console.log(`\nDry run. ${statements.length} statements withheld; pass --apply to run them.`)
  process.exit(0)
}

const done = await d1batch(statements, {
  onProgress: (d, total) => process.stdout.write(`\r  ${d}/${total} statements`),
})
console.log(`\napplied ${done} statements over ${changes.length} rows`)
