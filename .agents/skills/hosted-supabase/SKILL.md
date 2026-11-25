---
name: hosted-supabase
description: Run SQL against the hosted RiceCal Supabase project and get a session on it without a mailbox. Use for production reads, scripts that call the Management API query endpoint (runSql), direct COPY connections, bulk loads near the free plan's 500 MB ceiling, generate_link OTPs, captcha-protected password sign-in, recovering a code from auth.users, test accounts on the hosted project, and moving a subscription row to see the free side of a gate.
---

# Working against the hosted Supabase project

Moved out of `AGENTS.md` so it loads when a task reaches the live project. Schema still only changes through `apps/supabase/schemas/*.sql` and `pnpm db:diff` (AGENTS.md, *Rules for changes*).

## Running SQL against the hosted database

Two routes, and the first is the one scripts use.

**The Management API query endpoint.**
`POST https://api.supabase.com/v1/projects/<ref>/database/query` with
`{"query": "..."}` runs arbitrary SQL with the CLI token from the keychain and
returns the last statement's rows as JSON. `apps/supabase/scripts/lib/sql.mjs`
wraps it (`runSql`), resolving the ref from `EXPO_PUBLIC_SUPABASE_URL` and
honouring `SUPABASE_ACCESS_TOKEN`.

- **It throttles, and a long loop will hit it** (429 `ThrottlerException`).
  `runSql` retries a 429 with backoff and retries nothing else. Before that
  existed, bulk runs died half-applied and reported success because the caller
  was piping stderr to `/dev/null`. Never count a loader's output lines as its
  result.
- Its role is not superuser. `set "pg_trgm.similarity_threshold"` inside a
  function body does not take (the GUC is not loaded on that connection) — put
  an explicit `similarity(...) >= x` beside the `%` operator instead.
- Statements sent this way bypass migrations exactly as a dashboard edit does,
  which is what `supabase-drift` catches. For schema, always write the migration
  file at the same version and insert its
  `supabase_migrations.schema_migrations` row. `pnpm db:apply <file>` does both.
- pgTAP is not installed on the hosted project and must not be. To check a
  pgTAP file's logic without a local stack, run its payloads inside one
  `begin; … rollback;` query and assert on the returned rows.

**A direct connection**, for `COPY` and anything else the endpoint cannot do.
The password is in `.secrets/db.env`; the reachable host is the **session
pooler** on port 5432, not the transaction pooler on 6543, and not
`db.<ref>.supabase.co`, which does not resolve from here.

**The project is on the free plan, with a 500 MB ceiling.** Crossing it does not
fail the statement: Supabase flips the whole database to
`default_transaction_read_only = on`, which then refuses even the `drop table`
that would free the space. Recover with `set default_transaction_read_only = off`
on a session, then drop what grew. Any bulk load must commit per batch and check
`pg_database_size` between batches. After a delete-and-reload the tables are
badly bloated (`foods` once sat at 247 MB for 47,000 rows); `vacuum (full,
analyze)`, smallest table first, took the database from 420 MB to 82 MB.

## Getting a session, with no mailbox

**`POST /auth/v1/admin/generate_link`** with the service-role key returns
`email_otp` in plaintext alongside `hashed_token` and `action_link`, and sends
no mail. Types: `signup`, `magiclink`, `recovery`, `invite`, `email_change`.
Pass `redirect_to` explicitly or it falls back to `site_url`, which makes an
allow-list test look like it passed when nothing was tested.

**Password sign-in on the hosted project is captcha protected.**
`security_captcha_enabled` is on, so `/token?grant_type=password` answers
`captcha_failed` on an account whose password is fine — which reads as a broken
account rather than as a project setting. `/auth/v1/verify` is **not** protected:
the captcha guards the endpoints that ask for something (`/token`, `/signup`,
`/otp`, `/recover`), never the redeeming of a code the server itself issued.
That asymmetry is the whole trick, and `apps/supabase/scripts/lib/live.mjs`
takes either an `EVAL_ACCESS_TOKEN` or the service-role key and does it.

**When a token was created by a real client call** there is no plaintext
anywhere, and `generate_link` would overwrite it. Recover it instead: GoTrue
stores `sha224(email + otp)` hex in `auth.users.confirmation_token` (magic links
and resets land in `recovery_token`), and a six digit code is a million
candidates, which brute-forces in about a second in Node.

- **The mailer rate-limits at 60 seconds per address** (`smtp_max_frequency`),
  and a test script will hit it: a second `/signup` seconds after the first
  answers 429, not the `identities: []` you were testing for. Create the prior
  account with `POST /auth/v1/admin/users` and `email_confirm: true`, which
  sends nothing.
- Use `+tag@` addresses and delete them at the end with
  `DELETE /auth/v1/admin/users/<id>`; nothing else cleans them up.
- **A row INSERTed straight into `auth.users` breaks `generate_link`**, which
  answers `500 "Database error finding user"`: GoTrue scans several token
  columns into Go strings and a NULL is not one. After seeding, set
  `confirmation_token`, `recovery_token`, `email_change_token_new`,
  `email_change_token_current`, `email_change`, `phone_change`,
  `phone_change_token` and `reauthentication_token` to `''` and confirm the
  address. `confirmed_at` is generated — assigning it fails the statement.
- Do not drive the *app's* sign-in with a generated OTP: the app's `verifyOtp`
  rejects a token it did not send itself, so the code reads as "wrong or
  expired" in the UI while verifying fine over REST. Sign in with a password.
- Two sessions cannot share one refresh-token chain. Supabase rotates on use and
  revokes the chain when an old token is presented again, so a script and the
  simulator signed in as the same account kill each other
  (`refresh_token_already_used`). Give the script its own throwaway account.
- Setting a password revokes that account's sessions, so a simulator signed in
  as it lands back on the welcome screen.

**Test accounts.** Three plus-tagged accounts on the hosted project, one on each
side of the paywall and one sandbox buyer, plus the eval account behind
`.secrets/eval.json`. Their addresses, passwords and uids are in
`.secrets/agent-notes.md`, which is gitignored, and never in this repo.
**All three are onboarded** (checked, 2026-09-05; an older note calling the free
one un-onboarded is wrong), so none of them is a way back into onboarding — that
needs a fresh signup. The free one carries a `subscriptions` row at `expired`
rather than no row at all, which entitles the same as none. A fresh account needs
`profiles.onboarded_at` (plus sex, birth date, height, target weight) and one
`weight_logs` row, or the app opens on onboarding; `weight_logs` wants
`measured_on`, not `log_date`. Pick a uuid the pgTAP suite does not seed
(`1111…`, `2222…`, `3333…`), or `07_recipes` fails on a duplicate key that names
nothing you touched.

**Signing out and back in is more trouble than moving a row.** To see the free
side of a gate on the account the simulator is already holding, set the Pro
account's `subscriptions.status` to `expired`, look, then put it back — write
the restore down before running the first statement. `current_period_end` stays
put and `isEntitledRow` reads both. Restart the app rather than reloading: the
subscription query is persisted to MMKV, so a reload rehydrates the old answer
first.
