// PostHog AI observability for every model call the edge functions make.
//
// Each OpenRouter request becomes one `$ai_generation` event in the RiceCal
// PostHog project: model, tokens, OpenRouter's reported cost, latency, status,
// and the prompt and answer text. Requests from one invocation share a trace,
// so a scan's vision call, its catalogue pick and its nutrition estimate read as
// one story, filed under the same account (`distinct_id` is the Supabase uuid
// the app identifies PostHog with) and, when the app sent its session header,
// linked to that session's events and replay.
//
// Content never leaves the function. A prompt carries the person's own meal
// description, photo or recipe, and the answer is their diary entry; the
// privacy policy promises analytics holds no diary content and that deleting
// an account deletes its diary, which a copy in PostHog would break. So the
// events carry metadata only, and `$ai_input` / `$ai_output_choices` hold fixed
// placeholders so PostHog's trace view still renders. Scan quality is judged
// from Postgres (`food_scan_items`) and the model eval, as before.
//
// Never throws, and never holds a response: each event is sent in the
// background through `EdgeRuntime.waitUntil`.

import type { ResolvedPrompt } from './prompts.ts'

/**
 * The public, write-only ingestion key the app and the website ship too, so it
 * is checked in rather than kept as a function secret.
 */
const POSTHOG_PROJECT_TOKEN = 'phc_oTQVxPmCyJK7aa2vqiYpXfis7uyvXfyq6haETFw7cQj7'
const CAPTURE_URL = 'https://us.i.posthog.com/batch/'

/** What each model call is for, as `$ai_span_name`. One per prompt in the code. */
export type AiSpan =
  | 'analyse_photo'
  | 'describe_meal'
  | 'pick_candidate'
  | 'estimate_nutrition'
  | 'interpret_instruction'
  | 'read_recipe_photo'
  | 'describe_recipe'
  | 'review_recipe'
  | 'suggest_meals'
  | 'moderate_submission'

/** Who and what an invocation's generations belong to. */
export type AiContext = {
  /** The Supabase account uuid, or a fixed name for system work (moderation). */
  distinctId: string
  /** The edge function, e.g. `scan-meal`. */
  feature: string
  /** The app's PostHog session (`X-POSTHOG-SESSION-ID`), when it sent one. */
  sessionId?: string | null
  /** Work done for the service rather than a person: creates no PostHog person. */
  system?: boolean
}

export type OpenRouterUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  /** What OpenRouter charged to credits. Under BYOK, only its fee. */
  cost?: number
  /** True when our own provider key paid for the inference. */
  is_byok?: boolean
  /** Under BYOK, what the provider bills us directly. */
  cost_details?: { upstream_inference_cost?: number }
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }
}

export type Generation = {
  span: AiSpan
  model: string
  startedAt: number
  endedAt: number
  httpStatus?: number
  usage?: OpenRouterUsage
  finishReason?: string
  maxTokens: number
  /** Absent for a model that takes none (Claude Haiku 5.5). */
  temperature?: number
  /** 0 for the first request, counting up through the fallback and its retry. */
  attempt: number
  /**
   * True when the fallback answers because the primary failed in this same
   * call. False for the primary, and for the fallback when the primary was
   * never asked (switched off, or the BYOK breaker tripped). With `attempt`, it
   * tells a fallback from a retry.
   */
  isBackupModel?: boolean
  /** Which hosted prompt, and which version of it, the system message was. */
  prompts?: ResolvedPrompt[]
  error?: string
}

/**
 * The app's PostHog session id from the request, when it looks like one. The
 * SDK adds the header to requests for the Supabase host (`addTracingHeaders`).
 */
export function readSessionId(req: Request): string | null {
  const value = req.headers.get('X-POSTHOG-SESSION-ID')?.trim()
  return value && /^[0-9a-f-]{32,40}$/i.test(value) ? value : null
}

/**
 * Off on a local stack, where a real OpenRouter key would otherwise file
 * development scans in the production project.
 */
function enabled(): boolean {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  return url.startsWith('https://') && !/localhost|127\.0\.0\.1|kong/.test(url)
}

