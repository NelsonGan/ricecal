# Signing in

Four ways in and one screen that picks between them.

```
(auth)/sign-in        Apple, Google, or an address
(auth)/password       a password, or "email me a code instead"
(auth)/verify         the six digits, for a signup or a passwordless sign-in
(auth)/new-password   the six digits AND the new password, for a reset
```

`data/auth.ts` is every call. `features/auth` is the pieces the screens share:
the provider buttons, the password box with the eye on it, the error-to-sentence
hook, the deep-link handler, and the Turnstile widget.

## Why the mail carries a code and not just a link

It used to be a link and nothing else, and the argument was good as far as it
went: nothing to remember, nothing to reset, no second field to mistype. Two
things it did not survive.

**A link is spent by whatever fetches it first.** Corporate mail security
(Microsoft Defender's Safe Links, most enterprise gateways) follows every link in
an incoming message to check it, and a Supabase confirmation link is single use.
So the reader taps a link that arrived ten seconds ago and is told it expired.
Supabase's own docs name this failure and the answer: put `{{ .Token }}` in the
template and verify it with `verifyOtp`. Nothing can consume a code by reading a
mailbox.

**A link only works on the phone the app is on.** Most people read mail
somewhere else. A code crosses that gap in somebody's head.

The link is still in every mail and `LoginLinkHandler` still catches it. It is
the second offer now.

## Why there is a password at all

The alternative to remembering one turned out to be waiting for an email every
single time, which is the wrong trade for somebody opening a diary daily.

It is optional in the strict sense. An account made with a code has no password
until it sets one; an account made with a password can still ask for a code.
Every screen in the flow offers the code, which is what keeps a forgotten
password from being a wall.

## The three things that were actually broken

Worth writing down, because none of them looked like what they were.

**`site_url` was `http://localhost:3000` and `uri_allow_list` was empty** on the
hosted project. Supabase drops an `emailRedirectTo` that is not allow-listed and
substitutes the site URL, so every login link in every mail opened localhost on
somebody's phone. It read as a bug in the app and was two fields in a settings
page. `pnpm auth:config` owns both now, and prints a diff before it writes.

**A repeat signup looks like a success.** Supabase will not tell a signup form
that an address is taken, because that turns the form into an oracle for who
uses this app. With confirmations on it returns an ordinary user object with
`identities: []` and sends no mail. Read naively that is somebody marched to a
code screen to wait for a mail that will never arrive. `signUpWithPassword`
reads the empty array; the screen offers sign-in and still does not say the
account is there.

**A wrong code and an expired one are one error.** Both come back 403
`otp_expired`, "Token has expired or is invalid", for the same
non-disclosure reason. So there is one `code_invalid` reason and its copy covers
both. Copy that said "expired" would tell somebody who mistyped to go and wait
for another mail.

## The reset is one screen, and that is a race not a taste

Verifying a recovery code CREATES the session. That session is the licence to
change the password, and it is also what `(auth)/_layout` watches to decide the
sign-in stack is finished with.

Split across two screens, the code screen verifies, the session lands, the guard
carries the user to Today, and the password they came to change is still the
password. So the code and the new password are on one screen, nothing is sent
until Save, the passwords are checked locally first, and the layout is told to
leave `new-password` alone while it is the screen on top.

Somebody arriving through the LINK instead already has a session, so that screen
drops the code field. It tests for the session rather than for a parameter
saying which route was taken.

## Cloudflare Turnstile

`turnstile.tsx`. Supabase supports it as a captcha provider: with
`security_captcha_enabled` on, it refuses any sign-in, sign-up, mailed code or
password reset arriving without a token it can verify against the secret.

Turnstile is a browser widget, so the app hosts one in a hidden `WebView` in
`execute` mode with `interaction-only` appearance. It normally produces a token
without the user seeing anything; on the rare occasion Cloudflare wants a human,
the same WebView is restyled into a panel over the screen. Restyled, never
remounted: a reload throws away the challenge in progress.

**It fails open, on purpose.** No site key, no WebView in the binary, a script
that will not load, a network that drops: all of them end with `undefined` and
the request goes without a token. The gate is on the server, so failing closed
here adds no protection Supabase is not already providing and does add a way for
a broken WebView to lock somebody out of their own account.

### Turning it on

The order matters, because `security_captcha_enabled` is the one setting that
can lock every existing install out at once: a build already on a phone has no
idea it is meant to send a token.

1. **Create the widget** at Cloudflare dashboard → Turnstile → Add widget.
   Mode **Managed**, and add the hostname you will use as the WebView's origin,
   e.g. `ricecal.app`. That hostname is never fetched from; inline HTML has no
   origin of its own and the widget is bound to a hostname list, so the page is
   loaded under it.

   **MANAGED, NOT INVISIBLE, and this one is not a preference.** Cloudflare's
   three modes differ in exactly one thing: what happens to a visitor it judges
   suspicious. Managed escalates to a checkbox. Non-Interactive and Invisible
   never do — the docs are explicit that those visitors "will never interact
   with the widget" — so a real person whose score comes out badly has no way
   to prove otherwise and simply cannot sign in, on every attempt, for ever. A
   hidden WebView on a phone is a profile that scores badly more often than a
   browser does, which is what makes this the likely mode rather than a corner.
   `appearance: 'interaction-only'` keeps a Managed widget invisible until that
   escalation actually happens, so nothing is lost by choosing it.
2. **Store the secret on Supabase**, gate still open:
   ```sh
   pnpm auth:config --captcha-secret 0x4AAA... --push
   ```
3. **Ship a build carrying the site key**: `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and
   `EXPO_PUBLIC_TURNSTILE_ORIGIN` in `.env.local` and in the EAS environment.
   `react-native-webview` is a native dependency, so this needs a real build, not
   an OTA update.
4. **Close the gate**, once that build is the one people are running:
   ```sh
   pnpm auth:config --captcha-on --push
   ```
   Reversible with `--captcha-off --push`.

Left at `REPLACE_ME`, the app asks for no token and sends none, which is exactly
right for every step before the last.

### When it refuses a real person

**FIVE THINGS FAIL IDENTICALLY HERE, and four of them are not in this repo.**
The gate is on the server, so the app says "we could not confirm you are a
person" whether the widget never loaded, never produced a token, produced one
Cloudflare scored badly, or produced a perfectly good one that `siteverify`
refused. One sentence, five causes, and no way to tell them apart by looking.

So every failure is reported: a `[captcha]` line to the console, and the same
text to Sentry as a warning (`turnstile.tsx`, `report`). The code is what
separates them.

| what Sentry says | what it is | where the fix is |
|---|---|---|
| `absent: no site key in this build` | `EXPO_PUBLIC_TURNSTILE_SITE_KEY` never reached the bundle | the EAS environment for that build profile. `EXPO_PUBLIC_*` is inlined at BUNDLE time, so this is a property of the build, not the phone |
| `absent: no WebView in this binary` | the binary predates `react-native-webview` | a native rebuild. An OTA update cannot add it |
| `unusable: 110200` | the WebView's origin is not on the widget's hostname list | add `EXPO_PUBLIC_TURNSTILE_ORIGIN`'s value under Hostname Management |
| `unusable: 110100` / `110110` / `400020` / `400070` | wrong, unknown or disabled site key | the key, or the widget |
| `gave up after N retryable errors, last 300…` | Cloudflare scored the visitor a bot, twice | the widget's MODE, above |
| `timed out with no answer` | executed, then twenty seconds of silence | usually the network; otherwise the widget |

The bot-score row is the one that looks like an app bug and is not: the request
is reaching Cloudflare and being scored, and the app is doing what it can with
the answer. It no longer settles on the FIRST one — Cloudflare marks `300*` and
`600*` retryable, the widget's own `retry: 'auto'` has another go, and in
Managed mode a visitor who keeps scoring badly is escalated to a checkbox, which
arrives as an `interactive` message and puts the panel up.

**And nothing at all in Sentry, with sign-in still failing, is the sixth case:
the SECRET.** It has to belong to the same widget as the site key. A mismatched
pair produces a token the app is entirely happy with — no error, no code,
nothing to report — that `siteverify` then rejects, and the app says the same
sentence again. Silence here is the evidence: the widget did its job, so the
problem is on the other side of it. `pnpm auth:config --captcha-secret 0x… --push`
writes it, and the Supabase API never gives it back in a readable form, so the
only way to rule it out is to set it again from the widget you are looking at.

## Where the rest of it lives

| | |
|---|---|
| `apps/supabase/templates/` | the eight emails, and why the code comes before the link |
| `apps/supabase/scripts/auth-config.mjs` | the project settings, written down |
| `apps/supabase/config.toml` | the same settings for the local stack |
