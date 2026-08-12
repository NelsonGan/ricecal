/**
 * Grades the meal-recognition pipeline end to end, against the deployed stack.
 *
 * `eval:prompts` grades the PROMPTS — it imports them, calls the model, and
 * checks what came back. This grades the PIPELINE: upload, vision call,
 * catalogue search, verifier, ratio gate, portion sizing, the estimate and the
 * archetype floor, and the row that lands in the diary at the end of it. The
 * two fail differently, and the second is where a scan usually goes wrong.
 *
 *   pnpm eval:scan                 every case
 *   pnpm eval:scan --only=text     one kind (text | photo)
 *   pnpm eval:scan --grep=satay    cases whose name matches
 *   pnpm eval:scan --repeat=3      run each case N times and score the pass RATE
 *   pnpm eval:scan --keep          leave the entries in the diary to look at
 *   pnpm eval:scan --save out.json the full result, traces and all
 *
 * USE --repeat WHEN YOU ARE CHANGING SOMETHING. A single pass over these cases
 * is not a measurement: the same sentence resolved to tier 1 at 657 kcal, tier
 * 4 at 525 and tier 3 at 821 on three consecutive runs of identical code, which
 * is wide enough to credit a prompt change with an improvement it did not make
 * or to hide a regression behind a lucky sample.
 *
 * A case says what it expects LOOSELY, and on purpose. The dish a model names
 * and the row the catalogue picks are both allowed to move; what is not allowed
 * is a plate of nasi lemak coming back at 90 kcal or at 2,400. So a case states
 * a calorie band it must land inside, words the name must and must not contain,
 * and how many parts a breakdown should have. That is the level at which this
 * pipeline is actually wrong when it is wrong.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import * as live from './lib/live.mjs'

const CASES_FILE = fileURLToPath(new URL('./scan-eval.cases.json', import.meta.url))
const IMAGE_CACHE = fileURLToPath(new URL('../data/scan-eval/.cache/', import.meta.url))

/**
 * The photograph for a case, fetched once and kept.
 *
 * The cases name a URL rather than a file in the repo, and the images land in a
 * gitignored cache. Photographs of food are the one input this harness cannot
 * write down for itself, and checking a few megabytes of somebody else's
 * CC-licensed JPEGs into the repo to test a prompt is a poor trade — the URL is
 * the citation and the cache is the copy.
 */
async function photoBytes(url) {
  await mkdir(IMAGE_CACHE, { recursive: true })
  const file = `${IMAGE_CACHE}${createHash('sha1').update(url).digest('hex').slice(0, 16)}.jpg`
  try {
    return await readFile(file)
  } catch {
    const res = await fetch(url, { headers: { 'User-Agent': 'ricecal-eval/1.0' } })
    if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    await writeFile(file, bytes)
    return bytes
  }
}

const args = process.argv.slice(2)
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=')
const has = (name) => args.includes(`--${name}`)

const only = flag('only')
const grep = flag('grep')
const keep = has('keep')
const savePath = flag('save')
const repeat = Math.max(1, Number(flag('repeat') ?? 1))

const norm = (s) => String(s ?? '').toLowerCase()

/** Did the entry land where the case said it should? */
function grade(kase, entry, breakdown) {
  const problems = []
  if (!entry) return ['no entry was written']

  const kcal = Number(entry.kcal)
  const [low, high] = kase.kcal
  if (!(kcal >= low && kcal <= high)) problems.push(`${kcal} kcal is outside ${low}-${high}`)

  const name = norm(entry.food_name)
  for (const want of kase.name_has ?? []) {
    if (!name.includes(norm(want))) problems.push(`name "${entry.food_name}" lacks "${want}"`)
  }
  for (const avoid of kase.name_lacks ?? []) {
    if (name.includes(norm(avoid))) problems.push(`name "${entry.food_name}" contains "${avoid}"`)
  }

  if (kase.parts != null) {
    const [pLow, pHigh] = Array.isArray(kase.parts) ? kase.parts : [kase.parts, kase.parts]
    if (breakdown.length < pLow || breakdown.length > pHigh) {
      problems.push(`${breakdown.length} parts, wanted ${pLow}-${pHigh}`)
    }
  }

  if (kase.grams) {
    const [gLow, gHigh] = kase.grams
    const g = entry.grams == null ? null : Number(entry.grams)
    if (g == null) problems.push('no weight on the entry')
    else if (!(g >= gLow && g <= gHigh)) problems.push(`${g} g is outside ${gLow}-${gHigh}`)
  }

  // A breakdown that does not add up to its parent is the invariant this
  // pipeline breaks most quietly: the diary shows one number and the list under
  // it shows another, and neither looks wrong on its own.
  if (breakdown.length) {
    const sum = breakdown.reduce((t, p) => t + Number(p.kcal), 0)
    if (Math.abs(sum - kcal) > Math.max(3, kcal * 0.02)) {
      problems.push(`parts sum to ${sum} but the entry says ${kcal}`)
    }
  }

  return problems
}

/**
 * One case, with everything it writes recorded in `written` as it goes.
 *
 * The caller owns the cleanup precisely because this can throw between the
 * write and the delete — a slow refine, a 429, a case that fails a read. Those
 * rows land in a real diary on a real project, and a run that died halfway used
 * to leave its meals there permanently.
 */
