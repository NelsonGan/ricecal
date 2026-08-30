#!/usr/bin/env node
/**
 * The project's auth settings, written down instead of remembered.
 *
 * Everything in `SETTINGS` is something a dashboard toggle can change silently,
 * and two of them were: `site_url` was still `http://localhost:3000` and
 * `uri_allow_list` was empty, so Supabase refused every `emailRedirectTo` and
 * fell back to the site URL. The symptom is a login link opening
 * `localhost:3000` on somebody's phone.
 *
 *   pnpm auth:config           show what differs between here and the project
 *   pnpm auth:config --push    make the project match
 *
 * It never touches the mail templates, which are `pnpm email:push`, so pushing a
 * redirect fix cannot quietly rewrite eight emails.
 */

import { managementFetch } from './lib/management.mjs'
import { projectRef } from './lib/sql.mjs'

/**
 * THE APP SCHEME IS THE SITE URL, and that is not a workaround.
 *
 * `site_url` is where Supabase sends anybody it could not send somewhere
 * better: a link opened with no `redirect_to`, or one whose `redirect_to` was
 * not allow-listed. There is no RiceCal website to land on, so the honest
 * default is the app itself. A web address here is a dead end on the one device
 * every reader of these emails is holding.
 */
const SITE_URL = 'ricecal://auth/callback'

/**
 * Every scheme a build of this app can register, and why there are three.
 *
 * `ricecal` is the store build. `ricecal-dev` is the EAS development build,
 * which is a SEPARATE APP with its own identifiers so it can sit beside the
 * TestFlight one. `exp+ricecal` is what Expo Go and the dev launcher use.
 *
 * Missing entries do not fail loudly. Supabase drops an unlisted
 * `emailRedirectTo` and substitutes `site_url`, so the mail still arrives, the
 * link still works, and it opens the WRONG APP, or none.
 */
const REDIRECT_URLS = ['ricecal://**', 'ricecal-dev://**', 'exp+ricecal://**']

const SETTINGS = {
  site_url: SITE_URL,
  uri_allow_list: REDIRECT_URLS.join(','),

  /**
   * SIX DIGITS, because a human is going to retype it.
   *
   * It was eight. Nothing in the app or in Supabase needs eight, the emails put
   * the code in the subject line so it is read off a banner, and every extra
   * digit is another chance to mistype under a rate limit that allows one mail
   * a minute.
   */
  mailer_otp_length: 6,

  /**
   * Eight, up from Supabase's default of six.
   *
   * Six is below every published floor worth naming and this app now has
   * passwords in it. Character-class requirements are deliberately NOT set:
   * they push people towards `Passw0rd!` and away from length, which is the
   * only thing that actually costs an attacker anything.
   */
  password_min_length: 8,
  password_required_characters: '',

  /**
   * Tell people when their password changes, and when their address does.
   *
   * These are the only two mails in the set that are sent to somebody who did
   * not ask for anything, and they are the whole reason a stolen password is
   * survivable: the owner finds out the same minute rather than the next time
   * they try to sign in.
   */
  mailer_notifications_password_changed_enabled: true,
  mailer_notifications_email_changed_enabled: true,

  /**
   * The old address has to agree to an email change, not just the new one.
   * Without it, an account left signed in on a borrowed phone can be taken by
   * changing the address on it.
   */
  mailer_secure_email_change_enabled: true,
}

/**
 * Deliberately not in `SETTINGS`. `security_captcha_enabled` is the one field
 * that can lock every user out of the app the moment it is written: with it on,
 * Supabase rejects any sign-in that arrives without a Turnstile token, and a
 * build already on somebody's phone has no idea it should send one. So the order
 * is fixed and the script will not do the last step:
 *
 *   1. Create the Turnstile widget on Cloudflare (see README.md).
 *   2. `pnpm auth:config --captcha-secret <secret>` stores the secret and selects
 *      turnstile, with the gate still open.
 *   3. Ship a build carrying EXPO_PUBLIC_TURNSTILE_SITE_KEY.
 *   4. `pnpm auth:config --captcha-on` once that build is the one people run.
 *
 * Step 4 is reversible with `--captcha-off`, which is why it is a flag rather
 * than a line in the table above.
 */
function captchaChanges(argv) {
  const changes = {}

  const secretAt = argv.indexOf('--captcha-secret')
  if (secretAt >= 0) {
    const secret = argv[secretAt + 1]
    if (!secret || secret.startsWith('--')) {
      throw new Error('--captcha-secret needs the Turnstile secret key after it')
    }
    changes.security_captcha_provider = 'turnstile'
    changes.security_captcha_secret = secret
  }

  if (argv.includes('--captcha-on')) {
    changes.security_captcha_provider = 'turnstile'
    changes.security_captcha_enabled = true
  }
  if (argv.includes('--captcha-off')) changes.security_captcha_enabled = false

  return changes
}

/**
 * A secret is compared but never printed.
 *
 * Matched narrowly, on purpose: a looser `includes('pass')` swallowed
 * `password_min_length` and `mailer_notifications_password_changed_enabled`,
 * and a diff that reports `<set> -> <set>` for the settings you are reading it
 * to check is worse than no diff.
 */
function show(field, value) {
  if (/secret$/.test(field) || /_pass$/.test(field)) return value ? '<set>' : '<unset>'
  return JSON.stringify(value)
}

async function main() {
  const argv = process.argv.slice(2)
  const ref = projectRef()
  const wanted = { ...SETTINGS, ...captchaChanges(argv) }

  const current = await managementFetch(`/projects/${ref}/config/auth`)

  const differing = Object.entries(wanted).filter(([field, value]) => {
    /**
     * A secret never comes back from the API in a form worth comparing, so it
     * is always written when it was passed.
     *
     * SPECIFICALLY, IT COMES BACK AS A 64 CHARACTER HASH. Every secret field
     * does — `security_captcha_secret`, `external_google_secret` and `smtp_pass`
     * are all 64 lowercase hex, which three unrelated credentials cannot
     * genuinely be. Worth writing down because the length reads like a value:
     * a Turnstile secret is about 35 characters and starts `0x4AAA`, so 64 hex
     * looks exactly like the wrong secret having been pasted in, and it is not
     * evidence of anything. There is no way to read back what is stored, which
     * is why a mismatched captcha secret can only be ruled out by setting it
     * again from the widget you are looking at.
     */
    if (field.includes('secret')) return true
    return current[field] !== value
  })

  if (!differing.length) {
    process.stdout.write(`${ref}: auth config already matches\n`)
    return
  }

  for (const [field, value] of differing) {
    process.stdout.write(
      `  ${field.padEnd(46)} ${show(field, current[field])} -> ${show(field, value)}\n`,
    )
  }

  if (!argv.includes('--push')) {
    process.stdout.write('\nNothing written. Re-run with --push to apply.\n')
    return
  }

  await managementFetch(`/projects/${ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify(Object.fromEntries(differing)),
  })
  process.stdout.write(`\nApplied ${differing.length} changes to ${ref}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
