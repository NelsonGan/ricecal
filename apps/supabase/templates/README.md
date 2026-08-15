# The auth emails

Eight messages, one layout, and a script that puts them on the project.

```
_layout.html          the shell: doctype, palette, card, footer
_partials.html        the code block, the button, the rule
<message>.html        one body per email, with its subject in a metadata block
build/                what the two of them make. COMMITTED. Do not edit.
```

```sh
pnpm email:build   # rewrite build/
pnpm email:check   # fail if build/ is stale (CI runs this)
pnpm email:push    # build, then send to the project named by .env.local
```

`build/` is committed for the same reason `src/theme/theme.css` is: the local
stack reads those files straight off disk (the `auth.email.template.*` blocks in
`config.toml`), a reviewer can read the email that will actually be sent, and
`email:check` is the only thing standing between the two copies drifting.

`email:check` also compares each SUBJECT against the copy of it in
`config.toml`, which the CLI wants separately from the body. Kept in step by
hand those two agree until somebody edits one, and the symptom is invisible: the
mail on a local stack has a different subject line from the one production
sends.

One trap the CLI sets, and it costs a `supabase start` to find. A
`[auth.email.template.*]` `content_path` is resolved from the WORKDIR, which
here is `apps`, so it reads `./supabase/templates/build/…`. A
`[auth.email.notification.*]` path is resolved from the supabase directory
itself, so it reads `./templates/build/…`. Supabase's own commented defaults
show the same split without remarking on it.

## Why a folder rather than the dashboard

The dashboard keeps each template in its own text box. You cannot see two at
once, there is no history, nothing is reviewed, and the shared footer exists in
eight places, so the first person to change it changes one of them. Here the
footer is in `_layout.html` and there is nothing to keep in step.

## What a body looks like

```html
<!--
key: recovery
subject: {{ .Token }} is your RiceCal password reset code
preheader: Use this code to choose a new password.
-->

<h1 ...>Reset your password</h1>
<!--PARTIAL:code-->
<!--PARTIAL:button|Choose a new password-->
```

`key` is the Supabase template name, and everything else is derived from it:
the API fields (`mailer_subjects_<key>`, `mailer_templates_<key>_content`) and,
for a key ending `_notification`, the `mailer_notifications_<...>_enabled` flag
that decides whether it is ever sent at all.

`preheader` is the line a mail list shows under the subject. Left out, the
client shows the wordmark and then the heading twice.

Comments are stripped at build time, so a note explaining a decision costs the
reader nothing.

## The code comes before the link, in every message

Not a house style. Corporate mail security (Microsoft Defender's Safe Links,
most enterprise gateways) fetches every link in an incoming message to check it,
and a Supabase confirmation link is spent on first use. So the reader taps a
link that arrived ten seconds ago and is told it has expired. Supabase's own
docs name this, and the way out is `{{ .Token }}` plus `verifyOtp` in the app:
nothing can consume a code by reading the mail.

It is also the only half that works when the mail is opened on a different
device from the one the app is installed on, which for a phone app is most of
the time. The link is still there, below the code, for the case where they are
the same device.

## The design

Supabase's design system's ROLES, painted in RiceCal's colour. Background,
surface, foreground, foreground-muted and border are Supabase's neutrals at
their published values (`#ffffff`/`#1c1c1c`, `#e6e8eb`/`#2e2e2e`,
`#171717`/`#ededed`, `#707070`/`#a0a0a0`), with its 6px and 8px radii and its
type ramp. The accent is pandan (`#1b8a4e` on light, `#38d07e` on dark) rather
than Supabase's brand green, because the person reading this asked RiceCal for
it and a mail in another product's colours reads as a forward.

Swapping that decision is the `--brand`-coloured values in `_layout.html` and
`_partials.html`, and nothing else.

Three constraints shape the markup and all three are about mail clients:

- **Tables, not flex or grid.** Outlook renders through Word's engine.
- **The palette is declared twice**, once inline on the element and once in a
  `prefers-color-scheme` block. A client that drops the `<style>` block still
  gets the light palette; one that keeps it gets dark mode. Declared only in the
  style block, Outlook renders black on black.
- **No remote images.** Most clients block them until asked, so a logo that is
  an `<img>` is an empty box for the first second of every email. The wordmark
  is text.

## The two that nothing in the app sends

`invite.html` is an admin call (`inviteUserByEmail`), reachable only from the
dashboard or a service-role script. It is written and pushed anyway, because
the alternative is not "no invitation mail" but Supabase's unstyled default
going out the first time somebody invites a tester.

`reauthentication.html` is sent when a signed-in user has to prove it is them
before a sensitive change. It carries no link, because there is no
`{{ .ConfirmationURL }}` for it: the answer has to come back into the session
the person is already sitting in.