const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** The `$ai_generation` event for one request. Exported for its test. */
export function generationEvent(context: AiContext, traceId: string, generation: Generation) {
  const usage = generation.usage ?? {}
  const properties: Record<string, unknown> = {
    $ai_trace_id: traceId,
    $ai_span_name: generation.span,
    $ai_model: generation.model,
    $ai_provider: 'openrouter',
    $ai_base_url: 'https://openrouter.ai/api/v1',
    $ai_input: [{ role: 'user', content: '[meal input withheld]' }],
    $ai_output_choices: generation.error
      ? []
      : [{ role: 'assistant', content: '[model answer withheld]' }],
    $ai_latency: (generation.endedAt - generation.startedAt) / 1000,
    $ai_max_tokens: generation.maxTokens,
    $ai_stream: false,
    $ai_is_error: Boolean(generation.error),
    feature: context.feature,
    attempt: generation.attempt,
    is_backup_model: generation.isBackupModel ?? false,
    // Sent from Supabase's servers, so the request IP is a data centre's.
    // GeoIP would stamp that location on the event and on the person,
    // overwriting where the person actually is.
    $geoip_disable: true,
  }
  if (context.system) properties.$process_person_profile = false
  if (context.sessionId) {
    properties.$session_id = context.sessionId
    properties.$ai_session_id = context.sessionId
  }
  if (generation.temperature !== undefined) properties.$ai_temperature = generation.temperature
  if (generation.httpStatus !== undefined) properties.$ai_http_status = generation.httpStatus
  if (generation.finishReason) properties.finish_reason = generation.finishReason
  if (typeof usage.is_byok === 'boolean') properties.byok = usage.is_byok
  const input = finite(usage.prompt_tokens)
  const output = finite(usage.completion_tokens)
  const cached = finite(usage.prompt_tokens_details?.cached_tokens)
  const written = finite(usage.prompt_tokens_details?.cache_write_tokens)
  const charged = finite(usage.cost)
  // Under BYOK, OpenRouter's `cost` is only its own fee (often 0), and the
  // inference is billed to us by the provider. Without adding that back, every
  // Haiku call would read as free.
  const upstream = usage.is_byok ? finite(usage.cost_details?.upstream_inference_cost) : undefined
  if (input !== undefined) properties.$ai_input_tokens = input
  if (output !== undefined) properties.$ai_output_tokens = output
  if (cached !== undefined) properties.$ai_cache_read_input_tokens = cached
  if (written !== undefined) properties.$ai_cache_creation_input_tokens = written
  if (charged !== undefined || upstream !== undefined) {
    // OpenRouter reports what was charged, so PostHog should not re-price it.
    properties.$ai_total_cost_usd = (charged ?? 0) + (upstream ?? 0)
    properties.$ai_cost_passthrough = true
  }
  const [prompt, ...more] = generation.prompts ?? []
  if (prompt) {
    // Links the generation to its prompt in PostHog prompt management. The
    // code's own copy has no PostHog version, so only its name is sent.
    properties.$ai_prompt_name = prompt.name
    if (prompt.version !== null) properties.$ai_prompt_version = prompt.version
    const sources = new Set(generation.prompts?.map((p) => p.source))
    properties.prompt_source = sources.size > 1 ? 'mixed' : prompt.source
    // The photo prompt with a note is two prompts; both versions, in order.
    if (more.length) {
      properties.prompt_parts = (generation.prompts ?? [])
        .map((p) => `${p.name}@${p.version ?? 'bundled'}`)
        .join('+')
    }
  }
  if (generation.error) properties.$ai_error = generation.error.slice(0, 300)
  return {
    event: '$ai_generation',
    distinct_id: context.distinctId,
    timestamp: new Date(generation.startedAt).toISOString(),
    properties,
  }
}

function inBackground(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
}

/** Send one generation. Never throws and never delays the caller. */
export function captureGeneration(context: AiContext, traceId: string, generation: Generation) {
  if (!enabled()) return
  const event = generationEvent(context, traceId, generation)
  inBackground(
    fetch(CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_PROJECT_TOKEN, batch: [event] }),
    })
      .then((res) => {
        if (!res.ok) console.error('[posthog] ai capture failed:', res.status)
      })
      .catch((error) => console.error('[posthog] ai capture failed:', String(error))),
  )
}