async function runOne(kase, written) {
  const started = Date.now()
  let scan

  if (kase.kind === 'photo') {
    const bytes = await photoBytes(kase.image)
    written.photoKey = await live.upload(bytes, kase.contentType ?? 'image/jpeg')
    scan = await live.scanPhoto(written.photoKey)
  } else {
    scan = await live.scanText(kase.text)
  }

  const result = {
    name: kase.name,
    kind: kase.kind,
    ms: Date.now() - started,
    status: scan.status,
    trace: scan.body?.trace ?? [],
  }

  if (!scan.body?.ok) {
    result.problems = [`scan failed: ${scan.body?.error ?? scan.status}`]
    return result
  }

  // "There is no food here" is an answer, and for some cases it is the RIGHT
  // answer — so it is graded rather than treated as a failure to write a row.
  if (scan.body.food === false) {
    result.noFood = true
    result.problems = kase.expect_no_food ? [] : ['answered "no food" for a meal']
    return result
  }
  if (kase.expect_no_food) {
    result.problems = ['wrote an entry for something that is not food']
  }

  const ids = scan.body.entries.map((e) => e.id)
  written.ids.push(...ids)
  const row = await live.entry(ids[0])
  const breakdown = await live.parts(ids[0])
  const items = await live.scanItems(scan.body.scanId)

  result.entryCount = ids.length
  result.name_out = row?.food_name
  result.kcal = row ? Number(row.kcal) : null
  result.grams = row?.grams == null ? null : Number(row.grams)
  result.serving = row?.serving_label
  result.tiers = items.map((i) => i.resolved_tier)
  result.queries = items.map((i) => i.specific_query)
  result.llm_band = items.map((i) => [i.llm_kcal_low, i.llm_kcal_high])
  result.hints = items.map((i) => i.serving_hint)
  result.quantities = items.map((i) => Number(i.quantity))
  // What the model actually claimed, before the cascade priced any of it. When
  // an entry lands somewhere odd this is nearly always where it went wrong.
  result.claimed = items.flatMap((i) =>
    (i.components ?? []).map((c) => `${c.name} x${c.count} @ ${c.grams}g = ${c.kcal}`),
  )
  result.parts = breakdown.map((p) => `${p.name} x${p.quantity} = ${p.kcal}`)
  result.problems = [...(result.problems ?? []), ...grade(kase, row, breakdown)]

  if (kase.refine) {
    const refined = await live.refine(ids[0], kase.refine.text)
    // "Nothing to do" comes back as `applied: false` with a reason rather than
    // as an action, because it is a result and not a rung on the ladder.
    const action = refined.body?.applied ? refined.body.action : 'none'
    result.refine = { action, reason: refined.body?.reason }

    const after = await live.entry(ids[0])
    result.refine.kcal = after ? Number(after.kcal) : null
    const [rLow, rHigh] = kase.refine.kcal
    if (!(result.refine.kcal >= rLow && result.refine.kcal <= rHigh)) {
      result.problems.push(
        `after "${kase.refine.text}": ${result.refine.kcal} kcal, wanted ${rLow}-${rHigh}`,
      )
    }
    if (kase.refine.action && action !== kase.refine.action) {
      result.problems.push(`refine chose ${action}, wanted ${kase.refine.action}`)
    }
  }

  return result
}

/** Take back everything a case wrote, whether or not it got to the end. */
async function cleanUp(ids, photoKey) {
  await Promise.all(ids.map((id) => live.removeEntry(id).catch(() => null)))
  if (photoKey) await live.removePhotos([photoKey]).catch(() => null)
}

const all = JSON.parse(await readFile(CASES_FILE, 'utf8'))
const cases = all.filter(
  (k) => (!only || k.kind === only) && (!grep || k.name.toLowerCase().includes(grep.toLowerCase())),
)

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
    const written = { ids: [], photoKey: null }
    try {
      runs.push(await runOne(kase, written))
    } catch (error) {
      runs.push({ name: kase.name, kind: kase.kind, problems: [`threw: ${error.message}`] })
    } finally {
      if (!keep) await cleanUp(written.ids, written.photoKey)
    }
  }
  results.push(...runs)

  const ok = runs.filter((r) => !r.problems?.length).length
  passes += ok
  attempts += runs.length
  const head = ok === runs.length ? '✓' : ok === 0 ? '✗' : '~'
  console.log(`${head} ${kase.name}${repeat > 1 ? `   [${ok}/${runs.length}]` : ''}`)

  for (const result of runs) {
    const summary = result.noFood
      ? 'no food'
      : `${result.name_out ?? '—'} · ${result.kcal ?? '—'} kcal · tier ${(result.tiers ?? []).join(',') || '—'}`
    console.log(`    ${summary}  (${result.ms ?? 0} ms)`)
    if (result.queries?.some(Boolean)) {
      console.log(
        `    asked: ${result.queries.join(', ')} · hint ${result.hints?.join(', ') || '—'}` +
          ` · x${result.quantities?.join(',')} · band ${(result.llm_band ?? []).map((b) => b.join('-')).join(', ')}`,
      )
    }
    if (result.claimed?.length) console.log(`    claimed: ${result.claimed.join(' | ')}`)
    if (result.parts?.length) console.log(`    parts: ${result.parts.join(' | ')}`)
    if (result.refine) {
      console.log(`    refine: ${result.refine.action} → ${result.refine.kcal} kcal`)
    }
    for (const problem of result.problems ?? []) console.log(`    ! ${problem}`)
    for (const line of result.trace ?? []) console.log(`    · ${line}`)
  }
}

console.log(`\n${passes}/${attempts} passed`)
const failed = attempts - passes

if (savePath) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(savePath, `${JSON.stringify(results, null, 2)}\n`)
  console.log(`wrote ${savePath}`)
}

process.exit(failed ? 1 : 0)
