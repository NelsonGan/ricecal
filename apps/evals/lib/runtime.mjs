/**
 * Loads the edge functions' own model code into Node, so every case runs the
 * prompt, the request and the shaping the app actually ships.
 *
 * The functions are Deno. Two things stand between them and Node, and both are
 * bridged here rather than by copying code: a harness with its own copy of a
 * prompt grades a prompt nobody ships.
 *
 * - `Deno.env` is read at call time (and once at load, for the default model),
 *   so a shim over `process.env` is enough.
 * - `social/review.ts` imports `r2.ts`, which imports `aws4fetch` through the
 *   function's import map. Nothing the moderation call does touches storage, so
 *   the package resolves to a stub that throws if anything ever does.
 *
 * Node strips the TypeScript itself (Node 24 does this unflagged).
 */

import { registerHooks } from 'node:module'

const FUNCTIONS = new URL('../../supabase/functions/', import.meta.url)

const STUBS = {
  aws4fetch:
    'export class AwsClient { constructor() { throw new Error("object storage is stubbed in the eval") } }',
}

let loaded

export async function loadApp() {
  if (loaded) return loaded

  // Mock mode is on whenever the key is missing or MOCK_AI is set, and a mocked
  // answer graded as a model's would be a score for a fixture.
  delete process.env.MOCK_AI
  delete process.env.SUPABASE_URL
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

  globalThis.Deno ??= { env: { get: (name) => process.env[name] } }

  registerHooks({
    resolve(specifier, context, next) {
      if (specifier in STUBS && context.parentURL?.startsWith(FUNCTIONS.href)) {
        return {
          url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`,
          shortCircuit: true,
        }
      }
      return next(specifier, context)
    },
  })

  const at = (path) => new URL(path, FUNCTIONS).href
  const [llm, recipe, suggest, entitlement, icons, social] = await Promise.all([
    import(at('_shared/llm.ts')),
    import(at('_shared/recipe.ts')),
    import(at('_shared/suggest.ts')),
    import(at('_shared/entitlement.ts')),
    import(at('_shared/icons.ts')),
    import(at('social/review.ts')),
  ])
  if (llm.mockActive()) throw new Error('the app code is in mock mode; refusing to grade a fixture')

  loaded = { llm, recipe, suggest, entitlement, icons, social }
  return loaded
}
