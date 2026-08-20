/**
 * The only way a job talks to Postgres.
 *
 * RPCs, AND DELIBERATELY NOTHING ELSE. There is no `from('table')` here and no
 * supabase-js client to provide one. A job's SQL therefore has to live in
 * `apps/supabase/schemas` as a `security definer` function granted to
 * `service_role`, where it is reviewed, tested by pgTAP and covered by the
 * grant checks the `migrations` workflow runs — rather than as an ad-hoc query
 * inside a Worker that nothing in the database's own test suite can see.
 *
 * It also keeps the division CLAUDE.md already draws: Postgres owns the
 * numbers and the rules, and a job is only the part that has to reach
 * something Postgres cannot. Enforced by what is reachable rather than by
 * anybody remembering.
 *
 * Plain `fetch` rather than a client library, because two RPC calls do not
 * need a dependency, a bundle or a `nodejs_compat` flag.
 */
import type { Env } from './env.ts'

export type Rpc = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>

export function postgres(env: Env): Rpc {
  // Said plainly, because nothing else would say it. A secret is not declared
  // in `wrangler.jsonc`, so a Worker deployed before `wrangler secret put` has
  // been run deploys perfectly and then sends `Bearer undefined` — which
  // PostgREST answers with an ordinary 401, indistinguishable in a log from a
  // key that is merely wrong. This is the most likely thing to be missing the
  // first time this Worker runs in a new environment.
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set on this Worker: run `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`',
    )
  }

  return async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args ?? {}),
    })

    // The body is read either way: PostgREST puts the useful part of a failure
    // (the constraint, the missing function, the argument it could not match)
    // in the response rather than in the status, and a job whose error says
    // only "400" is a job nobody can fix from the log.
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`rpc ${fn} failed: ${response.status} ${body.slice(0, 500)}`)
    }

    // A function returning `void` answers 204 with nothing in it, which
    // `JSON.parse` does not survive.
    return (body ? JSON.parse(body) : null) as T
  }
}
