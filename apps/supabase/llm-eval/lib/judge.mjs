/**
 * The judge: Claude Opus through Claude Code's programmatic mode (`claude -p`).
 *
 * One process per answer (see `claude.mjs`) with a JSON schema the reply must
 * satisfy. A photograph travels with the answer: a judge grading a photo scan
 * without the photo is grading the model's own description of it.
 *
 * Verdicts are cached on everything that could change them (the rubric, the
 * prompt the model was given, the case and the answer), so re-running a report
 * or resuming an interrupted run does not pay to judge the same answer twice.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runClaude } from './claude.mjs'

/** Bump when the judge's instructions change, so cached verdicts are not reused. */
const JUDGE_VERSION = 2
const CACHE = fileURLToPath(new URL('../.cache/judge/', import.meta.url))

const SYSTEM = [
  'You are the grader in an evaluation of language models for RiceCal, a calorie-tracking app',
  'used mostly in Malaysia and Singapore. The app sends a model a fixed prompt, parses its JSON',
  "reply, cleans it up, and acts on it: it writes calories into somebody's food diary, edits a",
  'logged entry, suggests a meal, fills a recipe form, or decides whether user content is published.',
  '',
  'You grade ONE answer from the model under test against a rubric. You are shown the feature,',
  "exactly what the model was told, the developer's reference for this case, automatic checks",
  "computed against that reference, and the answer after the app's own clean-up (which is what the",
  'user actually gets). The raw reply is included for context only; grade the cleaned answer.',
  '',
  'How to grade:',
  '- Score every rubric criterion from 0 to 4. 4: a careful expert would ship this answer unchanged.',
  '  3: right, with a small flaw nobody would act on. 2: usable but a user would notice a problem or',
  '  need to correct it. 1: mostly wrong or misleading. 0: wrong, harmful to the diary, or missing.',
  "- The reference states the developer's intent and is authoritative about it. Its calorie and macro",
  '  bands are deliberately generous: inside the band is not automatically a 4, and a figure just',
  '  outside a band is not automatically a 0. Use your own nutrition knowledge for the size of the error.',
  '- A failed automatic check is strong evidence, but checks are blunt string and number tests. If a',
  '  check failed for a reason that does not matter (a synonym, a translation, an equivalent answer),',
  '  say so and do not punish it. If every check passed but the answer is still wrong, score it wrong.',
  '- Judge the answer the prompt asked for. Do not reward length, do not punish brevity the prompt',
  '  allows, and do not invent requirements the prompt and the rubric do not state.',
  '- Use null for a criterion only when it genuinely cannot apply, for example the calories of a',
  '  correctly refused non-food input. When the model produced something it should not have, the',
  '  criteria apply and score low.',
  '- Each reason is one or two short sentences naming the specific evidence.',
  '- summary is one sentence on the answer as a whole.',
].join('\n')

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)

/**
 * One required property per criterion. An array of criteria let the judge skip
 * some, and a skipped criterion scored 0: an answer the judge called correct
 * came back at 40.
 */
const schemaFor = (rubric) => ({
  type: 'object',
  properties: {
    criteria: {
      type: 'object',
      properties: Object.fromEntries(
        rubric.map((c) => [
          c.id,
          {
            type: 'object',
            properties: {
              score: { type: ['integer', 'null'], minimum: 0, maximum: 4 },
              reason: { type: 'string' },
            },
            required: ['score', 'reason'],
          },
        ]),
      ),
      required: rubric.map((c) => c.id),
    },
    summary: { type: 'string' },
  },
  required: ['criteria', 'summary'],
})

const block = (title, body) => `## ${title}\n\n${body}\n`
const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``

/**
 * What is the same for every case of a task: the feature, the prompt the model
 * was given, and the rubric. It goes in the system prompt, which Claude Code
 * caches, rather than being re-read at full price for each of a task's cases.
 */
function systemFor(task, prompt) {
  return [
    SYSTEM,
    '',
    block('The feature', task.feature),
    block('What the model was told (system prompt)', prompt.system || '(none)'),
    block(
      'Rubric',
      task.rubric.map((c) => `- ${c.id} (weight ${c.weight}): ${c.description}`).join('\n'),
    ),
  ].join('\n')
}

/** What is particular to this case. */
function userMessage({ kase, answer, raw, prompt, checks }) {
  return [
    block('What the model was given (user message)', prompt.user || '(none)'),
    block('Reference for this case', `${kase.note ? `${kase.note}\n\n` : ''}${json(kase.expect)}`),
    block(
      'Automatic checks against the reference',
      checks.length
        ? checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.label} (got: ${c.got})`).join('\n')
        : '(none for this case)',
    ),
    block("The answer, after the app's clean-up", json(answer)),
    block('The raw reply', raw ? `\`\`\`\n${String(raw).slice(0, 6000)}\n\`\`\`` : '(no reply)'),
    'Grade the answer now.',
  ].join('\n')
}

/**
 * Grade one answer. Returns per-criterion scores, a 0-100 score weighted by the
 * rubric, the judge's summary, and what the judge cost.
 */
export async function judge({ task, kase, answer, raw, prompt, checks, images, options }) {
  const key = hash({
    v: JUDGE_VERSION,
    model: options.judgeModel,
    effort: options.judgeEffort ?? null,
    task: task.id,
    rubric: task.rubric,
    feature: task.feature,
    prompt,
    kase,
    answer,
  })
  const file = `${CACHE}${key}.json`
  if (!options.rejudge) {
    try {
      return { ...JSON.parse(await readFile(file, 'utf8')), cached: true }
    } catch {}
  }

  const content = [
    ...images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    })),
    { type: 'text', text: userMessage({ kase, answer, raw, prompt, checks }) },
  ]
  let result
  for (let attempt = 0; ; attempt++) {
    try {
      result = await runClaude({
        model: options.judgeModel,
        system: systemFor(task, prompt),
        content,
        timeoutMs: 300_000,
        extraArgs: [
          '--json-schema',
          JSON.stringify(schemaFor(task.rubric)),
          ...(options.judgeEffort ? ['--effort', options.judgeEffort] : []),
        ],
      })
      const graded = result.structured_output?.criteria ?? {}
      const missing = task.rubric.filter((c) => !graded[c.id])
      if (missing.length) throw new Error(`judge left out ${missing.map((c) => c.id).join(', ')}`)
      break
    } catch (error) {
      if (attempt >= 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)))
    }
  }

  const verdict = result.structured_output
  const criteria = task.rubric.map((c) => ({
    id: c.id,
    weight: c.weight,
    score: verdict.criteria[c.id].score,
    reason: verdict.criteria[c.id].reason,
  }))
  const scored = criteria.filter((c) => c.score !== null)
  const weight = scored.reduce((sum, c) => sum + c.weight, 0)
  // Every criterion "not applicable" is not a verdict, and scoring it 100 would
  // reward whatever the model did.
  if (!weight) throw new Error('the judge marked every criterion not applicable')
  const score = (scored.reduce((sum, c) => sum + c.weight * c.score, 0) / (weight * 4)) * 100

  const graded = {
    score: Math.round(score * 10) / 10,
    criteria,
    summary: verdict.summary,
    judgeCostUsd: result.total_cost_usd ?? 0,
    judgeMs: result.duration_ms ?? null,
  }
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, JSON.stringify(graded))
  return { ...graded, cached: false }
}
