# Working in this repo

**[README.md](README.md) is the documentation.** It explains the whole project:
the architecture, every feature, the rules that must not be broken, and the
traps. Read the section you are about to touch before you touch it.

This file is only the things an agent needs that are not in there.

## Before you start

```
apps/mobile      Expo / React Native app (expo-router, NativeWind, react-query)
apps/supabase    Postgres schema, RLS, pgTAP tests, Deno edge functions
apps/cloudflare  workers/ and d1/, one directory per Worker and per database
packages/shared  the few constants both sides need
```

`pnpm check` is typecheck + jest + biome. Run it before you say you are done.

**Expo has changed.** Read the versioned docs at
<https://docs.expo.dev/versions/v57.0.0/> before writing any Expo code. Do not
work from memory of an older version.

## Rules for changes

**Read "Rules you must not break" in the README** before changing anything in
the diary, the catalogue, entitlement, health sync or photo storage. Each entry
there records a bug that shipped. They are not style preferences.

**Deploy the schema first, then the code that reads it.** D1 schema → the Worker
→ the edge functions → the app. The README has the full version and why the
order cannot be reversed.

**The app is released, so the backend can only ever be extended.** A binary in
a store calls Supabase and Cloudflare forever: `runtimeVersion` is
`appVersion`, so an OTA update cannot reach a user on an older version, and
nothing gates a request on which version sent it. Add fields, keep answering
with the old ones, default anything new, and never narrow an enum, a constraint,
an RLS policy or a response shape an old app depends on. Renaming is deleting.
Removing runs backwards over a store release, not over a deploy. Before you
touch a Worker route, an edge function's request or response, or a column the
app writes, ask what 1.0.0 does when it meets your change. The README's
"The store holds copies of the app you cannot recall" is the full version.

**The database is declarative.** Edit `apps/supabase/schemas/*.sql` and generate
a migration with `pnpm db:diff <name>`. Never hand-write a migration and never
apply SQL through the dashboard or the Supabase MCP server: `supabase-drift`
will catch it, and it goes red on a change that is genuinely in the repo.

**Do not add a documentation file.** Everything goes in `README.md`. Scattered
docs are what this layout replaced.

## Writing

**Comments explain why, in plain English.** Worth the space when the reason is
not recoverable from the code: a bug that motivated a shape, a constraint that
looks arbitrary. Keep them short. Match the density around you.

**No em dashes or en dashes in anything a user reads.** That covers
`src/i18n/en/*`, any string reaching a screen, a notification, a share sheet or
a toast, and the model prompts that produce text we display back. Use a comma, a
full stop, a semicolon or brackets. Rewrite the sentence rather than swapping
the punctuation.

A lone `—` standing in for a missing measurement is a symbol, not a sentence, and
it stays. A missing *name* gets a word ("Someone") instead.

**Commit subjects are a sentence about what changed**, not a
conventional-commits prefix.

## Things that waste the most time

These are the ones an agent hits first. The README has the rest.

**One simulator at a time.** This machine cannot run the iOS simulator and the
Android emulator together, and the failure mode is wrong answers rather than
slowness: a Gradle build beside a jest run pushed 18 tests past their timeout
with nothing broken. Stop the daemons afterwards (`./gradlew --stop`, then
`pkill -f GradleDaemon`, `pkill -f kotlin-daemon`).

**A fresh local account is a free account.** `handle_new_user` writes no
`subscriptions` row, so the fourth scan of the day fails and describe, refine and
the recipe reader all answer 402. That reads as a broken pipeline. The README has
the one-row fix.

**Adding or renaming an edge function** needs a full stop and start of the local
stack.

**Edge functions are Deno and outside the pnpm workspace.** `pnpm check` does not
see them. Their typecheck is
`deno check --no-lock --config <fn>/deno.json <fn>/index.ts`.

**`supabase db diff` misses function grants**, and a function's comments count as
part of its body. Both are in the README's Traps section.

**Changing `tailwind.config.js` needs `npx expo start --clear`.** A stale
NativeWind cache produces an app with no styling at all rather than an error.
