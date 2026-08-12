/**
 * A researched dish, checked and turned into the row the catalogue wants.
 *
 * This is the half of the old `import-foods.mjs` worth keeping. The other half
 * called `public.import_foods`, a Postgres function that did the dedup and the
 * write inside one statement; the catalogue is in D1 now and that function is
 * gone, so the write lives in `catalogue-import.mjs` and the SHAPE lives here.
 *
 * Splitting them was not just tidiness. The checks below are the ones no
 * database can make — a name with no ASCII in it has no slug, an icon naming a
 * drawing nobody drew renders as a blank square, calories that disagree with
 * their own macros are a number somebody will diet against, and 160 g of
 * macronutrient does not fit in a 140 g packet. They are worth being able to
 * run against a payload without a database at all, which is what a research
 * agent wants: `--dry-run` should be able to say "this file is wrong" offline.
 *
 * INPUT
 *
 * A JSON array of dishes, or an object with a `foods` array and an optional
 * `source` and `source_id` every dish in the file inherits. One dish:
 *
 *   {
 *     "name":      "Nasi Lemak Ayam Goreng",   // required, the local spelling
 *     "place":     "hawker",                   // mamak|kopitiam|hawker|home|packaged
 *     "serving":   "1 plate (350 g)",          // required, what one of it is
 *     "kcal":      644,                        // required, for ONE serving
 *     "carbs_g":   80.2,
 *     "protein_g": 26.4,
 *     "fat_g":     25.9,
 *     "fibre_g":   4.1,                        // optional; omit rather than guess
 *     "sugar_g":   6.2,                        // optional
 *     "sodium_mg": 1120,                       // optional
 *     "aliases":   ["nasi lemak ayam", "椰漿飯炸雞"],
 *     "brand":     "OldTown",                  // only for a chain's own item
 *     "icon":      "dishes/nasi-lemak",        // optional, must be a real drawing
 *     "source":    "myfcd_current",            // where the numbers came from
 *     "verified":  false,                      // true only for a published figure
 *     "extra_servings": [{ "label": "Half plate", "factor": 0.5 }]
 *   }
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { normalize } from '../../../catalogue-worker/src/text.ts'

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))
const ICON_ROOT = `${REPO_ROOT}apps/mobile/assets/icons`

const PLACES = new Set(['mamak', 'kopitiam', 'hawker', 'packaged', 'home'])

/**
 * The weight a serving label states, when it states one.
 *
 * `food_servings.grams` is what the scan cascade bounds a portion against, and a
 * researched payload writes its portion in words — "1 plate (350 g)", "100 g",
 * "1 glass (250 ml)". Reading the number out of the label here is what turns
 * those into a column, and it is the same three shapes and the same convention
 * (millilitres as grams) that `servingGrams` in `functions/_shared/portion.ts`
 * applies as a FALLBACK for rows that never had the column. Deliberately the
 * same, deliberately not shared: one is Deno inside an edge function and one is
 * Node beside the payloads, and the day they disagree is the day a portion is
 * priced two ways.
 *
 * Cups and spoons are not read, for the reason set out at length there: a cup of
 * rice is 200 g and a cup of cornflakes is 30 g, and null is the honest answer.
 */
function labelGrams(label) {
  const text = String(label ?? '').trim()
  if (!text) return null

  const scale = { g: 1, gm: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, oz: 28.35, lb: 453.6 }
  const unit = (u) => scale[u.toLowerCase()] ?? 0

  // "1 bowl (400 g)" — the parenthesised weight is the whole answer, and it wins
  // over the leading count, which is a bowl and not a number of grams.
  const paren = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|kg|ml|l)\s*\)/i)
  if (paren) return usable(Number(paren[1]) * unit(paren[2]))

  const plain = text.match(/^\s*(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|kg|ml|l|oz|lb)\b/i)
  if (plain) return usable(Number(plain[1]) * unit(plain[2]))

  return null
}

function usable(grams) {
  return Number.isFinite(grams) && grams > 0 && grams <= 100000 ? round2(grams) : null
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

/**
 * Kebab-case, and ASCII only: `foods.slug` is checked against
 * `^[a-z0-9]+(-[a-z0-9]+)*$`, so a name that is entirely Chinese has no slug of
 * its own and falls back to a transliteration the caller supplied or, failing
 * that, is rejected upstream with a reason.
 */
function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '')
}

