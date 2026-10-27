// The model prompts, hosted in PostHog prompt management so one can be changed
// without a deploy and read beside the `$ai_generation` events that used it.
//
// Each prompt lives in the RiceCal PostHog project under a name below, and a
// call is sent the version the `production` label points at. The copy in the
// code is the fallback: no key, a PostHog outage, a slow answer or a deleted
// prompt all degrade to exactly the prompt this deploy shipped with, never to a
// failed scan. So a change made in PostHog should be copied into the code too,
// or it is lost the day PostHog does not answer, and the eval and the tests
// only ever read the code's copy.
//
// The only variable is `{{icon_instruction}}`, the list of icon ids, which is
// generated from the icon files and would go stale in PostHog the day an icon
// is added. It is filled in one pass, so a `{{…}}` inside it stays text.

import { ICON_INSTRUCTION } from './icons.ts'

/** One name per prompt. The note rules are appended to the photo prompt. */
export const PROMPT_NAMES = [
  'analyse-photo',
  'analyse-photo-note',
  'describe-meal',
  'pick-candidate',
  'estimate-nutrition',
  'interpret-instruction',
  'read-recipe-photo',
  'describe-recipe',
  'review-recipe',
  'suggest-meals',
  'moderate-submission',
] as const

export type PromptName = (typeof PROMPT_NAMES)[number]

/** A piece of a system prompt: its name in PostHog and the code's own copy. */
export type PromptPart = { name: PromptName; bundled: string }

/** A system prompt still to be resolved, made of one part or more. */
export type HostedSystem = { hostedSystem: PromptPart[] }

export type ResolvedPrompt = {
  name: PromptName
  /** The PostHog version, or null for the code's copy. */
  version: number | null
  source: 'posthog' | 'bundled'
}

/** The system message content for these parts, resolved when the call is made. */
export const hostedSystem = (...parts: PromptPart[]): HostedSystem => ({ hostedSystem: parts })

export const isHostedSystem = (value: unknown): value is HostedSystem =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Partial<HostedSystem>).hostedSystem)

const VARIABLE = '{{icon_instruction}}'

/**
 * The template PostHog holds for a code copy: the icon list swapped for its
 * variable. Exported for the script that uploads them and for the test that
 * checks a template renders back into the code's copy exactly.
 */
export function templateOf(bundled: string): string {
  return bundled.split(ICON_INSTRUCTION).join(VARIABLE)
}

export function render(template: string): string {
  return template.split(VARIABLE).join(ICON_INSTRUCTION)
}

/** RiceCal's PostHog project, US cloud. */
const PROJECT_ID = 659954
const APP_HOST = 'https://us.posthog.com'
const LABEL = 'production'
/**
 * A label move reaches every isolate within 30 minutes. Each fetch is a
 * `$llm_prompt_fetched` event on the PostHog bill, and Money2Time measured
 * about five times as many at a 5 minute refresh.
 */
const CACHE_TTL_MS = 30 * 60 * 1000
/** After a failed fetch, keep what we have (or the code's copy) for a minute before asking again. */
const RETRY_AFTER_FAILURE_MS = 60 * 1000
/**
 * Taken from the scan's own time, and at most once a minute per prompt (see
 * `missedUntil`). PostHog is in the US and the functions are not: a cold
 * request took about a second, mostly the connection, so 1.5 s timed out often
 * enough to serve the code's copy at random.
 */
const FETCH_TIMEOUT_MS = 3000

type Cached = { template: string; version: number; fetchedAt: number; retryAt: number }
const cache = new Map<PromptName, Cached>()
/**
 * When a prompt with nothing cached last failed, and so when to ask again.
 * Without it, an unlabelled prompt or a PostHog outage made every call wait
 * for its own failed fetch, up to the timeout, before sending the code's copy.
 */
const missedUntil = new Map<PromptName, number>()
/** A fetch already on its way, shared by calls that start while it is out. */
const inFlight = new Map<PromptName, Promise<{ template: string; version: number } | null>>()

async function fetchPrompt(
  name: PromptName,
): Promise<{ template: string; version: number } | null> {
  const key = Deno.env.get('POSTHOG_PROMPTS_API_KEY')?.trim()
  if (!key) return null
  try {
    const res = await fetch(
      `${APP_HOST}/api/projects/${PROJECT_ID}/llm_prompts/name/${encodeURIComponent(name)}/?label=${LABEL}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      await res.body?.cancel()
      console.error(`[prompts] ${name}: PostHog answered ${res.status}, using the bundled copy`)
      return null
    }
    const body = (await res.json()) as { prompt?: unknown; version?: unknown }
    // An answer with no version is not used: every generation it served would
    // name a version nobody can open.
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return null
    if (typeof body.version !== 'number') return null
    return { template: body.prompt, version: body.version }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[prompts] ${name}: ${reason}, using the bundled copy`)
    return null
  }
}

function fetchShared(name: PromptName) {
  const pending = inFlight.get(name)
  if (pending) return pending
  const started = fetchPrompt(name).finally(() => inFlight.delete(name))
  inFlight.set(name, started)
  return started
}

/**
 * The template for one part: PostHog's `production` version, cached for 30
 * minutes, kept while a refresh fails, and the code's copy when PostHog has
 * not answered this isolate. A failure is not retried for a minute, whether or
 * not anything was cached.
 */
async function resolvePart(
  part: PromptPart,
  now: number,
): Promise<{ text: string; prompt: ResolvedPrompt }> {
  const cached = cache.get(part.name)
  const fromCache = (c: Cached) => ({
    text: render(c.template),
    prompt: { name: part.name, version: c.version, source: 'posthog' as const },
  })
  const bundled = {
    text: part.bundled,
    prompt: { name: part.name, version: null, source: 'bundled' as const },
  }
  if (cached && (now - cached.fetchedAt < CACHE_TTL_MS || now < cached.retryAt)) {
    return fromCache(cached)
  }
  if (!cached && now < (missedUntil.get(part.name) ?? 0)) return bundled
  const fetched = await fetchShared(part.name)
  if (fetched) {
    const fresh = { ...fetched, fetchedAt: now, retryAt: 0 }
    cache.set(part.name, fresh)
    missedUntil.delete(part.name)
    return fromCache(fresh)
  }
  if (cached) {
    cached.retryAt = now + RETRY_AFTER_FAILURE_MS
    return fromCache(cached)
  }
  missedUntil.set(part.name, now + RETRY_AFTER_FAILURE_MS)
  return bundled
}

/** The system prompt as text, and which version of each part it was. */
export async function resolveSystem(
  system: HostedSystem,
  now = Date.now(),
): Promise<{ text: string; prompts: ResolvedPrompt[] }> {
  const parts = await Promise.all(system.hostedSystem.map((part) => resolvePart(part, now)))
  return { text: parts.map((p) => p.text).join(''), prompts: parts.map((p) => p.prompt) }
}

/** Test hook: forget every cached prompt. */
export function clearPromptCache(): void {
  cache.clear()
  missedUntil.clear()
  inFlight.clear()
}
