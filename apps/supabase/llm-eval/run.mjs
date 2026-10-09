/**
 * The model eval: run the app's own model calls against any OpenRouter model,
 * have Claude Opus judge every answer against a rubric, and score the model.
 *
 *   pnpm eval:llm --models qwen/qwen3.7-flash
 *   pnpm eval:llm --models claude:claude-haiku-5-5        through `claude -p`, not OpenRouter
 *   pnpm eval:llm --models a/one,b/two --repeat 2      two models, every case twice
 *   pnpm eval:llm --models a/one --tasks refine,describe-meal --grep satay
 *   pnpm eval:llm --report                              leaderboard over saved runs
 *   pnpm eval:llm --list                                tasks and case counts
 *   pnpm eval:llm --dry-run                             validate datasets, fetch photos
 *
 * Options:
 *   --tasks a,b          only these tasks (see --list)
 *   --grep text          only cases whose id or note matches
 *   --limit N            at most N cases per task
 *   --repeat N           run each case N times (default 1). Use 3 when comparing.
 *   --concurrency N      cases in flight at once (default 4)
 *   --judge-concurrency  judges in flight at once (default 3)
 *   --judge-model m      the judge, a `claude --model` value (default opus)
 *   --judge-effort e     low | medium | high | xhigh | max
 *   --no-judge           automatic checks only; scores are provisional
 *   --rejudge            ignore cached verdicts
 *   --timeout ms         per model request (default 25000, the app's own; 60000 for
 *                        claude:, whose process start-up is not the model's time)
 *   --body json          merged into every OpenRouter request, e.g.
 *                        '{"provider":{"order":["groq"]}}' or '{"reasoning":{"effort":"low"}}'
 *
 * `claude:<model>` runs on Claude Code's own login and needs no OpenRouter key.
 * The OpenRouter key comes from OPENROUTER_API_KEY or `apps/supabase/llm-eval/.env` (gitignored).
 * Results land in `apps/supabase/llm-eval/runs/` (gitignored).
 */

import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { judge } from './lib/judge.mjs'
import { costOf, describeModel, installInterceptor, loadKey, withModel } from './lib/openrouter.mjs'
import { MissingPhoto } from './lib/photos.mjs'
import { loadApp } from './lib/runtime.mjs'
import { TASKS, taskById } from './lib/tasks.mjs'

