/**
 * Runs SQL against a Supabase project, over whichever transport this machine
 * actually has.
 *
 * The declarative workflow assumes psql and a local Docker stack. On a machine
 * with neither — which is the normal state of this one — there is still a way
 * in: the Management API's query endpoint, the same one the Supabase MCP server
 * and the dashboard SQL editor use, authenticated with the CLI's own access
 * token. That is what makes a bulk loader possible here at all; every other
 * route needs a database password or a service-role key that is not on disk.
 *
 * TWO CONSEQUENCES WORTH KNOWING
 *
 * Statements run through this bypass migrations exactly the way a dashboard
 * edit does, which is what `supabase-drift` exists to catch. Use it for DATA
 * (that is what the loader does) and, for schema, only alongside a committed
 * migration file at the same version.
 *
 * And the endpoint returns the last statement's rows as JSON, so a caller
 * wanting a result should send one statement.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * The project the app is pointed at, rather than a constant in this file. A ref
 * hardcoded here and an app reading a different one from `.env.local` is how a
 * loader ends up filling the wrong catalogue very convincingly.
 */
export function projectRef() {
  if (process.env.SUPABASE_PROJECT_ID) return process.env.SUPABASE_PROJECT_ID

  const env = readFileSync(`${REPO_ROOT}apps/mobile/.env.local`, 'utf8')
  const url = env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  const ref = url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

  if (!ref) {
    throw new Error(
      'No project ref. Set SUPABASE_PROJECT_ID, or point EXPO_PUBLIC_SUPABASE_URL ' +
        'in apps/mobile/.env.local at a hosted project.',
    )
  }
  return ref
}

/**
 * The CLI stores its token in the login keychain rather than in ~/.supabase, so
 * `supabase login` is enough to make this work and there is no second secret to
 * hand around. The env var wins, for CI and for a machine whose keychain is
 * locked.
 */
function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN

  try {
    const token = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
    }).trim()
    if (token) return token
  } catch {
    // Fall through to the message below: an empty keychain and a locked one are
    // the same problem from here, and both are fixed the same way.
  }

  throw new Error('No Supabase access token. Run `supabase login`, or set SUPABASE_ACCESS_TOKEN.')
}

let cached

/** Runs one statement and returns its rows. Throws on a Postgres error. */
export async function runSql(sql) {
  cached ??= { ref: projectRef(), token: accessToken() }

  const res = await fetch(`https://api.supabase.com/v1/projects/${cached.ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cached.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  const text = await res.text()
  if (!res.ok) {
    // The endpoint reports a syntax error as a 400 with the Postgres message in
    // the body, which is the only useful part of it.
    let message = text
    try {
      const parsed = JSON.parse(text)
      message = parsed.message ?? parsed.error ?? text
    } catch {
      /* the body was not JSON; the raw text is what there is */
    }
    throw new Error(`SQL failed (${res.status}): ${message}`)
  }

  return JSON.parse(text)
}

/** A SQL string literal. Used for the JSON payload the loader is handed. */
export function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}