let iconIndex
function icons() {
  iconIndex ??= new Map(
    readdirSync(ICON_ROOT).map((set) => [
      set,
      new Set(
        readdirSync(`${ICON_ROOT}/${set}`)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.replace(/\.png$/, '')),
      ),
    ]),
  )
  return iconIndex
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * One researched dish to one loader row, or to a rejection with a reason.
 *
 * The rejections here are the ones a database cannot make: a name with no
 * ASCII in it has no slug, an icon that names a drawing nobody drew renders as
 * a blank square, and calories that do not match their own macros are a number
 * somebody will diet against. D1 has no constraints to speak of, so unlike the
 * Postgres loader this is the only gate a row passes through — which is an
 * argument for reading the rejections, not for adding more of them here.
 */
function shape(raw, fileSource, fileSourceId) {
  const reject = (reason) => ({ ok: false, reason, name: raw?.name ?? '(unnamed)' })

  if (!raw || typeof raw !== 'object') return reject('not an object')

  const name = String(raw.name ?? '').trim()
  if (!name) return reject('no name')

  const brand = raw.brand ? String(raw.brand).trim() : null
  const place = String(raw.place ?? 'hawker').trim()
  if (!PLACES.has(place)) return reject(`place "${place}" is not a food_place`)

  const serving = String(raw.serving ?? raw.serving_label ?? '').trim()
  if (!serving) return reject('no serving: say what one of it is ("1 plate", "3 pieces")')
  if (serving.length > 40) return reject(`serving label longer than 40 characters: "${serving}"`)

  const kcal = num(raw.kcal)
  if (kcal === null || !Number.isFinite(kcal)) return reject('no kcal')
  if (kcal < 0 || kcal > 10000) return reject(`kcal ${kcal} outside 0..10000`)

  const carbs = num(raw.carbs_g) ?? 0
  const protein = num(raw.protein_g) ?? 0
  const fat = num(raw.fat_g) ?? 0
  if ([carbs, protein, fat].some((v) => !Number.isFinite(v) || v < 0)) {
    return reject('a macro is missing, negative or not a number')
  }

  // The one check with teeth. 4/4/9 is arithmetic, not an opinion, and a row
  // whose macros disagree with its own calorie figure by more than a quarter
  // was transcribed from two different sources or invented in two passes. The
  // scan cascade rejects its own estimates on exactly this margin
  // (functions/_shared/cascade.ts), so a catalogue row held to a looser
  // standard than a guess would be the wrong way round.
  if (kcal > 0) {
    const atwater = carbs * 4 + protein * 4 + fat * 9
    const drift = Math.abs(atwater - kcal) / kcal
    if (drift > 0.25) {
      return reject(
        `macros imply ${Math.round(atwater)} kcal but the row says ${Math.round(kcal)} ` +
          `(${Math.round(drift * 100)}% apart)`,
      )
    }
  }

  // The check Atwater cannot make, and the reason it is here.
  //
  // 4/4/9 compares a row against ITSELF, so it passes any panel whose carbohydrate
  // was inflated in step with its energy. An Open Food Facts record for a 140 g
  // pack of Samyang declared 119 g carbohydrate, 13 g protein and 28 g fat —
  // self-consistent to 2.3%, and 160 g of macronutrient inside a 140 g pack.
  // Conservation of mass is the only thing that sees it.
  //
  // Only usable when the serving names a weight, which is exactly where it is
  // needed: a "1 plate" row has no mass to check against, and a packaged row
  // read off a panel almost always does. A little slack, because a label rounds
  // and water and ash are not free.
  const grams = serving.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  if (grams) {
    const mass = Number(grams[1])
    const macros = carbs + protein + fat
    if (mass > 0 && macros > mass * 1.05) {
      return reject(`${Math.round(macros)} g of carbs, protein and fat in a ${mass} g serving`)
    }
  }

  // Prefixed with the brand only when the name does not already carry it, which
  // is the same rule the database applies to `name_norm` — otherwise a chain
  // item lands at `mcdonalds-mcdonalds-filet-o-fish`.
  const nameNorm = normalize(name)
  const brandNorm = normalize(brand ?? '')
  const slugSource =
    raw.slug ?? (brandNorm && !nameNorm.startsWith(brandNorm) ? `${brand} ${name}` : name)
  const slug = slugify(slugSource)
  if (!slug) return reject(`no ASCII in "${name}": give an explicit "slug"`)

  let iconSet = null
  let iconName = null
  if (raw.icon) {
    const [set, ...rest] = String(raw.icon).split('/')
    const drawing = rest.join('/')
    if (!icons().get(set)?.has(drawing)) {
      // Not fatal. A wrong icon name is a research slip on an optional field,
      // and dropping the whole dish over a drawing would be a poor trade — but
      // silently keeping it would put a blank square on the row, which is the
      // failure `foods.icon_set` was made nullable to avoid.
      return {
        ...shape({ ...raw, icon: null }, fileSource, fileSourceId),
        name,
        warning: `no icon "${raw.icon}" — imported without one`,
      }
    }
    iconSet = set
    iconName = drawing
  }

  const servings = [
    {
      slug: 'base',
      label: serving,
      factor: 1,
      grams: labelGrams(serving),
      is_default: true,
      position: 0,
    },
    ...(raw.extra_servings ?? []).map((s, i) => {
      const factor = num(s.factor)
      const label = String(s.label ?? '').trim()
      // Its own weight if the label states one, otherwise the base's weight
      // scaled by the factor — which is what a factor MEANS. Null only when the
      // base had none either.
      const base = labelGrams(serving)
      return {
        slug: slugify(s.slug ?? s.label) || `alt-${i + 1}`,
        label,
        factor,
        grams: labelGrams(label) ?? (base !== null && factor ? round2(base * factor) : null),
        is_default: false,
        position: i + 1,
      }
    }),
  ]

  return {
    ok: true,
    row: {
      slug,
      name,
      brand,
      icon_set: iconSet,
      icon_name: iconName,
      place,
      kcal,
      carbs_g: carbs,
      protein_g: protein,
      fat_g: fat,
      fibre_g: num(raw.fibre_g),
      sugar_g: num(raw.sugar_g),
      sodium_mg: num(raw.sodium_mg),
      // Defaults to false, and that is not modesty: `verified` is the flag a
      // review queue sorts on, so a researched estimate claiming it would hide
      // itself from the only process that would ever check it.
      verified: raw.verified === true,
      // Both halves, when there are two. The row's own source says where the
      // NUMBER came from — a citation, which is what the column is for — and
      // the file's says which research round wrote it down. Keeping only the
      // first loses the round, and 223 rows all reading "model_estimate" with
      // no way back to the payload that produced them is not an audit trail.
      // Keeping only the second loses the citation, which is worse.
      source: [raw.source, fileSource].filter(Boolean).join(' · ') || 'research',
      // The registry key, which decides how the row is attributed and how it
      // ranks — see SOURCES in `catalogue-import.mjs`. Distinct from `source`
      // above: that names where the FIGURE came from, a citation, and this
      // names who wrote the row down.
      //
      // A payload may declare one for the whole file (`"source_id":
      // "chain_menu_my"`), because a round of chain menus is not the same kind
      // of row as a round of researched dishes and should not rank as one.
      // Researched is the default because it is the weakest honest claim.
      source_id: fileSourceId ?? 'research',
      name_norm: nameNorm,
      // Rows of their own, which is what makes a second romanization findable.
      // There used to be a `search_text` bag beside this holding the same words
      // as tokens, because Postgres full text scored a name and a bag
      // differently. D1's index is built from the alias rows directly, so the
      // bag was one more thing to keep in step and nothing read it.
      aliases: (raw.aliases ?? []).map((a) => String(a).trim()).filter(Boolean),
      servings,
    },
  }
}

