/**
 * Drives the deployed edge functions the way the app drives them, from a script.
 *
 * `eval-prompts.ts` grades a prompt by importing it and calling the model
 * directly, which never uploads a photo, searches the catalogue, runs the
 * verifier or writes a row. Most of what goes wrong with a scan goes wrong in
 * those parts, so this file is the shipped path end to end, with the cascade's
 * own `debug: true` trace on every call.
 *
 * `.secrets/eval.json` holds an email and a password for a throwaway account.
 * The first design read a refresh token out of the running app and lasted one
 * run: Supabase rotates a refresh token on use and revokes the chain when an old
 * one is presented again, so the app and the script killed each other's
 * sessions. Password sign-in gives the harness a session of its own.
 *
 * To set the account up, point `email` at a throwaway address that has signed in
 * once, then give it a password:
 *
 *     update auth.users set encrypted_password =
 *       extensions.crypt('<generated>', extensions.gen_salt('bf'))
 *      where email = '<that address>'
 *
 * Setting that password signs the app out, because Supabase revokes every
 * refresh token an account holds when its password changes.
 *
 * That is no longer enough on its own: `/token?grant_type=password` is captcha
 * protected and a script has no widget to solve, so the refusal is
 * `captcha_failed` on a password that is perfectly good. `token()` has two ways
 * round it, and `otpToken` explains the second.
 *
 * Anything this writes lands in production under that account. Every helper that
 * writes has a matching one that takes it back out.
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
        'for a throwaway account, plus `service_role` while captcha is on — see the ' +
        'header of this file for how to make one, and `otpToken` for why.',
    )
  }
  return cfg
}

/**
 * Seconds until a JWT's own `exp`, or null if it does not carry a readable one.
 * No verification: this only decides whether to bother sending it.
 */
function secondsLeft(jwt) {
  try {
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
    return typeof claims.exp === 'number' ? claims.exp - Date.now() / 1000 : null
  } catch {
    return null
  }
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

  // A token handed in from outside, for a caller that already has one — the
  // simplest way past the captcha below, and the only one that needs no
  // service-role key anywhere.
  //
  // Its expiry is CHECKED rather than assumed, because this is the one branch
  // that cannot mint a replacement. Left unchecked, an hour-old token got handed
  // back for another fifty minutes and every call in the run answered 401, which
  // reads as a broken account or a broken function rather than as a stale
  // variable in the shell.
  if (process.env.EVAL_ACCESS_TOKEN) {
    const left = secondsLeft(process.env.EVAL_ACCESS_TOKEN)
    if (left !== null && left < 60) {
      throw new Error(
        `EVAL_ACCESS_TOKEN expired ${Math.round(-left / 60)} min ago. Mint another; ` +
          'this branch cannot, which is the trade for needing no service-role key.',
      )
    }
    access = process.env.EVAL_ACCESS_TOKEN
    accessAt = Date.now()
    return access
  }

  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: c.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  })
  const body = await res.json()

  if (!res.ok || !body.access_token) {
    // Turning captcha on took every harness in this directory with it, and the
    // failure names the app rather than the switch: `captcha_failed` on an
    // account whose password is right. Password sign-in is captcha protected and
    // a script has no widget to solve, so this is not a thing to retry.
    if (body?.error_code === 'captcha_failed') {
      access = await otpToken(c)
      accessAt = Date.now()
      return access
    }
    throw new Error(`sign-in failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`)
  }

  access = body.access_token
  accessAt = Date.now()
  return access
}

/**
 * The way in when captcha is on: mint a code as the admin, then spend it.
 * `/auth/v1/verify` is not captcha protected, since the protection is on the
 * endpoints a bot would use to ask for something, and `admin/generate_link`
 * sends no mail and returns `email_otp` in plaintext.
 *
 * It needs the service-role key, which is deliberately not read from anywhere it
 * could be committed:
 *
 *     export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
 *     curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
 *       "https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true"
 *
 * then `export SUPABASE_SERVICE_ROLE_KEY=<the service_role one>`, or put it in
 * `.secrets/eval.json` as `service_role`.
 */
async function otpToken(c) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? c.service_role
  if (!key) {
    throw new Error(
      'captcha is on, so password sign-in is refused. This harness needs the ' +
        'service-role key to mint a code instead — set SUPABASE_SERVICE_ROLE_KEY ' +
        'or add "service_role" to .secrets/eval.json. See otpToken() in lib/live.mjs.',
    )
  }

  const link = await fetch(`${c.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: c.email }),
  }).then((r) => r.json())
  if (!link.email_otp) {
    throw new Error(`could not mint a code: ${JSON.stringify(link).slice(0, 300)}`)
  }

  const session = await fetch(`${c.url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: c.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: c.email, token: link.email_otp }),
  }).then((r) => r.json())
  if (!session.access_token) {
    throw new Error(`code did not verify: ${JSON.stringify(session).slice(0, 300)}`)
  }
  return session.access_token
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
