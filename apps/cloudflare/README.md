# The Cloudflare half

Everything this project runs on Cloudflare, grouped by what kind of thing it is
and then by which one:

```
apps/cloudflare/
  workers/
    catalogue/           the food catalogue API — see src/index.ts for every route
    jobs/                every periodic job — see its README for the format
  d1/
    food-catalogue/      schema.sql, and the database's real name in d1.json
```

One directory per Worker and one per database, because each has its own deploy
and its own name in somebody's Cloudflare account. The layout is what stopped
the second Worker being a decision: `jobs` arrived as a directory and CI picked
it up without a workflow edit.

The two are different KINDS of thing and it is worth keeping them apart in your
head. `catalogue` answers requests and has a hostname; `jobs` answers the clock
and deliberately has none.

A Worker is a pnpm workspace package (`apps/cloudflare/workers/*` in
`pnpm-workspace.yaml`), so it carries its own `wrangler` and its own typecheck. A
D1 directory is not a package — it holds SQL and a name, and nothing to build.

## Where it deploys

Two places, and they are in different workflows on purpose.

**Production** is `.github/workflows/cloudflare.yml`. It runs on nothing but
changes under this directory, and only on a merge to `main`: schema first, then
`wrangler deploy`. A Worker deployed ahead of a column it selects answers every
request with a D1 error, where a column added ahead of the Worker that reads it
is simply unread — the same ordering, and the same reason, as deploying this
Worker before the edge functions that call it. Every statement in a `schema.sql`
is `if not exists`, so re-applying it is a no-op and a new table can ship with
the code that reads it rather than being remembered separately.

**A pull request** is in `deploy.yml`, beside the app's own preview, because a
preview is only a preview if the JS and the catalogue behind it come from one
commit. It runs:

```
wrangler versions upload --preview-alias pr-42
```

A **version**, not a deployment and not a second Worker. It takes 0% of
production traffic, inherits every binding from `wrangler.jsonc`, and is
addressable at a stable `https://pr-42-ricecal-catalogue.<subdomain>.workers.dev`
for as long as the PR is open. So there is no second script to keep in step, no
duplicated bindings to forget, and nothing to tear down when the PR closes.

A PR that touches nothing under `apps/cloudflare` skips the upload and its app
preview falls back to the production Worker, so it still searches a live
catalogue rather than a URL nobody uploaded.

**Everything shares one D1 database**, including PR versions. There is one copy
of the catalogue, it is 257 MB, and it is read-only over HTTP — a preview
pointed at a stub would prove nothing about a change to how 3.2 million packets
are queried. What makes that safe is the route policy rather than the database:
a user's token reaches `/search` and `/food` and nothing else, and the write
route needs the shared secret, which a preview version does not hold.

## Which hostname it answers on

One:

```
https://catalogue.ricecal.app
```

`catalogue.ricecal.app` is a **route** in `wrangler.jsonc`, not a custom domain.
The difference is which credential can create it: a custom domain writes the
zone's DNS itself and so needs one token holding both DNS edit and Workers edit,
where a route needs only Workers edit and sits on a DNS record made separately.
That record is a proxied `AAAA` to the discard prefix `100::` — nothing is
listening there and nothing needs to be, because the route answers the request
before an origin is ever chosen. If the hostname ever starts returning a
Cloudflare error page rather than this Worker's own JSON, that record being
unproxied is the first thing to check.

`ricecal-catalogue.nelson-ganlw.workers.dev` was the second hostname for a
while, and **it is closed now, because this was the only moment it could be.**
`EXPO_PUBLIC_CATALOGUE_URL` is inlined into the bundle at export time, so a
build already on somebody's phone asks for whatever it was built against for as
long as its owner declines to upgrade. Today nothing is in that position:
nothing has shipped, and a dev client reads its JS from Metro or from an
`eas update` on a channel that still receives them. The first build to reach a
store ends that, and the hostname could not have been closed again.

**`preview_urls` has to stay, and has to stay explicit**, because it defaults to
whatever `workers_dev` is — so turning one off silently takes the other with it,
and preview URLs are what `versions upload --preview-alias pr-N` hands to a PR's
`eas update`. Wrangler mentions that default only in a warning printed *after*
the upload has landed, which is how both halves were learnt: the first deploy of
this route turned `workers.dev` off and took the catalogue away from every
installed build, and the second turned preview URLs off.

**The token needs Workers Routes edit on the zone, and the failure names
neither.** A route is applied at deploy time like any other trigger, so an
account-scoped Workers Scripts token uploads the script happily and then fails
on the trigger with a bare "a request to `/zones/<id>/workers/routes` failed" —
after the upload, so the Worker is live and the deploy is red. The tell is the
line above it, that the token lacks "All Zones" permissions; the fix is
Zone → Workers Routes → Edit on `ricecal.app`, on the token behind
`CLOUDFLARE_API_TOKEN`. Zone *read* is not enough and is what makes this
confusing: wrangler resolves the zone name to an id, so it gets far enough to
look as though the permission is there.

The one thing this costs: **the schema is applied on merge only.** A PR's
version reads the database production is serving, so a migration in that PR is
not in effect while it is being previewed. A PR that adds a column and reads it
will fail against the live schema — which is the honest signal, and which is
what the rule below exists for.

## SCHEMA FIRST, THEN THE CODE THAT READS IT

