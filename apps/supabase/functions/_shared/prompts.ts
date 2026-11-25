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
import { capturing } from './posthog.ts'

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
  'suggest-meals',
  'moderate-submission',
  'import-video-recipe',
  'translate-recipe',
] as const

export type PromptName = (typeof PROMPT_NAMES)[number]

/** A piece of a system prompt: its name in PostHog and the code's own copy. */
export type PromptPart = { name: PromptName; bundled: string }

/** A system prompt still to be resolved, made of one part or more. */
export type HostedSystem = { hostedSystem: PromptPart[] }

/**
 * Why a part went out as the code's copy. Recorded on the generation as
 * `prompt_fallback`, because every miss used to look the same from PostHog:
 * production served the code copy to every call for a month (no key was ever
 * set, and most prompts had no `production` label) and nothing said so.
 */
export type PromptFallback =
  /** `POSTHOG_PROMPTS_API_KEY` is not set. */
  | 'no_key'
  /** 404: no such prompt, or no version carries the `production` label. */
  | 'not_found'
  /** 401 or 403: the key is wrong, expired or lacks `llm_prompt:read`. */
  | 'refused'
  /** Any other status. */
  | 'http_error'
  /** No answer within `FETCH_TIMEOUT_MS`. */
  | 'timeout'
  /** The request never got an answer. */
  | 'network'
  /** An answer that is not JSON, or has no prompt text or no version. */
  | 'invalid'

export type ResolvedPrompt = {
  name: PromptName
  /** The PostHog version, or null for the code's copy. */
  version: number | null
  source: 'posthog' | 'bundled'
  /** Set exactly when `source` is `bundled`. */
  fallback?: PromptFallback
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
 * When a prompt with nothing cached last failed, why, and so when to ask again.
 * Without it, an unlabelled prompt or a PostHog outage made every call wait
 * for its own failed fetch, up to the timeout, before sending the code's copy.
 */
const missedUntil = new Map<PromptName, { until: number; reason: PromptFallback }>()

type Fetched = { template: string; version: number } | { miss: PromptFallback }
/** A fetch already on its way, shared by calls that start while it is out. */
const inFlight = new Map<PromptName, Promise<Fetched>>()

/**
 * Said once per isolate, and only where generations are captured: a missing
 * key is a setting, not an outage, so it would otherwise never be logged.
 */
let warnedNoKey = false
function warnNoKey() {
  if (warnedNoKey || !capturing()) return
  warnedNoKey = true
  console.warn(
    '[prompts] POSTHOG_PROMPTS_API_KEY is not set, so every call sends the code copy of its prompt',
  )
}

async function fetchPrompt(name: PromptName): Promise<Fetched> {
  const key = Deno.env.get('POSTHOG_PROMPTS_API_KEY')?.trim()
  if (!key) {
    warnNoKey()
    return { miss: 'no_key' }
  }
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
      return {
        miss:
          res.status === 404
            ? 'not_found'
            : res.status === 401 || res.status === 403
              ? 'refused'
              : 'http_error',
      }
    }
    // A 200 that is not JSON (an error page from a proxy) is a bad answer, not
    // a lost connection, so it is told apart from the catch below.
    const body = (await res.json().catch(() => null)) as {
      prompt?: unknown
      version?: unknown
    } | null
    if (!body) return { miss: 'invalid' }
    // An answer with no version is not used: every generation it served would
    // name a version nobody can open.
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return { miss: 'invalid' }
    if (typeof body.version !== 'number') return { miss: 'invalid' }
    return { template: body.prompt, version: body.version }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[prompts] ${name}: ${reason}, using the bundled copy`)
    // `AbortSignal.timeout` rejects with a DOMException named TimeoutError.
    return { miss: (error as { name?: string })?.name === 'TimeoutError' ? 'timeout' : 'network' }
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
  const bundled = (fallback: PromptFallback) => ({
    text: part.bundled,
    prompt: { name: part.name, version: null, source: 'bundled' as const, fallback },
  })
  if (cached && (now - cached.fetchedAt < CACHE_TTL_MS || now < cached.retryAt)) {
    return fromCache(cached)
  }
  const missed = missedUntil.get(part.name)
  if (!cached && missed && now < missed.until) return bundled(missed.reason)
  const fetched = await fetchShared(part.name)
  if ('template' in fetched) {
    const fresh = { ...fetched, fetchedAt: now, retryAt: 0 }
    cache.set(part.name, fresh)
    missedUntil.delete(part.name)
    return fromCache(fresh)
  }
  if (cached) {
    cached.retryAt = now + RETRY_AFTER_FAILURE_MS
    return fromCache(cached)
  }
  missedUntil.set(part.name, { until: now + RETRY_AFTER_FAILURE_MS, reason: fetched.miss })
  return bundled(fetched.miss)
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
  warnedNoKey = false
}
