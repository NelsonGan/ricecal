/**
 * The Supabase Management API, and the one credential this machine has for it.
 *
 * Split out of `sql.mjs` when a second caller appeared. The SQL endpoint is one
 * route on this API; the auth configuration is another, and both authenticate
 * the same way — with the CLI's own access token rather than a service-role key
 * or a database password, neither of which is on disk here.
 */

import { execFileSync } from 'node:child_process'

/**
 * The CLI stores its token in the login keychain rather than in ~/.supabase, so
 * `supabase login` is enough to make this work and there is no second secret to
 * hand around. The env var wins, for CI and for a machine whose keychain is
 * locked.
 */
export function accessToken() {
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

/**
 * One request to `https://api.supabase.com/v1/...`, with the error body read.
 *
 * A failure here answers with JSON describing what was wrong with the payload —
 * which field, and why — and throwing the status alone discards the only part
 * worth reading.
 */
export async function managementFetch(path, init = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      const parsed = JSON.parse(text)
      message = parsed.message ?? parsed.error ?? text
    } catch {
      /* the body was not JSON; the raw text is what there is */
    }
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${res.status}): ${message}`)
  }

  return text ? JSON.parse(text) : null
}