const ROOT = new URL('./', import.meta.url)
const RUNS = fileURLToPath(new URL('runs/', ROOT))

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
function opt(name) {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i < 0) return undefined
  const a = argv[i]
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1]
}
const flag = (name) => argv.includes(`--${name}`)
const list = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const options = {
  models: list(opt('models') ?? opt('model')),
  tasks: list(opt('tasks')),
  grep: opt('grep'),
  limit: Number(opt('limit') ?? Infinity),
  repeat: Math.max(1, Number(opt('repeat') ?? 1)),
  concurrency: Math.max(1, Number(opt('concurrency') ?? 4)),
  judgeConcurrency: Math.max(1, Number(opt('judge-concurrency') ?? 3)),
  judgeModel: opt('judge-model') ?? 'opus',
  judgeEffort: opt('judge-effort'),
  noJudge: flag('no-judge'),
  rejudge: flag('rejudge'),
  timeoutMs: opt('timeout') ? Number(opt('timeout')) : null,
  body: opt('body') ? JSON.parse(opt('body')) : {},
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

async function loadCases(task) {
  const file = fileURLToPath(new URL(`datasets/${task.dataset}`, ROOT))
  const { cases, contexts = {} } = JSON.parse(await readFile(file, 'utf8'))
  const seen = new Set()
  for (const kase of cases) {
    if (!kase.id || !kase.input || !kase.expect)
      throw new Error(`${task.dataset}: a case needs id, input and expect`)
    if (seen.has(kase.id)) throw new Error(`${task.dataset}: duplicate id ${kase.id}`)
    seen.add(kase.id)
    // A dataset can name a shared entry once and point cases at it.
    if (typeof kase.input.context === 'string') {
      const context = contexts[kase.input.context]
      if (!context)
        throw new Error(`${task.dataset}/${kase.id}: no context "${kase.input.context}"`)
      kase.input.context = context
    }
  }
  const grep = options.grep ? new RegExp(options.grep, 'i') : null
  return cases
    .filter((k) => !grep || grep.test(k.id) || grep.test(k.note ?? ''))
    .slice(0, options.limit)
}

function selectedTasks() {
  if (!options.tasks.length) return TASKS
  return options.tasks.map((id) => {
    const task = taskById.get(id)
    if (!task) throw new Error(`no task "${id}". Tasks: ${TASKS.map((t) => t.id).join(', ')}`)
    return task
  })
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function semaphore(n) {
  let active = 0
  const queue = []
  return async (fn) => {
    if (active >= n) await new Promise((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pct = (xs, p) => {
  if (!xs.length) return null
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const fmt = (n, digits = 1) => (n === null || n === undefined ? '–' : n.toFixed(digits))
const slugOf = (model) => model.replace(/[^a-z0-9.]+/gi, '-')

/**
 * The prompt the model saw, for the judge, with the icon id list cut out. The
 * last call, because a retry carries the first request plus what was said after
 * it, and the raw reply the judge reads is the retry's.
 */
function promptOf(calls, app) {
  const first = calls.at(-1)
  if (!first) return { system: '', user: '' }
  const textOf = (content) =>
    typeof content === 'string'
      ? content
      : (content ?? [])
          .map((p) => (p.type === 'text' ? p.text : '[the photo, attached above]'))
          .join('\n')
  const system = textOf(first.messages.find((m) => m.role === 'system')?.content).replace(
    app.icons.ICON_INSTRUCTION,
    '[Instruction: "icon" is one id from the app\'s fixed set of food drawings, copied exactly, or null.]',
  )
  const user = first.messages
    .filter((m) => m.role === 'user')
    .map((m) => textOf(m.content))
    .join('\n\n')
  return { system, user }
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

async function runCase({ app, task, kase, model, info, round, judgeSlot }) {
  const base = { task: task.id, case: kase.id, round, model }
  let images = []
  try {
    images = task.images ? await task.images(kase) : []
  } catch (error) {
    return {
      ...base,
      status: error instanceof MissingPhoto ? 'skipped' : 'harness_error',
      error: error.message,
    }
  }

  const claude = model.startsWith('claude:')
  const ctx = {
    model: claude ? model.slice('claude:'.length) : model,
    transport: claude ? 'claude' : 'openrouter',
    body: options.body,
    timeoutMs: options.timeoutMs ?? (claude ? 60_000 : 25_000),
    calls: [],
  }
  const started = Date.now()
  let answer = null
  let error = null
  try {
    answer = await withModel(ctx, () => task.run(app, kase, images))
  } catch (e) {
    error = e?.message ?? String(e)
  }
  const calls = ctx.calls
  const ms = Date.now() - started - calls.reduce((n, c) => n + c.waitedMs, 0)
  const cost = costOf(calls, info.pricing)
  const raw = calls.at(-1)?.content ?? null
  const record = {
    ...base,
    ms,
    modelCalls: calls.length,
    throttled: calls.reduce((n, c) => n + c.throttled, 0),
    costUsd: cost,
    usage: calls.map((c) => c.usage),
    providers: [...new Set(calls.map((c) => c.provider).filter(Boolean))],
    finish: calls.map((c) => c.finish),
    raw,
  }

  // The key, the login or the quota failed rather than the model. Scoring it 0
  // would read a spent key as a bad model, so it is left out of the score.
  const harness = calls.map((c) => c.harnessError).filter(Boolean)
  if (error && harness.length) {
    return {
      ...record,
      status: 'harness_error',
      error: [error, ...harness].join(' | ').slice(0, 800),
    }
  }

  if (error) {
    const transport = calls.map((c) => c.error).filter(Boolean)
    return {
      ...record,
      status: 'model_failed',
      error: [error, ...transport].join(' | ').slice(0, 800),
      score: 0,
      checks: [],
    }
  }

  const checks = task.checks(kase, answer, app)
  if (options.noJudge) {
    const passed = checks.filter((c) => c.ok).length
    return {
      ...record,
      status: 'ok',
      answer,
      checks,
      score: checks.length ? (passed / checks.length) * 100 : null,
      judged: false,
    }
  }

  try {
    const verdict = await judgeSlot(() =>
      judge({ task, kase, answer, raw, prompt: promptOf(calls, app), checks, images, options }),
    )
    return { ...record, status: 'ok', answer, checks, judged: true, ...verdict }
  } catch (e) {
    return { ...record, status: 'judge_failed', answer, checks, error: e.message, score: null }
  }
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

function summarise(model, info, tasks, results) {
  const byTask = tasks.map((task) => {
    const rows = results.filter((r) => r.task === task.id)
    const graded = rows.filter((r) => typeof r.score === 'number')
    const checks = rows.flatMap((r) => r.checks ?? [])
    return {
      task: task.id,
      title: task.title,
      weight: task.weight,
      cases: rows.length,
      graded: graded.length,
      score: mean(graded.map((r) => r.score)),
      failures: rows.filter((r) => r.status === 'model_failed').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      harnessErrors: rows.filter((r) => ['harness_error', 'judge_failed'].includes(r.status))
        .length,
      checkPassRate: checks.length ? checks.filter((c) => c.ok).length / checks.length : null,
      p50Ms: pct(
        rows.filter((r) => r.ms).map((r) => r.ms),
        50,
      ),
      costUsd: rows.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    }
  })
  const scored = byTask.filter((t) => t.score !== null)
  const weight = scored.reduce((s, t) => s + t.weight, 0)
  const ran = results.filter(
    (r) => r.status === 'ok' || r.status === 'model_failed' || r.status === 'judge_failed',
  )
  const latencies = results.filter((r) => r.ms && r.status !== 'skipped').map((r) => r.ms)
  return {
    model,
    modelInfo: info,
    judge: options.noJudge
      ? null
      : { model: options.judgeModel, effort: options.judgeEffort ?? null },
    options: {
      repeat: options.repeat,
      grep: options.grep ?? null,
      limit: Number.isFinite(options.limit) ? options.limit : null,
      timeoutMs: options.timeoutMs,
      body: options.body,
    },
    finishedAt: new Date().toISOString(),
    overall: weight ? scored.reduce((s, t) => s + t.weight * t.score, 0) / weight : null,
    reliability: ran.length
      ? 1 - ran.filter((r) => r.status === 'model_failed').length / ran.length
      : null,
    p50Ms: pct(latencies, 50),
    p95Ms: pct(latencies, 95),
    modelCostUsd: results.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    judgeCostUsd: results.reduce((s, r) => s + (r.cached ? 0 : (r.judgeCostUsd ?? 0)), 0),
    tasks: byTask,
  }
}

function reportMarkdown(summary, results) {
  const lines = [
    `# ${summary.model}`,
    '',
    `Overall **${fmt(summary.overall)}** / 100 · reliability ${fmt((summary.reliability ?? 0) * 100)}% · ` +
      `p50 ${fmt((summary.p50Ms ?? 0) / 1000)} s · p95 ${fmt((summary.p95Ms ?? 0) / 1000)} s · ` +
      `model $${summary.modelCostUsd.toFixed(4)} · judge $${summary.judgeCostUsd.toFixed(2)}`,
    '',
    summary.judge
      ? `Judged by \`${summary.judge.model}\`.`
      : 'Not judged: scores are the automatic check pass rate.',
    '',
    '| task | weight | score | cases | failed | checks passed | p50 | cost |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...summary.tasks.map(
      (t) =>
        `| ${t.title} | ${t.weight} | ${fmt(t.score)} | ${t.graded}/${t.cases} | ${t.failures} | ` +
        `${t.checkPassRate === null ? '–' : `${fmt(t.checkPassRate * 100, 0)}%`} | ${fmt((t.p50Ms ?? 0) / 1000)} s | $${t.costUsd.toFixed(4)} |`,
    ),
    '',
    '## Lowest scoring answers',
    '',
  ]
  const worst = results
    .filter((r) => typeof r.score === 'number' && r.score < 75)
    .sort((a, b) => a.score - b.score)
    .slice(0, 25)
  for (const r of worst) {
    lines.push(`- **${fmt(r.score, 0)}** \`${r.task}/${r.case}\`: ${r.summary ?? r.error ?? ''}`)
    for (const c of r.criteria ?? [])
      if (c.score !== null && c.score < 3) lines.push(`  - ${c.id} ${c.score}/4: ${c.reason}`)
  }
  if (!worst.length) lines.push('None below 75.')
  const failures = failureReasons(results)
  if (failures.length) {
    lines.push(
      '',
      '## Model failures',
      '',
      'Answers the app could not use, which score 0. Grouped by reason.',
      '',
    )
    for (const [reason, count] of failures) lines.push(`- ${count} × ${reason}`)
  }
  const broken = results.filter((r) =>
    ['harness_error', 'judge_failed', 'skipped'].includes(r.status),
  )
  if (broken.length) {
    lines.push('', '## Not graded', '')
    for (const r of broken) lines.push(`- \`${r.task}/${r.case}\` ${r.status}: ${r.error}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Why answers failed, most common first. A model that rejects one of the app's
 * request parameters fails every case the same way, and that sentence is the
 * finding rather than three hundred zeroes.
 */
function failureReasons(results) {
  const counts = new Map()
  for (const r of results.filter((x) => x.status === 'model_failed')) {
    const reason = r.error.split(' | ')[0].slice(0, 240)
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function printSummary(summary, results) {
  console.log(
    `\n${summary.model}: overall ${fmt(summary.overall)} / 100, reliability ${fmt((summary.reliability ?? 0) * 100)}%`,
  )
  console.table(
    Object.fromEntries(
      summary.tasks.map((t) => [
        t.task,
        {
          score: fmt(t.score),
          cases: `${t.graded}/${t.cases}`,
          failed: t.failures,
          checks: t.checkPassRate === null ? '–' : `${fmt(t.checkPassRate * 100, 0)}%`,
          'p50 s': fmt((t.p50Ms ?? 0) / 1000),
        },
      ]),
    ),
  )
  console.log(
    `model $${summary.modelCostUsd.toFixed(4)} · judge $${summary.judgeCostUsd.toFixed(2)}`,
  )
  const notGraded = results.filter((r) => ['harness_error', 'judge_failed'].includes(r.status))
  if (notGraded.length) {
    console.log(
      `not graded ${notGraded.length}× (see report.md): ${notGraded[0].error.split('\n')[0].slice(0, 200)}`,
    )
  }
  for (const [reason, count] of failureReasons(results).slice(0, 3))
    console.log(`failed ${count}×: ${reason}`)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandList() {
  for (const task of TASKS) {
    const file = fileURLToPath(new URL(`datasets/${task.dataset}`, ROOT))
    const { cases } = JSON.parse(await readFile(file, 'utf8'))
    console.log(
      `${task.id.padEnd(20)} weight ${String(task.weight).padStart(2)}  ${String(cases.length).padStart(3)} cases  ${task.title}`,
    )
  }
}

async function commandDryRun() {
  let total = 0
  for (const task of selectedTasks()) {
    const cases = await loadCases(task)
    total += cases.length
    let photos = 0
    let missing = 0
    for (const kase of cases) {
      if (!task.images) continue
      try {
        photos += (await task.images(kase)).length
      } catch (error) {
        if (error instanceof MissingPhoto) missing++
        else throw new Error(`${task.id}/${kase.id}: ${error.message}`)
      }
    }
    console.log(
      `${task.id}: ${cases.length} cases${task.images ? `, ${photos} photos cached, ${missing} optional photos missing` : ''}`,
    )
  }
  console.log(`${total} cases valid`)
}

async function commandReport() {
  const dirs = await readdir(RUNS).catch(() => [])
  const latest = new Map()
  for (const dir of dirs.sort()) {
    try {
      const summary = JSON.parse(await readFile(`${RUNS}${dir}/summary.json`, 'utf8'))
      // A run that graded nothing (a bad key, an interrupted start) says
      // nothing about the model and must not replace one that did.
      if (summary.overall === null) continue
      // The same model with request overrides is a different configuration.
      const body = summary.options?.body ?? {}
      const label = Object.keys(body).length
        ? `${summary.model} ${JSON.stringify(body)}`
        : summary.model
      latest.set(label, { ...summary, label, dir })
    } catch {}
  }
  if (!latest.size) return console.log('No runs yet. Start one with --models <slug>.')
  const rows = [...latest.values()].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
  const taskIds = TASKS.map((t) => t.id)
  const head = ['model', 'overall', 'answers', 'reliability', 'p50 s', 'model $', ...taskIds, 'run']
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`]
  for (const r of rows) {
    const score = (id) => fmt(r.tasks.find((t) => t.task === id)?.score ?? null, 0)
    lines.push(
      `| ${r.label} | ${fmt(r.overall)} | ${r.tasks.reduce((n, t) => n + t.graded, 0)} | ` +
        `${fmt((r.reliability ?? 0) * 100, 0)}% | ${fmt((r.p50Ms ?? 0) / 1000)} | ` +
        `${r.modelCostUsd.toFixed(3)} | ${taskIds.map(score).join(' | ')} | ${r.dir} |`,
    )
  }
  const table = `${lines.join('\n')}\n`
  await writeFile(
    `${RUNS}leaderboard.md`,
    `# Model leaderboard\n\nLatest run per model and request overrides. Compare rows only when they graded the same tasks with the same --repeat (the answers column).\n\n${table}`,
  )
  console.log(table)
  console.log(`Written to ${RUNS}leaderboard.md`)
}

async function commandRun() {
  if (!options.models.length) throw new Error('name at least one model: --models provider/model')
  const viaOpenRouter = options.models.some((m) => !m.startsWith('claude:'))
  if (viaOpenRouter && !loadKey()) {
    throw new Error(
      'No OpenRouter key. Export OPENROUTER_API_KEY, or put OPENROUTER_API_KEY=... in apps/supabase/llm-eval/.env. ' +
        "Supabase's secrets API returns a digest, so the production key has to come from whoever holds it.",
    )
  }
  const tasks = selectedTasks()
  const casesByTask = new Map()
  for (const task of tasks) casesByTask.set(task.id, await loadCases(task))

  // The app's model code runs in mock mode without a key. A claude:-only run
  // never reaches OpenRouter, so any non-empty value keeps it honest.
  if (!viaOpenRouter)
    process.env.OPENROUTER_API_KEY ||= loadKey() ?? 'unused: every model runs through claude -p'
  const app = await loadApp()
  installInterceptor()
  const judgeSlot = semaphore(options.judgeConcurrency)

  for (const model of options.models) {
    const info = model.startsWith('claude:')
      ? {
          slug: model,
          found: true,
          vision: true,
          jsonMode: true,
          transport: 'claude-code',
          pricing: null,
        }
      : await describeModel(model)
    if (!info.found) {
      console.error(
        `\n${model}: not an OpenRouter model id. Check https://openrouter.ai/models. Skipped.`,
      )
      continue
    }
    const ignored = Object.keys(options.body).filter((key) => key !== 'effort')
    if (model.startsWith('claude:') && ignored.length) {
      console.warn(
        `${model}: claude -p takes only "effort" from --body; ignoring ${ignored.join(', ')}.`,
      )
    }
    if (!info.vision)
      console.warn(
        `${model}: OpenRouter lists no image input. Photo tasks will fail, as they would in the app.`,
      )
    if (!info.jsonMode)
      console.warn(
        `${model}: OpenRouter lists no response_format support. The app asks for JSON mode on every call.`,
      )

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = `${RUNS}${stamp}_${slugOf(model)}/`
    await mkdir(dir, { recursive: true })
    const jobs = tasks.flatMap((task) =>
      casesByTask
        .get(task.id)
        .flatMap((kase) =>
          Array.from({ length: options.repeat }, (_, round) => ({ task, kase, round })),
        ),
    )
    console.log(`\n${model}: ${jobs.length} answers across ${tasks.length} tasks → ${dir}`)

    const slot = semaphore(options.concurrency)
    const results = []
    let done = 0
    await Promise.all(
      jobs.map((job) =>
        slot(async () => {
          // One case going wrong in the harness must not take down an hour of
          // paid-for answers with it.
          const result = await runCase({ app, model, info, judgeSlot, ...job }).catch((error) => ({
            task: job.task.id,
            case: job.kase.id,
            round: job.round,
            model,
            status: 'harness_error',
            error: error?.stack ?? String(error),
          }))
          results.push(result)
          await appendFile(`${dir}results.jsonl`, `${JSON.stringify(result)}\n`)
          done++
          const mark = result.status === 'ok' ? fmt(result.score, 0).padStart(3) : result.status
          console.log(
            `[${String(done).padStart(String(jobs.length).length)}/${jobs.length}] ${mark}  ${job.task.id}/${job.kase.id}${options.repeat > 1 ? ` #${job.round + 1}` : ''}`,
          )
        }),
      ),
    )

    const summary = summarise(model, info, tasks, results)
    await writeFile(`${dir}summary.json`, JSON.stringify(summary, null, 2))
    await writeFile(`${dir}report.md`, reportMarkdown(summary, results))
    printSummary(summary, results)
    console.log(`Report: ${dir}report.md`)
  }
  if (options.models.length > 1) await commandReport()
}

try {
  if (flag('list')) await commandList()
  else if (flag('report')) await commandReport()
  else if (flag('dry-run')) await commandDryRun()
  else await commandRun()
} catch (error) {
  console.error(error.message ?? error)
  process.exit(1)
}
