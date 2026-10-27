import { assert, assertEquals } from 'jsr:@std/assert@1'
import { ICON_INSTRUCTION } from './icons.ts'
import { generationEvent } from './posthog.ts'
import { BUNDLED_PROMPTS } from './prompt-catalog.ts'
import {
  clearPromptCache,
  hostedSystem,
  PROMPT_NAMES,
  render,
  resolveSystem,
  templateOf,
} from './prompts.ts'

const realFetch = globalThis.fetch

/** Answers prompt fetches from `answer`, counting them. */
function fakePostHog(answer: (name: string) => Response | Promise<Response>) {
  const asked: string[] = []
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)
    const name = decodeURIComponent(url.match(/llm_prompts\/name\/([^/]+)\//)?.[1] ?? '')
    asked.push(name)
    return Promise.resolve(answer(name))
  }) as typeof fetch
  return asked
}

function withKey(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set('POSTHOG_PROMPTS_API_KEY', 'phx_test')
    clearPromptCache()
    try {
      await fn()
    } finally {
      globalThis.fetch = realFetch
      Deno.env.delete('POSTHOG_PROMPTS_API_KEY')
      clearPromptCache()
    }
  }
}

const hosted = (prompt: string, version: number) =>
  new Response(JSON.stringify({ prompt, version }), { status: 200 })

Deno.test('every prompt name has a copy in the code', () => {
  for (const name of PROMPT_NAMES) assert(BUNDLED_PROMPTS[name]?.trim(), name)
})

// What PostHog holds must render back into exactly what the code would send,
// or moving the label to the uploaded version changes the prompt.
Deno.test('every uploaded template renders back into the code copy', () => {
  for (const name of PROMPT_NAMES) {
    const bundled = BUNDLED_PROMPTS[name]
    assertEquals(render(templateOf(bundled)), bundled, name)
  }
})

Deno.test('the icon list is a variable, not text in PostHog', () => {
  const template = templateOf(BUNDLED_PROMPTS['describe-meal'])
  assert(template.includes('{{icon_instruction}}'))
  assert(!template.includes(ICON_INSTRUCTION))
})

Deno.test('with no key the code copy is sent and PostHog is never asked', async () => {
  Deno.env.delete('POSTHOG_PROMPTS_API_KEY')
  clearPromptCache()
  const asked = fakePostHog(() => hosted('never', 1))
  try {
    const { text, prompts } = await resolveSystem(
      hostedSystem({ name: 'pick-candidate', bundled: 'the code copy' }),
    )
    assertEquals(text, 'the code copy')
    assertEquals(prompts, [{ name: 'pick-candidate', version: null, source: 'bundled' }])
    assertEquals(asked, [])
  } finally {
    globalThis.fetch = realFetch
  }
})

Deno.test(
  'the production version is sent, with the icon list filled in',
  withKey(async () => {
    fakePostHog(() => hosted('Hosted. {{icon_instruction}}', 4))
    const { text, prompts } = await resolveSystem(
      hostedSystem({ name: 'describe-meal', bundled: 'the code copy' }),
    )
    assertEquals(text, `Hosted. ${ICON_INSTRUCTION}`)
    assertEquals(prompts, [{ name: 'describe-meal', version: 4, source: 'posthog' }])
  }),
)

Deno.test(
  'a photo with a note is two prompts, joined in order',
  withKey(async () => {
    fakePostHog((name) => hosted(name === 'analyse-photo' ? 'Photo.' : ' Note.', 2))
    const { text, prompts } = await resolveSystem(
      hostedSystem(
        { name: 'analyse-photo', bundled: 'a' },
        { name: 'analyse-photo-note', bundled: 'b' },
      ),
    )
    assertEquals(text, 'Photo. Note.')
    assertEquals(
      prompts.map((p) => p.name),
      ['analyse-photo', 'analyse-photo-note'],
    )
  }),
)

Deno.test(
  'an error, an empty prompt or a network failure falls back to the code copy',
  withKey(async () => {
    for (const answer of [
      () => new Response('nope', { status: 404 }),
      () => hosted('  ', 3),
      () => Promise.reject(new TypeError('network down')),
    ]) {
      clearPromptCache()
      fakePostHog(answer)
      const { text, prompts } = await resolveSystem(
        hostedSystem({ name: 'review-recipe', bundled: 'the code copy' }),
      )
      assertEquals(text, 'the code copy')
      assertEquals(prompts[0].source, 'bundled')
    }
  }),
)

Deno.test(
  'a fetched prompt is cached, and kept through a failed refresh',
  withKey(async () => {
    const asked = fakePostHog(() => hosted('v1', 1))
    const system = hostedSystem({ name: 'suggest-meals', bundled: 'code' })
    await resolveSystem(system, 0)
    await resolveSystem(system, 10 * 60 * 1000)
    assertEquals(asked.length, 1)

    // Past the 30 minutes, PostHog is asked again; when it fails, the cached
    // version is still what goes out, and it is not asked again for a minute.
    const failing = fakePostHog(() => new Response('', { status: 500 }))
    const later = 31 * 60 * 1000
    assertEquals((await resolveSystem(system, later)).text, 'v1')
    assertEquals((await resolveSystem(system, later + 30_000)).text, 'v1')
    assertEquals(failing.length, 1)
  }),
)

Deno.test('a generation names its prompt and version', () => {
  const base = {
    span: 'analyse_photo' as const,
    model: 'anthropic/claude-haiku-5.5',
    startedAt: 0,
    endedAt: 1,
    maxTokens: 2400,
    attempt: 0,
  }
  const one = generationEvent({ distinctId: 'u', feature: 'scan-meal' }, 't', {
    ...base,
    prompts: [{ name: 'analyse-photo', version: 3, source: 'posthog' }],
  }).properties
  assertEquals(one.$ai_prompt_name, 'analyse-photo')
  assertEquals(one.$ai_prompt_version, 3)
  assertEquals(one.prompt_source, 'posthog')
  assertEquals(one.prompt_parts, undefined)

  const two = generationEvent({ distinctId: 'u', feature: 'scan-meal' }, 't', {
    ...base,
    prompts: [
      { name: 'analyse-photo', version: 3, source: 'posthog' },
      { name: 'analyse-photo-note', version: null, source: 'bundled' },
    ],
  }).properties
  assertEquals(two.prompt_source, 'mixed')
  assertEquals(two.prompt_parts, 'analyse-photo@3+analyse-photo-note@bundled')
})
