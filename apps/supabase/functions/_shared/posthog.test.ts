import { assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { generationEvent, readSessionId } from './posthog.ts'

const generation = {
  span: 'analyse_photo' as const,
  model: 'qwen/qwen3.7-flash',
  startedAt: 1_000,
  endedAt: 3_500,
  httpStatus: 200,
  usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.0004 },
  finishReason: 'stop',
  maxTokens: 2000,
  temperature: 0.2,
  attempt: 0,
}

Deno.test('a generation carries model, tokens, real cost and the trace, never content', () => {
  const event = generationEvent(
    { distinctId: 'user-1', feature: 'scan-meal', sessionId: '01a1-session' },
    'trace-1',
    generation,
  )
  assertEquals(event.event, '$ai_generation')
  assertEquals(event.distinct_id, 'user-1')
  const p = event.properties
  assertEquals(p.$ai_trace_id, 'trace-1')
  assertEquals(p.$ai_span_name, 'analyse_photo')
  assertEquals(p.$ai_latency, 2.5)
  assertEquals(p.$ai_input_tokens, 900)
  assertEquals(p.$ai_total_cost_usd, 0.0004)
  assertEquals(p.$ai_cost_passthrough, true)
  assertEquals(p.$session_id, '01a1-session')
  assertEquals(p.$ai_is_error, false)
  assertEquals(p.$ai_input, [{ role: 'user', content: '[meal input withheld]' }])
  assertFalse('$process_person_profile' in p)
  assertEquals(p.$geoip_disable, true)
})

Deno.test('a BYOK call costs what the provider billed, plus any OpenRouter fee', () => {
  const event = generationEvent({ distinctId: 'user-1', feature: 'scan-meal' }, 'trace-3', {
    ...generation,
    model: 'anthropic/claude-haiku-5.5',
    temperature: undefined,
    usage: {
      prompt_tokens: 900,
      completion_tokens: 120,
      cost: 0,
      is_byok: true,
      cost_details: { upstream_inference_cost: 0.00015 },
    },
  })
  const p = event.properties
  assertEquals(p.$ai_total_cost_usd, 0.00015)
  assertEquals(p.byok, true)
  assertFalse('$ai_temperature' in p)
})

Deno.test('a credits call costs what OpenRouter charged, once', () => {
  const event = generationEvent({ distinctId: 'user-1', feature: 'scan-meal' }, 'trace-4', {
    ...generation,
    usage: {
      cost: 0.0004,
      is_byok: false,
      cost_details: { upstream_inference_cost: 0.0004 },
    },
  })
  assertEquals(event.properties.$ai_total_cost_usd, 0.0004)
  assertEquals(event.properties.byok, false)
  assertEquals(event.properties.$ai_temperature, 0.2)
})

Deno.test('system work creates no person, and a failure is marked as one', () => {
  const event = generationEvent(
    { distinctId: 'ricecal-moderation', feature: 'social', system: true },
    'trace-2',
    { ...generation, error: 'OpenRouter 503: overloaded' },
  )
  assertEquals(event.properties.$process_person_profile, false)
  assertEquals(event.properties.$ai_is_error, true)
  assertEquals(event.properties.$ai_output_choices, [])
})

Deno.test('only a UUID-shaped session header is trusted', () => {
  const ok = new Request('https://x', {
    headers: { 'X-POSTHOG-SESSION-ID': '01a12da7-b2c1-7422-b4f8-047d0b367593' },
  })
  const bad = new Request('https://x', { headers: { 'X-POSTHOG-SESSION-ID': '<script>' } })
  assertEquals(readSessionId(ok), '01a12da7-b2c1-7422-b4f8-047d0b367593')
  assertEquals(readSessionId(bad), null)
})