/** Every `.json` under the given files and directories, in a stable order. */
export function expand(paths) {
  const files = []
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      files.push(
        ...readdirSync(p)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .map((f) => `${p.replace(/\/$/, '')}/${f}`),
      )
    } else {
      files.push(p)
    }
  }
  return files
}

/**
 * Every dish in a set of payload files, shaped, with the rejections kept.
 *
 * The rejections are the output that matters to whoever wrote the file, so they
 * travel beside the rows rather than being logged and dropped.
 */
export function shapeFiles(paths) {
  const rows = []
  const rejected = []
  const warnings = []
  const perFile = []

  for (const file of expand(paths)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const list = Array.isArray(parsed) ? parsed : (parsed.foods ?? [])
    const fileSource = Array.isArray(parsed) ? null : parsed.source
    const fileSourceId = Array.isArray(parsed) ? null : parsed.source_id
    const name = file.split('/').pop()

    for (const raw of list) {
      const result = shape(raw, fileSource, fileSourceId)
      if (result.warning) warnings.push(`${name}: ${result.name} — ${result.warning}`)
      if (result.ok) rows.push({ ...result.row, file: name })
      else rejected.push({ file: name, name: result.name, reason: result.reason })
    }
    perFile.push({ file: name, read: list.length })
  }

  return { rows, rejected, warnings, perFile }
}

export { labelGrams, normalize, shape, slugify }
