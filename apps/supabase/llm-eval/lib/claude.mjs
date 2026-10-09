/**
 * Claude Code in programmatic mode (`claude -p`), used two ways: as the judge,
 * and as a transport for a model under test named `claude:<model>`.
 *
 * Every call is one process with no tools, no saved session and no project
 * context (`--safe-mode` skips CLAUDE.md, hooks, plugins and MCP). Input goes in
 * as a stream-json user message so images can travel with it.
 */

import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const BASE_ARGS = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--tools',
  '',
  '--no-session-persistence',
  '--safe-mode',
  '--strict-mcp-config',
]

/**
 * Run one `claude -p` and resolve with its final `result` event.
 *
 * `content` is a list of Anthropic content blocks. Rejects on a timeout, a
 * crash, or a result marked as an error.
 */
export function runClaude({ model, system, content, timeoutMs, extraArgs = [] }) {
  const args = [...BASE_ARGS, '--model', model, '--system-prompt', system, ...extraArgs]
  const input = `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      err += d
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      // No `claude` on PATH, most likely. Not the model's failure.
      reject(Object.assign(error, { harness: true }))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        return reject(new DOMException(`claude -p timed out after ${timeoutMs} ms`, 'TimeoutError'))
      }
      const result = out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .findLast((event) => event?.type === 'result')
      if (!result) return reject(new Error(`claude -p exited ${code}: ${(err || out).slice(-400)}`))
      if (result.is_error) {
        return reject(
          new Error(`claude -p failed: ${String(result.result ?? result.subtype).slice(0, 400)}`),
        )
      }
      resolve(result)
    })
    child.stdin.end(input)
  })
}

/**
 * List prices in dollars per million tokens, from the Claude API pricing table
 * (prompts under 100K tokens). Claude Code's own `total_cost_usd` is not used for
 * these: a CLI that does not recognise a newer model id prices it at a fallback
 * rate, which put Haiku 5.5 at about fifty times its real cost.
 */
const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

/** Per-token prices for a model, in the shape OpenRouter's catalogue gives. */
export function pricingOf(model) {
  const price = PRICES[model]
  if (!price) return null
  return {
    prompt: price.input / 1e6,
    completion: price.output / 1e6,
    cacheRead: (price.input * 0.1) / 1e6,
    cacheWrite: (price.input * 1.25) / 1e6,
  }
}

/**
 * What one call cost at list price: cache writes at 1.25x (5 minutes) or 2x
 * (1 hour) the input rate, cache reads at 0.1x, thinking billed as output.
 * Null for a model not in the table, and the caller falls back to the CLI's own
 * figure.
 */
export function listPrice(model, usage) {
  const price = PRICES[model]
  if (!price) return null
  const created = usage.cache_creation ?? {}
  const oneHour = created.ephemeral_1h_input_tokens ?? 0
  const fiveMin =
    created.ephemeral_5m_input_tokens ?? (usage.cache_creation_input_tokens ?? 0) - oneHour
  const input =
    (usage.input_tokens ?? 0) +
    fiveMin * 1.25 +
    oneHour * 2 +
    (usage.cache_read_input_tokens ?? 0) * 0.1
  return (input * price.input + (usage.output_tokens ?? 0) * price.output) / 1e6
}

/** OpenAI-shaped chat messages, as `chatJSON` sends them, to Claude's shape. */
function toClaude(messages) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n')
  const content = []
  for (const m of messages.filter((x) => x.role !== 'system')) {
    const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    for (const part of parts) {
      if (part.type === 'image_url') {
        const [, mediaType, data] = part.image_url.url.match(/^data:([^;]+);base64,(.*)$/s) ?? []
        if (!data) throw new Error('only data: image URLs can be sent through claude -p')
        content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
      } else if (m.role === 'assistant') {
        content.push({ type: 'text', text: `[Your earlier reply]\n${part.text}` })
      } else {
        content.push({ type: 'text', text: part.text })
      }
    }
  }
  return { system, content }
}

/**
 * Answer one of the app's OpenRouter requests through `claude -p`, returning the
 * body OpenRouter would have.
 *
 * What does not carry over: `temperature`, `max_tokens` and `response_format`
 * have no `claude -p` flag, so the model runs at its defaults and JSON comes
 * from the prompt alone (every app prompt asks for JSON only, and `chatJSON`
 * strips a markdown fence). Thinking cannot be switched off through `claude -p`
 * (the app sends `reasoning: {enabled: false}`); `effort` in `--body` becomes
 * `--effort`, and `low` is the nearest equivalent. Claude Code also adds roughly
 * 600 tokens of its own to every request, which the app's calls would not carry.
 */
export async function completeWithClaude({ model, request, timeoutMs, effort }) {
  const { system, content } = toClaude(request.messages)
  const result = await runClaude({
    model,
    system,
    content,
    timeoutMs,
    extraArgs: effort ? ['--effort', effort] : [],
  })
  const usage = result.usage ?? {}
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const prompt = (usage.input_tokens ?? 0) + cacheRead + cacheWrite
  const price = PRICES[model]
  return {
    model,
    provider: 'claude-code',
    choices: [
      { message: { role: 'assistant', content: result.result ?? '' }, finish_reason: 'stop' },
    ],
    // OpenRouter's usage shape, so one function totals both transports.
    usage: {
      prompt_tokens: prompt,
      prompt_tokens_details: { cached_tokens: cacheRead, cache_write_tokens: cacheWrite },
      completion_tokens: usage.output_tokens ?? 0,
      completion_tokens_details: {
        reasoning_tokens: usage.output_tokens_details?.thinking_tokens ?? 0,
      },
      cost: listPrice(model, usage) ?? result.total_cost_usd ?? 0,
      cost_uncached: price
        ? (prompt * price.input + (usage.output_tokens ?? 0) * price.output) / 1e6
        : null,
    },
  }
}
