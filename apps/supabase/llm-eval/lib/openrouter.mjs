/**
 * The seam between the app's model code and the model under test.
 *
 * The app's `chatJSON` posts to OpenRouter with the production model, the
 * production parameters and the production timeout. This wraps `fetch` so that,
 * inside a case, the same request goes out with only `model` changed (plus any
 * `--body` overrides), and everything about the exchange is written down: what
 * was sent, what came back, how long it took, what it cost.
 *
 * Swapping the model at the transport rather than in a copy of the request is
 * the point. The prompt, `max_tokens`, `temperature`, `response_format`,
 * `reasoning`, the single retry and the shaping of the answer are all the app's.
 *
 * A model named `claude:<model>` is answered by Claude Code (`claude -p`)
 * instead of OpenRouter; see `completeWithClaude` for what does not carry over.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { completeWithClaude } from './claude.mjs'

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODELS_URL = 'https://openrouter.ai/api/v1/models'
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url))

const store = new AsyncLocalStorage()

/** Statuses that say the provider is busy: wait and ask again. */
const RETRYABLE = new Set([429, 529])
/** Statuses that say the credentials or the account, not the model, failed. */
const NOT_THE_MODEL = new Set([401, 402, 403])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The key, from the environment or from `apps/supabase/llm-eval/.env`
 * (gitignored; this repo is public).
 *
 * Supabase's secrets endpoint returns a digest rather than the key, so the
 * production key cannot be read back from the project: it has to be put here
 * by somebody who holds it.
 */
export function loadKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const line = readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('OPENROUTER_API_KEY='))
    const value = line
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^["']|["']$/g, '')
    if (value) {
      process.env.OPENROUTER_API_KEY = value
      return value
    }
  } catch {}
  return null
}

let catalogue

/** What OpenRouter says about a slug: whether it exists, sees images, does JSON. */
export async function describeModel(slug) {
  catalogue ??= fetch(MODELS_URL)
    .then((res) => res.json())
    .then((body) => new Map((body.data ?? []).map((m) => [m.id, m])))
  const model = (await catalogue).get(slug)
  if (!model) return { slug, found: false }
  const params = model.supported_parameters ?? []
  return {
    slug,
    found: true,
    name: model.name,
    vision: (model.architecture?.input_modalities ?? []).includes('image'),
    jsonMode: params.includes('response_format') || params.includes('structured_outputs'),
    reasoningToggle: params.includes('reasoning') || params.includes('include_reasoning'),
    contextLength: model.context_length,
    pricing: {
      prompt: Number(model.pricing?.prompt ?? 0),
      completion: Number(model.pricing?.completion ?? 0),
    },
  }
}

/** Run `fn` with every OpenRouter call inside it sent to `ctx.model`. */
export function withModel(ctx, fn) {
  return store.run(ctx, fn)
}

/** Data URLs are megabytes of base64 nobody reads in a log. */
function redact(messages) {
  return (messages ?? []).map((m) =>
    Array.isArray(m.content)
      ? {
          ...m,
          content: m.content.map((part) =>
            part.type === 'image_url'
              ? {
                  type: 'image_url',
                  image_url: `[image, ${Math.round((part.image_url?.url?.length ?? 0) / 1365)} KB]`,
                }
              : part,
          ),
        }
      : m,
  )
}

export function installInterceptor() {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    const ctx = store.getStore()
    if (url !== CHAT_URL || !ctx) return realFetch(input, init)

    const sent = JSON.parse(init.body)
    const body = {
      ...sent,
      ...ctx.body,
      model: ctx.model,
      // Accounting only: asks OpenRouter to put the cost in `usage`.
      usage: { include: true },
    }
    const call = {
      appModel: sent.model,
      model: ctx.model,
      maxTokens: body.max_tokens,
      messages: redact(sent.messages),
      throttled: 0,
      // Time spent waiting out a rate limit, which is not the model's latency.
      waitedMs: 0,
    }
    ctx.calls.push(call)
    const started = Date.now()
    const reply = (text, status) => {
      call.ms = Date.now() - started
      call.status = status
      readReply(call, text)
      return new Response(text, { status, headers: { 'content-type': 'application/json' } })
    }

    const wait = async (attempt) => {
      call.throttled += 1
      const ms = 2000 * 2 ** attempt
      call.waitedMs += ms
      await sleep(ms)
    }

    // `claude:<model>`: the same request answered by Claude Code instead. A
    // model failure comes back as a 502 so the app's own retry treats it as a
    // provider hiccup, as it would one from OpenRouter. Rate limits are waited
    // out, and a failure that is the machine's rather than the model's (no
    // `claude` binary, a lapsed login, a spent usage limit) is marked so the
    // case is not scored as the model's zero.
    if (ctx.transport === 'claude') {
      for (let attempt = 0; ; attempt++) {
        try {
          const json = await completeWithClaude({
            model: ctx.model,
            request: sent,
            timeoutMs: ctx.timeoutMs,
            effort: ctx.body.effort,
          })
          return reply(JSON.stringify(json), 200)
        } catch (error) {
          if (error?.name === 'TimeoutError') {
            call.ms = Date.now() - started
            call.error = error.message
            throw error
          }
          if (RETRYABLE.has(error.status) && attempt < 5) {
            await wait(attempt)
            continue
          }
          if (error.harness || RETRYABLE.has(error.status) || NOT_THE_MODEL.has(error.status)) {
            call.harnessError = error.message
          }
          return reply(JSON.stringify({ error: { message: error.message } }), 502)
        }
      }
    }

    // A 429 here is the eval's own concurrency, not the model, so it is waited
    // out rather than charged to the answer. Each attempt gets the production
    // timeout afresh for the same reason; the app's own signal is replaced.
    for (let attempt = 0; ; attempt++) {
      let res
      try {
        res = await realFetch(CHAT_URL, {
          method: 'POST',
          headers: init.headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(ctx.timeoutMs),
        })
      } catch (error) {
        call.ms = Date.now() - started
        call.error =
          error?.name === 'TimeoutError' ? `timed out after ${ctx.timeoutMs} ms` : String(error)
        // The app retries a timeout as a DOMException; keep that shape.
        throw error?.name === 'TimeoutError' ? new DOMException(call.error, 'TimeoutError') : error
      }
      if (res.status === 429 && attempt < 5) {
        await res.body?.cancel()
        await wait(attempt)
        continue
      }
      // A bad key, spent credit or a still-throttled account is the harness's
      // problem: a key with a spending limit that runs out mid-run would
      // otherwise score every remaining case 0.
      if (NOT_THE_MODEL.has(res.status) || res.status === 429) {
        call.harnessError = `OpenRouter ${res.status}`
      }
      return reply(await res.text(), res.status)
    }
  }
}

/** What came back, written onto the call record. */
function readReply(call, text) {
  try {
    const json = JSON.parse(text)
    const choice = json.choices?.[0]
    call.content = choice?.message?.content ?? null
    call.finish = choice?.finish_reason ?? null
    call.provider = json.provider ?? null
    call.usage = json.usage ?? null
    if (json.error) call.error = json.error.message ?? JSON.stringify(json.error)
  } catch {
    call.error = text.slice(0, 500)
  }
}

/** Dollars for a list of calls: OpenRouter's own figure, else the list price. */
export function costOf(calls, pricing) {
  let total = 0
  for (const call of calls) {
    const usage = call.usage ?? {}
    if (typeof usage.cost === 'number') total += usage.cost
    else if (pricing)
      total +=
        (usage.prompt_tokens ?? 0) * pricing.prompt +
        (usage.completion_tokens ?? 0) * pricing.completion
  }
  return total
}
