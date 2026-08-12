# The Cloudflare half

Everything this project runs on Cloudflare, grouped by what kind of thing it is
and then by which one:

```
apps/cloudflare/
  workers/
    catalogue/           the food catalogue API — see src/index.ts for every route
  d1/
    food-catalogue/      schema.sql, and the database's real name in d1.json
```

One directory per Worker and one per database, because each has its own deploy
and its own name in somebody's Cloudflare account. There is one of each today;
the layout is what stops a second one becoming a decision.

A Worker is a pnpm workspace package (`apps/cloudflare/workers/*` in
`pnpm-workspace.yaml`), so it carries its own `wrangler` and its own typecheck. A
D1 directory is not a package — it holds SQL and a name, and nothing to build.

## Two branches, two deploys

`.github/workflows/cloudflare.yml` runs on nothing but changes under this
directory, and deploys from two long-lived branches:

| branch | Worker | who talks to it |
|---|---|---|
| `main` | `ricecal-catalogue` | the store builds, and the Supabase edge functions |
| `preview` | `ricecal-catalogue-preview` | the app's `preview` EAS channel |

Both bind the **same D1 database**. There is one copy of the catalogue and it is
read-only over HTTP, so a preview Worker pointed at a stub would prove nothing
about a change to how 3.2 million packets are queried — and a second copy of a
257 MB database would need loading, ageing and paying for.

Two consequences follow from sharing it, and both are deliberate:

- **The schema is applied on `main` only.** A schema change merged to `preview`
  would otherwise reach the rows production is serving before anybody had merged
  it. Every statement in `schema.sql` is `if not exists`, so re-applying it is a
  no-op against a database already shaped that way — which is what lets a new
  table ship with the code that reads it rather than being remembered
  separately.
- **Schema before Worker.** A Worker deployed ahead of a column it selects
  answers every request with a D1 error; a column added ahead of the Worker that
  reads it is simply unread. Same ordering, and the same reason, as deploying
  this Worker before the edge functions that call it.

The app is wired to match: `EXPO_PUBLIC_CATALOGUE_URL` is a **separate EAS
variable per environment**, and the `preview` one names the preview Worker. That
split has to be made with `eas env:create --environment preview` rather than
`env:set` — one variable attached to three environments has one VALUE, so
setting it "for preview" silently repoints production too.

`development` stays on the production Worker on purpose. A PR preview is testing
app code against the Worker that is actually live, and pointing it at preview
would break PRs for reasons outside the PR.

## The preview Worker holds no shared secret

`CATALOGUE_TOKEN` is set on production and nowhere else, so on preview
`isService` is never true and `/product` answers 404 to everybody — the same
answer a signed-in user gets on production, for the same reason. Nothing needs
it there: the shared secret belongs to our own server, and there is one Supabase
project, whose functions point at production.

## Adding a second Worker

A directory under `workers/` with a `package.json` (needs a `typecheck` script)
and a `wrangler.jsonc`. The CI matrix is discovered from the filesystem, so
there is no workflow to edit. Add a `preview` environment to its wrangler config
if it should have one — a named environment inherits `main`,
`compatibility_date`, `placement` and `observability`, and inherits **no
bindings**, so every binding has to be repeated under it.

## Adding a second database

A directory under `d1/` holding `schema.sql` and a `d1.json` naming it. The
schema job iterates the directory, so that is the whole change. The name lives
in `d1.json` rather than being derived from the folder so the folder can read as
English while what is sent to Cloudflare stays literal.

## By hand

```bash
pnpm --dir apps/cloudflare/workers/catalogue exec wrangler deploy              # production
pnpm --dir apps/cloudflare/workers/catalogue exec wrangler deploy --env preview
pnpm exec wrangler d1 execute ricecal-d1-food-catalogue --remote --file apps/cloudflare/d1/food-catalogue/schema.sql
```

The catalogue's own loading and grading scripts live with the Supabase package,
because that is where the payloads are: `apps/supabase/README.md`.
