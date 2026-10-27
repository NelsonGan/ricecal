/**
 * The hosted model prompts, against the copies in the code.
 *
 *   pnpm prompts:check                   does PostHog's production version match the code?
 *   pnpm prompts:check --label=latest    the newest version instead, before moving the label
 *   pnpm prompts:export describe-meal    one template as PostHog holds it, to paste in as a new version
 *
 * Every call takes its system prompt from PostHog (`_shared/prompts.ts`), and the
 * code's copy is what it falls back to. The two are meant to agree; this is how
 * to tell. A difference is either a change made in PostHog that has not been
 * copied into the code yet, or one made in the code that has not been uploaded.
 *
 * `check` reads with `POSTHOG_PROMPTS_API_KEY` (a personal key with only
 * `llm_prompt:read`), from the environment or `.secrets/posthog-prompts.key`.
 */

import { BUNDLED_PROMPTS } from '../functions/_shared/prompt-catalog.ts'
import { PROMPT_NAMES, type PromptName, templateOf } from '../functions/_shared/prompts.ts'

const PROJECT_ID = 659954
const HOST = 'https://us.posthog.com'
const KEY_FILE = new URL('../../../.secrets/posthog-prompts.key', import.meta.url)

const [command, ...rest] = Deno.args
const flag = (name: string) =>
  rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const names = rest.filter((a) => !a.startsWith('--')) as PromptName[]

function readKey(): string {
  const fromEnv = Deno.env.get('POSTHOG_PROMPTS_API_KEY')?.trim()
  if (fromEnv) return fromEnv
  try {
    return Deno.readTextFileSync(KEY_FILE).trim()
  } catch {
    console.error('No key: set POSTHOG_PROMPTS_API_KEY or write it to .secrets/posthog-prompts.key')
    Deno.exit(2)
  }
}

/** Where two strings first part, with a little either side, for the report. */
function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const around = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40))
  return `at character ${i}\n    PostHog: ${around(a)}\n    code:    ${around(b)}`
}

async function check() {
  const key = readKey()
  const label = flag('label') ?? 'production'
  let drift = 0
  for (const name of names.length ? names : PROMPT_NAMES) {
    const query = label === 'latest' ? '' : `?label=${encodeURIComponent(label)}`
    const res = await fetch(
      `${HOST}/api/projects/${PROJECT_ID}/llm_prompts/name/${encodeURIComponent(name)}/${query}`,
      { headers: { Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) {
      await res.body?.cancel()
      console.log(`${name}: no ${label} version (${res.status}), so the code copy is served`)
      drift++
      continue
    }
    const body = (await res.json()) as { prompt?: string; version?: number }
    const expected = templateOf(BUNDLED_PROMPTS[name])
    if (body.prompt === expected) {
      console.log(`${name}: v${body.version} matches the code`)
    } else {
      drift++
      console.log(
        `${name}: v${body.version} differs ${firstDifference(body.prompt ?? '', expected)}`,
      )
    }
  }
  if (drift) Deno.exit(1)
}

if (command === 'check') {
  await check()
} else if (command === 'export' && names.length === 1 && BUNDLED_PROMPTS[names[0]]) {
  console.log(templateOf(BUNDLED_PROMPTS[names[0]]))
} else {
  console.error('usage: prompts.ts check [--label=production|latest] [name...] | export <name>')
  Deno.exit(2)
}