**Always.** Every deploy here is a change to one link in a chain, and the chain
has to be extended from the end nothing is pointing at yet:

```
D1 schema  →  the Worker  →  the Supabase edge functions  →  the app
```

Each arrow is "is read by". Deploy in that order and every intermediate state is
one where something exists that nobody is asking for yet, which is invisible.
Deploy against it and every intermediate state is one where something is being
asked for that does not exist yet, which is an error on a live request.

- A **column** added before the Worker that selects it is simply unread. A
  Worker deployed first answers every request with a D1 error, including the
  requests that have nothing to do with the new column.
- A **field** the Worker starts returning before the edge functions read it is
  ignored. The other way round, `undefined` reaches the cascade and a scan
  silently prices a meal off a missing number.
- The same again for the app: a shape the server has not started returning yet
  is a crash on a screen somebody is already looking at.

CI does the first arrow for you — `cloudflare.yml` runs the schema job before
the deploy job and will not deploy if it fails. **The rest is manual**, because
the Supabase functions deploy with the Supabase CLI and the app ships through
EAS, so a change spanning those is several deploys with a window between each.
Merge and deploy them in the order above, and make each step backwards
compatible so the window is survivable rather than merely short.

Removing something runs the chain **backwards**: stop reading it everywhere
first, ship that, and only then drop the column.

## Pointing a bundle at a PR's Worker

`EXPO_PUBLIC_CATALOGUE_URL` is inlined into the JS bundle by Babel at export
time, so a PR preview reaches its own Worker only if that value is right at the
moment `eas update` exports.

**The obvious way does not work, and fails quietly.** Setting the variable in
the workflow step's `env:` while the update command carries
`--environment development` gets you the production URL: EAS downloads that
environment and ASSIGNS it over the process, overwriting the export. Nothing
errors; the preview simply talks to production. Measured with
`eas env:exec development 'printenv EXPO_PUBLIC_CATALOGUE_URL'` — a value
exported beforehand comes back as the EAS one, and a value set after the load
survives.

So the workflow pulls the environment to a file and rewrites one line of it:

```bash
eas env:pull development                                   # writes .env.local
sed -i "s|^EXPO_PUBLIC_CATALOGUE_URL=.*|...=$WORKER_URL|" .env.local
eas update --branch pr-42                                  # no --environment
```

One source for the export to read, and no precedence left to get wrong. The step
prints the URL it settled on, because the failure it replaced was invisible
precisely because nothing ever did.

## Periodic jobs

`workers/jobs` is where anything on a schedule lives, and it is the answer to
"where does a cron job go" for the whole project. Its own README is the format;
what belongs here is why it is on this side of the fence at all.

**A scheduled job has no user, so it has no business having a URL.** The
photograph sweep was a Supabase edge function until it moved here, called
hourly by `pg_cron` over `pg_net`. It could not authenticate a caller — it runs
across every account — so it ran with `verify_jwt = false` and a shared secret,
which meant a public endpoint whose only guard was a token held in two places
that had to be rotated together. Every other awkward part of that design
followed from the same root: the secret had to live in the vault because
`cron.job.command` is plain text, `retention_runs` had to exist because a
`pg_net` POST cannot read its own response, and the drain loop had to be
abandoned for the same reason.

A Cron Trigger has none of that shape. A `scheduled()` handler is not
addressable, so with `workers_dev: false` and no route the Worker has no
hostname at all. R2 is a binding rather than four credentials. And the job knows
its own outcome, so `job_runs` is written by the run it describes rather than by
the one after it.

**What it costs** is that the Worker holds a Supabase service-role key — a
broader credential than the token it replaced, in a second place. That is
narrowed by what a job can do with it: `src/postgres.ts` exposes `rpc()` and no
table access, so a job's SQL has to be a `service_role` function in
`apps/supabase/schemas`, granted deliberately and tested by pgTAP.

**Adding a job is a file, a registry line and a cron** — see
`workers/jobs/README.md`. No new package, and no workflow edit, for the same
reason a second Worker needs none.

## Adding a second Worker

A directory under `workers/` with a `package.json` (needs a `typecheck` script)
and a `wrangler.jsonc`. The CI matrix for typecheck and the production deploy is
discovered from the filesystem, so there is no workflow to edit.

It gets no PR preview of its own, and that is deliberate rather than an
oversight. The preview exists to point an app bundle somewhere, and `catalogue`
is the one Worker the app talks to — so `deploy.yml` names it. A second Worker
wanting one would need a second `EXPO_PUBLIC_*` to point at it, which is the
change to make at that point.

## Adding a second database

A directory under `d1/` holding `schema.sql` and a `d1.json` naming it. The
schema job iterates the directory, so that is the whole change. The name lives
in `d1.json` rather than being derived from the folder so the folder can read as
English while what is sent to Cloudflare stays literal.

## By hand

```bash
cd apps/cloudflare/workers/catalogue
pnpm exec wrangler deploy                              # production, 100% traffic
pnpm exec wrangler versions upload --preview-alias me   # 0%, at me-<worker>.workers.dev
pnpm exec wrangler d1 execute ricecal-d1-food-catalogue --remote \
  --file ../../d1/food-catalogue/schema.sql
```

The catalogue's own loading and grading scripts live with the Supabase package,
because that is where the payloads are: `apps/supabase/README.md`.
