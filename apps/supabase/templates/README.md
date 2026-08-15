# The auth emails

Eight messages, one layout, and a script that puts them on the project.

```
_layout.html          the shell: doctype, palette, card, footer
_partials.html        the code block, the button, the rule
logo.png              the app icon at 96px, inlined into every message
<message>.html        one body per email, with its subject in a metadata block
build/                what the three of them make. COMMITTED. Do not edit.
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

**RiceCal's own, and every value comes from `apps/mobile/src/theme/tokens.ts`.**
It was Supabase's design system roles painted in one RiceCal colour for a while,
which was a sensible place to start and produced a mail that looked like a
developer tool: their neutrals, their 6px radii, the system font stack, and a
green button. Nothing in it said which app it had come from — and for a new
account this mail arrives BEFORE the app does, so it is the first thing anybody
sees of the product.

| | |
|---|---|
| canvas `#F6F8F7` / `#111716` | the page |
| surface `#FFFFFF` / `#1A2220`, line `#E4E8E5` / `#2E3936` | the card, at `radius.card` 28 with the app's 2px border |
| heading `#1B3A2B`, body `#495450`, muted `#6E7B74` | the type colours |
| pandan `#2FBF71` over pandanSlab `#1B8A4E` | the button, slab and all |
| pandanSoft `#EAF9F0` on pandanSoftLine `#CFEBDA` | the code block |

Baloo 2 carries the heading, the button label and the six digits; Nunito carries
the prose. Same split as the app.

Four constraints shape the markup and all four are about mail clients:

- **Tables, not flex or grid.** Outlook renders through Word's engine.
- **The palette is declared twice**, once inline on the element and once in a
  `prefers-color-scheme` block. A client that drops the `<style>` block still
  gets the light palette; one that keeps it gets dark mode. Declared only in the
  style block, Outlook renders black on black.
- **The fonts are an enhancement, never a dependency.** Baloo 2 and Nunito come
  from Google Fonts, which Apple Mail and iOS Mail honour and Gmail ignores, so
  every family declaration carries the full system fallback behind it. What
  makes the mail recognisable without them is the colour, the corners and the
  slab under the button, none of which need a typeface.
- **The one image is inline.** The rule used to be no images at all, because
  most clients block a remote one until the reader asks and a hosted logo is an
  empty box at the top of every message until they do. The app icon is a
  `data:` URI instead, spliced in at build time from `logo.png` — nothing to
  fetch, nothing to block, no asset host to keep alive. It costs about 9KB a
  message against Gmail's 102KB clipping threshold, and these build to roughly
  17KB. A client that drops data URIs shows the `alt` text, which is styled as
  the wordmark: exactly the header this layout had before the icon existed.

**The button is the app's `Squish`,** as far as a mail client can draw one: the
outer cell is the slab colour with six points of bottom padding and the anchor
is the surface laid over it. Outlook squares off the corners, having no
`border-radius`, and what survives there is still the two-tone block.

Replacing `logo.png` is `sips -Z 96` over `apps/mobile/assets/icon.png`, and a
rebuild.

## The two that nothing in the app sends

`invite.html` is an admin call (`inviteUserByEmail`), reachable only from the
dashboard or a service-role script. It is written and pushed anyway, because
the alternative is not "no invitation mail" but Supabase's unstyled default
going out the first time somebody invites a tester.

`reauthentication.html` is sent when a signed-in user has to prove it is them
before a sensitive change. It carries no link, because there is no
`{{ .ConfirmationURL }}` for it: the answer has to come back into the session
the person is already sitting in.
