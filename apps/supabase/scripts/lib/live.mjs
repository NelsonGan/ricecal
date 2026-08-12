/**
 * Drives the DEPLOYED edge functions the way the app drives them, from a script.
 *
 * The offline harness beside this one (`eval-prompts.ts`) grades a prompt by
 * importing it and calling the model directly. That answers "does the model
 * read this sentence correctly" and nothing else: it never uploads a photo,
 * never searches the catalogue, never runs the verifier or the ratio gate, and
 * never writes a row. Most of what goes wrong with a scan goes wrong in exactly
 * those parts.
 *
 * So this file is the other half — the SHIPPED path, end to end, with the
 * cascade's own `debug: true` trace coming back on every call. What it costs is
 * a session, because every one of these functions authenticates its caller.
 *
 * THE SESSION
 *
 * `.secrets/eval.json` holds an email and a PASSWORD for a throwaway account,
 * and the harness signs in with them. That is deliberate, and it is the second
 * design: the first read a refresh token out of the running app, and it lasted
 * one run. Supabase rotates a refresh token on use and revokes the chain when
 * an old one is presented again — so the app refreshing on its own schedule and
 * the script refreshing on its own killed each other's sessions, and the
 * symptom was `refresh_token_already_used` on a token written to disk sixty
 * seconds earlier. Password sign-in gives this harness a session of its own,
 * and the app can go on using the same account without either noticing.
 *
 * The account has no magic-link route and is not reachable from a sign-in
 * screen; to set it up, set `email` here to a throwaway address that has signed
 * in once, then give it a password:
 *
 *     update auth.users set encrypted_password =
 *       extensions.crypt('<generated>', extensions.gen_salt('bf'))
 *      where email = '<that address>'
 *
 * SETTING THAT PASSWORD SIGNS THE APP OUT. Supabase revokes every refresh token
 * an account holds when its password changes, so a simulator signed in as this
 * account lands back on the welcome screen — which looks like a bug in the app
 * and is not. Sign it back in from the debugger with
 * `supabase.auth.signInWithPassword(...)`, or use a different account for the
 * simulator than for the harness.
 *
 * Anything this writes lands in production, under that account. Every helper
 * that writes has a matching one that takes it back out; use them.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SESSION_FILE = fileURLToPath(new URL('../../../../.secrets/eval.json', import.meta.url))

let cfg
let access = null
let accessAt = 0

async function config() {
  if (cfg) return cfg
  try {
    cfg = JSON.parse(await readFile(SESSION_FILE, 'utf8'))
  } catch {
    throw new Error(
      `No eval session at ${SESSION_FILE}. It needs { url, anon, email, password } ` +
        'for a throwaway account — see the header of this file for how to make one.',
    )
  }
  return cfg
}

/**
 * A live access token, re-minted when the one in hand is close to its hour.
 *
 * Fifty minutes rather than sixty because the check happens BEFORE a call that
 * can itself take thirty seconds — a vision call against a slow model — and a
 * token that expires mid-flight fails as a 401 that looks like a broken account.
 */
export async function token() {
  const c = await config()
  if (access && Date.now() - accessAt < 50 * 60_000) return access

  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: c.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`sign-in failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`)
  }

  access = body.access_token
  accessAt = Date.now()
  return access
}

/**
 * How long to wait after the model provider throttles, per attempt.
 *
 * OpenRouter's shared pool rate-limits under a grading run, and the function
 * answers 200 with the provider's 429 inside it — so it looks like a bad recipe
 * rather than a call that never happened. Three cases in one pass came back
 * that way and were scored as failures. Waiting is free here; these are batch
 * scripts, and a run that mislabels noise as a regression is worse than a slow
 * one.
 */
const THROTTLE_BACKOFF_MS = [3000, 8000, 20000]

const throttled = (body) => /\b429\b|rate.?limit/i.test(JSON.stringify(body ?? ''))

/** POST to an edge function, with the app's own headers. */
export async function invoke(fn, body) {
  const c = await config()

  for (let attempt = 0; ; attempt++) {
    const jwt = await token()
    const res = await fetch(`${c.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: c.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text.slice(0, 500) }
    }

    if (attempt >= THROTTLE_BACKOFF_MS.length || !throttled(parsed)) {
      return { status: res.status, body: parsed }
    }
    const wait = THROTTLE_BACKOFF_MS[attempt]
    process.stderr.write(`  … model throttled, waiting ${wait / 1000}s\n`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

/** PostgREST, as the data hooks use it — so a read here sees what a screen sees. */
export async function rest(path, init = {}) {
  const c = await config()
  const jwt = await token()
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: c.anon,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

export const today = () => new Date().toISOString().slice(0, 10)

/**
 * Upload bytes the way the camera does: ask for a signature, then PUT straight
 * at R2. Going around this and writing the object with a credential would skip
 * the one check that stands between two users' plates.
 */
export async function upload(bytes, contentType = 'image/jpeg') {
  const signed = await invoke('photos', {
    action: 'upload',
    kind: 'meal',
    contentType,
    size: bytes.byteLength,
  })
  if (!signed.body?.ok) throw new Error(`upload sign failed: ${JSON.stringify(signed.body)}`)

  const put = await fetch(signed.body.url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  })
  if (!put.ok) throw new Error(`PUT failed (${put.status}): ${(await put.text()).slice(0, 200)}`)
  return signed.body.key
}

export const scanPhoto = (key, logDate = today()) =>
  invoke('scan-meal', { photo_path: key, log_date: logDate, debug: true })

export const scanText = (text, logDate = today()) =>
  invoke('scan-meal', { text, log_date: logDate, debug: true })

export const refine = (foodLogId, instruction) =>
  invoke('scan-refine', { food_log_id: foodLogId, instruction })

/** A recipe form filled in from words. Writes nothing — the draft is the answer. */
export const readRecipe = (text) => invoke('recipes', { action: 'read', text })

export const barcodeLookup = (code) => invoke('barcode', { code })

/** An entry as the diary reads it, through the view rather than off the table. */
export const entry = (id) =>
  rest(`food_log_details?id=eq.${id}&select=*`).then((r) => r.body?.[0] ?? null)

export const parts = (id) =>
  rest(`food_log_ingredient_details?food_log_id=eq.${id}&select=*&order=position`).then(
    (r) => r.body ?? [],
  )

/**
 * The eval rows for a scan: what the model claimed, and which tier caught it.
 *
 * Not over PostgREST like everything else here — `food_scan_items` is granted
 * to `service_role` alone, deliberately, because it is the scan's own working
 * notes rather than the user's diary. So this one read goes through the
 * Management API, which is how every other script in this directory reaches
 * past a client's grants.
 */
export async function scanItems(scanId) {
  const { runSql } = await import('./sql.mjs')
  return runSql(
    `select item_index, resolved_tier, specific_query, generic_query, serving_hint,
            llm_kcal_low, llm_kcal_high, confidence, catalogue_kcal, quantity, scene,
            components
       from public.food_scan_items
      where scan_id = '${scanId}'
      order by item_index`,
  )
}

/** Take a test entry back out. Every writing helper above has one of these. */
export const removeEntry = (id) =>
  rest(`food_logs?id=eq.${id}`, { method: 'DELETE' }).then((r) => r.status)

export const removePhotos = (keys) => invoke('photos', { action: 'delete', keys })
