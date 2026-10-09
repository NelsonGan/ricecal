/**
 * The committed record of every run.
 *
 * `runs/` holds everything a run saw (each request, reply and verdict) and is
 * gitignored: it is large, and it is one machine's. What is kept for good is
 * `history/`: per run, the summary as JSON and the report as Markdown, both
 * named `<time>_<model>`, plus `leaderboard.md` rebuilt from all of them. A run
 * commits exactly those files and nothing else that happens to be staged, so
 * the history of how each model scored, on which code, is `git log history/`.
 */

import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const HISTORY = fileURLToPath(new URL('../history/', import.meta.url))
const REPO = fileURLToPath(new URL('../../../../', import.meta.url))

const git = (...args) =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

/** A model plus its request overrides: the same model configured differently is another row. */
export function labelOf(summary) {
  const body = summary.options?.body ?? {}
  return Object.keys(body).length ? `${summary.model} ${JSON.stringify(body)}` : summary.model
}

/**
 * Which code produced the run. A score means nothing without the prompts and
 * cases it was measured on, and `dirty` says the working tree had edits to
 * either that the commit does not hold.
 */
function codeVersion() {
  try {
    const watched = [
      'apps/supabase/functions',
      'apps/supabase/llm-eval/lib',
      'apps/supabase/llm-eval/datasets',
    ]
    return {
      commit: git('rev-parse', '--short', 'HEAD'),
      branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      dirty: git('status', '--porcelain', '--', ...watched) !== '',
    }
  } catch {
    return null
  }
}

const fmt = (n, digits = 1) => (n === null || n === undefined ? '–' : n.toFixed(digits))

/**
 * The leaderboard, from every recorded run. Per model and per task it takes the
 * latest run that graded the WHOLE task (no --limit, no --grep), so a re-run of
 * one task updates that task, and a smoke test is in the history without
 * standing in for a full measurement.
 */
export async function buildLeaderboard(tasks) {
  const files = (await readdir(HISTORY).catch(() => [])).filter((f) => f.endsWith('.json')).sort()
  const byLabel = new Map()
  for (const file of files) {
    const entry = JSON.parse(await readFile(`${HISTORY}${file}`, 'utf8'))
    if (entry.options?.limit || entry.options?.grep) continue
    const row = byLabel.get(entry.label) ?? { label: entry.label, tasks: new Map() }
    for (const t of entry.tasks ?? []) {
      if (t.score === null || !t.graded) continue
      row.tasks.set(t.task, { ...t, run: entry.run, repeat: entry.options?.repeat ?? 1 })
    }
    byLabel.set(entry.label, row)
  }

  const rows = [...byLabel.values()]
    .filter((row) => row.tasks.size)
    .map((row) => {
      const done = tasks.filter((t) => row.tasks.has(t.id))
      const weight = done.reduce((s, t) => s + t.weight, 0)
      const parts = [...row.tasks.values()]
      const answered = parts.reduce((s, t) => s + t.cases - t.skipped - t.harnessErrors, 0)
      return {
        ...row,
        overall: done.reduce((s, t) => s + t.weight * row.tasks.get(t.id).score, 0) / weight,
        covered: done.length,
        graded: parts.reduce((s, t) => s + t.graded, 0),
        reliability: answered ? 1 - parts.reduce((s, t) => s + t.failures, 0) / answered : null,
        costPerAnswer: answered ? parts.reduce((s, t) => s + t.costUsd, 0) / answered : null,
        runs: [...new Set(parts.map((t) => t.run))],
      }
    })
    .sort((a, b) => b.overall - a.overall)

  const head = [
    'model',
    'overall',
    'tasks',
    'answers',
    'reliability',
    '$ / answer',
    ...tasks.map((t) => t.id),
    'runs',
  ]
  const lines = [
    '# Model leaderboard',
    '',
    'Built by `pnpm eval:llm` from every run in this directory. Per model (and request',
    'overrides), each task shows its latest run that graded the whole task; runs with',
    '`--limit` or `--grep` are in the history but not here. Overall is the',
    'task-weighted mean of the tasks a row covers, so compare rows that cover all',
    `${tasks.length} tasks. \`$ / answer\` is the model's own cost, not the judge's.`,
    '',
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map(
      (r) =>
        `| ${r.label} | **${fmt(r.overall)}** | ${r.covered}/${tasks.length} | ${r.graded} | ` +
        `${fmt((r.reliability ?? 0) * 100, 0)}% | ${r.costPerAnswer === null ? '–' : `$${r.costPerAnswer.toFixed(5)}`} | ` +
        `${tasks.map((t) => fmt(r.tasks.get(t.id)?.score ?? null, 0)).join(' | ')} | ${r.runs.join(', ')} |`,
    ),
    '',
  ]
  await mkdir(HISTORY, { recursive: true })
  await writeFile(`${HISTORY}leaderboard.md`, lines.join('\n'))
  return lines.join('\n')
}

/**
 * Write one run into the history, rebuild the leaderboard, and commit those
 * files alone (`git commit --only`), leaving anything else staged untouched.
 */
export async function recordRun({ summary, report, run, tasks, commit = true }) {
  await mkdir(HISTORY, { recursive: true })
  const entry = { label: labelOf(summary), run, code: codeVersion(), ...summary }
  const json = `${HISTORY}${run}.json`
  const md = `${HISTORY}${run}.md`
  await writeFile(json, `${JSON.stringify(entry, null, 2)}\n`)
  await writeFile(md, report)
  await buildLeaderboard(tasks)
  const files = [json, md, `${HISTORY}leaderboard.md`]
  if (!commit) return { files, committed: false }

  const score = summary.overall === null ? 'nothing graded' : `${fmt(summary.overall)} out of 100`
  const message = `Record a model eval run of ${entry.label}: ${score}`
  // Two models run as separate processes finish together and commit together:
  // one meets the other's index.lock, and a leaderboard built before the other
  // entry landed would leave it out. So the leaderboard is rebuilt just before
  // each attempt, and a lock is waited out.
  for (let attempt = 0; ; attempt++) {
    try {
      await buildLeaderboard(tasks)
      git('add', '--', ...files)
      git('commit', '--only', '-m', message, '--', ...files)
      return { files, committed: git('rev-parse', '--short', 'HEAD') }
    } catch (error) {
      const text = String(error.stderr || error.message).trim()
      if (text.includes('index.lock') && attempt < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1500))
        continue
      }
      return { files, committed: false, error: text }
    }
  }
}
