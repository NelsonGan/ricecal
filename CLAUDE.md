# RiceCal

A calorie diary for Malaysian eating. Photograph a plate, describe it in words,
or scan a barcode — and get calories and macros back.

```
apps/mobile      Expo / React Native app (expo-router, NativeWind, react-query)
apps/supabase    Postgres schema, RLS, pgTAP tests, Deno edge functions
apps/cloudflare  workers/ and d1/, one directory per Worker and per database
packages/shared  the few constants both sides need
```

Deeper docs live next to what they describe, and they are the authority on
their own area:

| where | what |
|---|---|
| `apps/supabase/README.md` | the declarative schema workflow, the catalogue import, why nothing seeds `foods` |
| `apps/cloudflare/README.md` | the layout, where it deploys, and how a PR gets a Worker of its own |
| `apps/cloudflare/d1/food-catalogue/BARCODE-COVERAGE.md` | why the scanner misses Malaysian packets, measured, and what would actually fix it |
| `apps/mobile/src/data/README.md` | the data layer, file by file |
| `apps/mobile/src/features/auth/README.md` | the four ways in, why the mail carries a code, and how to switch Turnstile on |
| `apps/supabase/templates/README.md` | the eight auth emails, and why the code comes before the link |
| `apps/mobile/src/ui/README.md` | the design system, and which prop targets which box |
| `apps/mobile/src/lib/health/README.md` | what each health store actually gives you, and what Android is missing |
| `apps/mobile/src/lib/analytics/README.md` | the Mixpanel tracking plan, and what was deliberately left out of it |
| `apps/mobile/AGENTS.md` | Expo 57 changed; read the versioned docs before writing Expo code |

---

## The shape of the whole thing

Three layers, and the boundary between them is the same in every feature.

**Postgres owns every number.** A day's calories, an entry's macros, the budget
in force, "days under goal" — each is a view or a function, so the arithmetic
happens once, in the place a future reminder job or weekly report can read
without a client. `src/lib/nutrition.ts` holds what is left: presentation, and
one projection of a budget that does not exist yet because onboarding has not
finished.

**The catalogue is NOT in Postgres.** It is in Cloudflare D1, behind the Worker
in `apps/cloudflare/workers/catalogue` — `product` holds 3.25 million barcoded packets, and
`food`, `food_serving` and `food_alias` hold ~53,000 searchable dishes. It left
because the barcode layer made the catalogue's size the diary's problem: it
crossed a plan ceiling once and took the whole database read-only mid-load.

A foreign key cannot cross into another database, so **an entry carries its own
numbers**. `food_logs` holds `item_name`, `base_kcal` and the rest of the
snapshot, and `food_log_details` does the same arithmetic it always did —
base × factor × quantity — over the row instead of over a join. `food_id` and
`serving_id` survive as SOFT references, unconstrained, so a future job could
re-snapshot. The trade runs the other way now: correcting a dish in the
catalogue no longer corrects the diaries that used it. What it buys is a
catalogue that can be truncated and rebuilt without touching anybody's diary.

**The app reads that Worker directly, and the Worker checks who is asking.** It
went through a `catalogue` edge function for a while, because the only
credential the Worker understood was a shared secret and a secret in a phone is
not a secret. What changed is that the project signs its JWTs ASYMMETRICALLY:
Supabase publishes an ES256 public key, so the Worker verifies a user's own
token while holding nothing that could forge one. The phone still carries no
secret, and the hop is gone — measured, a search went from ~420 ms to ~177 ms,
having previously travelled to Singapore and back before it started.

Two credentials reach that Worker now and `ROUTES` in its `index.ts` is the
policy. A user's JWT reaches `/search` and `/food` and nothing else; the shared
secret is our own server (the scan cascade, the barcode function) and reaches
everything, including the write. A user token asking for anything outside those
two gets a 404 rather than a 403, because a signed-in person has no business
knowing the write route is there. An account is also what a rate limit is keyed
on, since an account is now what it costs to read the catalogue.

The shapes the Worker returns are deliberately the shapes `food_details` used to
return.

**The client reads through hooks.** Everything in `src/data` is a react-query
hook, one file per area, and no screen imports `supabase` directly. Every
mutation owns what it invalidates, so a screen never has to know what its write
touches. `keys.ts` holds every query key in the app, in one file, so a mutation
invalidating "the day" cannot spell it differently from the query that reads it
— the failure mode there is a screen that silently does not refresh, which
looks like a caching bug and is really a typo.

**Edge functions own the model.** The client never talks to OpenRouter and never
sees the key. It uploads a photo (or a sentence) and invokes a function, which
does everything else and writes the row itself as `service_role` — it has to,
because a scan also writes `food_scan_items`, which is the pipeline's own
working notes and is granted to `service_role` alone.

**Images live in Cloudflare R2, behind the `photos` function.** Postgres used to
own this too: Supabase Storage let the client talk to the bucket and let eight
RLS policies over `storage.objects` decide whether it was allowed to. R2 has no
notion of a user, so that check is now `ownsKey` in `functions/_shared/r2.ts` —
one line of TypeScript where there were eight policies, and the only thing
standing between two users' diaries. The client holds no credential: it asks for
a signed URL and gets one that expires. Uploads still go phone → R2 directly, so
only the signature is a round trip, and `data/photos.ts` batches the read
signatures a screenful at a time because a list of plates would otherwise be a
list of cold starts.

The signature is also the only part of a photograph that is ever fetched twice.
The bytes are cached on the device under the key rather than under the URL, so
`resolveStoredImage` asks expo-image where a picture already is before it asks
the server to name it — a launch into a familiar diary draws off the disk and
invokes the function not at all. An upload seeds that cache with what it just
sent, so the phone never downloads back a plate it photographed.

Cached queries persist to MMKV, so a relaunch has yesterday's answers before the
first request returns. `SCHEMA_VERSION` in `packages/shared` is the persister's
cache buster: bump it whenever the shape of anything persisted changes, or old
data rehydrates into new code.

**A query with no connection is PAUSED, never sent** — `networkMode: 'online'`,
the same signal that already gates every write. Reading the cache is untouched
by that; only the request is. The ONE exception is the photo query, and it is
the exception for the reason given in the invariant below: `resolveStoredImage`
asks the disk before it asks the server, so it is the only query in the app
worth running with no connection. Paused, a diary of plates this phone had
already downloaded drew as a column of empty tiles. It was `offlineFirst` for a
while, which reads like
the offline-tolerant setting and is the reverse: it sends the first request
whatever the connection and pauses only the retries. Nothing in the app is
written against that. The router, Today and the search panel all key on a query
being paused, and none of them could say so until the doomed first request had
failed — which took THIRTY SECONDS, because a request waits on the access token
and supabase refuses to hand one over until it has finished retrying a refresh
it cannot send (`AUTO_REFRESH_TICK_DURATION_MS`). A launch with no signal was a
spinner for all of it.

The quieter half is what that cost the diary. A failed query ends `error`, only a
`success` is dehydrated, and the persister writes the whole snapshot — so each
offline launch saved a copy with the failed queries missing, and offline worked
once and then less. The profile went first, being the one query whose screen
redirects away while it is still in flight: losing its last observer cancels the
retry that would have paused, and it settles as an error over data that was
perfectly good.

---

## Launching, and where a user lands

`app/index.tsx` is a redirect, not a screen, so there is never a back-stack
entry pointing at nothing. It asks three questions in order — is the keychain
read still in flight, is there a session, does the profile have `onboarded_at` —
and the order is the flow.

The first of those is the KEYCHAIN READ and nothing else, which is a narrower
wait than it used to be. `SessionProvider` asked supabase, and supabase answers
that question last: it reads the same key first, then refreshes a token within 90
seconds of expiring, and only then says who is signed in. Offline that refresh is
half a minute of backoff, and the whole app was a spinner behind it. So the
provider races `whenStoredSession()` — which resolves the moment the adapter has
been asked for the key — against `getSession()`, and lets the real answer land on
top whenever it arrives. Storage cannot know about a session revoked while the
app was closed; that corrects itself twice over, from the call and from the
`SIGNED_OUT` that follows it. The questions come BEFORE the account, and so the
local draft rather than the session is what says how far they got. The draft is
in MMKV and outlives the account it was flushed for, which is why a signed-out
relaunch starts at the top rather than resuming.

The flow is eight numbered steps plus a welcome, and it is in two halves with
the account write between them:

```
welcome                          the pitch, and the fork for a returning user
1 about   2 activity  3 source    the questions, drafted locally
4 calculating                    a beat, then it replaces itself with…
5 target                         the budget, worked out on the phone
6 account       (auth)/sign-in, carrying the same bar through the params
                Apple, Google, or an address, which leads to (auth)/password
                and then (auth)/verify if a code is owed
  finish                         the one write: profile, first weigh-in, onboarded_at
7 health        connect the store — a permission that GIVES rather than asks
8 notifications turns the three meal reminders on, not just the OS permission
  paywall/intro                  the offer, with "Maybe later" leading to Today
```

**Two screens have left this list.** "How do you usually makan" wrote a
`profiles.food_styles` array that ranked nothing — search is the Worker's, and
its prior is locale, popularity and verification — so it was a question whose
answer changed nothing standing between a user and their diary. And the TOUR is
no longer part of the flow at all: it was four cards of prose read by somebody
who had been answering questions for two minutes and had still not seen the app.
It lives at `/tutorial` now, offered once from Today as a toast a beat after the
diary appears (`features/tutorial`), and permanently from a row in Me. Nobody
reads a manual for a thing they have not touched.

The paywall is the last thing rather than a step of its own. "Later" lands on
the real app, and the app it lands on WORKS: three photographed plates a day,
the barcode scanner, the whole catalogue, three recipes, the week's trends. See
"Free and Pro" below for the whole of it. "Later" used to land somewhere much
thinner — every write was gated, so the free app was a search box over a diary
nobody could add to — and before that on a read-only preview of the diary, which
was a mock of the app and a worse answer than the app.

**NOTHING IN THIS FLOW HAS AN EDGE SWIPE.** It was off from `finish` onwards
already, because everything after the account REPLACES its predecessor: the
stack under "Connect Apple Health" is still a question from before the account
existed, so a gesture there walked a minute-old account back into "Where did you
hear about us?". The questions kept it until the same thing turned up one step
earlier — the account screen is in `(auth)`, so the flow crosses out of the
group and back, and a swipe after signing in unwound the ROOT stack rather than
the questions. So `(onboarding)`, `(auth)` and the two group entries in the root
stack all carry `gestureEnabled: false`, and going back is `StepHeader`'s
chevron, which each screen points where it belongs.

The first question also answers NOTHING for the user. Every control on `about`
starts empty and Continue is dead until all five are filled: it used to open on
164 cm, 65 kg, 29, female, and every one of those is a real answer as far as
`compute_targets()` is concerned, so tapping straight through produced a calorie
budget worked out for somebody else with nothing on screen to say so.

The two permissions sit AFTER the account because both of them need one — a
health connection is a row keyed by user, and enabling a meal reminder is a
write to `meal_times`. They could not have been asked any earlier. Neither can
block: a refusal, an unusable store or a failed write says so in a toast and
carries on, because there is a whole tab for trying again and no version of a
permission screen should stand between a new account and their diary.

The step numbers come from `ONBOARDING_STEPS` in `features/onboarding/steps.ts`
and nowhere else. Written per screen they lasted until a screen was inserted:
the questions said "of 4" while the permissions after them said "of 9", and
nothing about that failed to typecheck. Removing one is now one line there.

`app/_layout.tsx` stacks the providers, and the nesting is load-bearing:
`ThemeProvider` above the navigator so every screen and Modal inherits the
palette (the CSS-variable scope follows the React tree, not the native view
hierarchy); `SessionProvider` inside the query provider because signing in and
out clears the cache, and one account's diary must never appear under another's
name even for a frame; `ToastProvider` outside the navigator so a "saved"
confirmation survives the screen that fired it popping.

Routes come in two shapes. **Full pages push** — settings, the reports, search,
the dish detail, one recipe, the reviews list and one review — and carry a
chevron in their own `AppBar`. **Modals present** — the quick selector, the
paywalls — and carry a cross. Every screen draws its own title bar; the native
header is off everywhere. A tab carries a `ScreenTitle` instead, because there
is nothing behind it to go back to.

A review used to be the exception, presenting for a REASON rather than by kind:
it paged sideways, so a pushed screen would have spent that gesture on the
interactive pop. It scrolls now, and the exception went with the pager.

Five tabs — Today, Recipes, Activity, Trends, Me — on the headless
`expo-router/ui` Tabs rather than a styled navigator, because `NavBar` /
`NavItem` are the design system's and a native tab bar cannot be made to look
like them.

**The log button is not in the bar.** It used to be, raised, in the middle, and
that is what capped the bar at four tabs: a centre action is centred by having
the same number of tabs either side of it, so a fifth put it a tenth of the bar
off to one side. It is a `FloatingAction` at the bottom right of Today now,
through `Screen`'s `floating` slot — which overlaps the scroll content rather
than sitting above it like `footer`, so a screen using it owes its last row
enough bottom padding to be read.

Singular and plural is the information hierarchy, not a naming quirk:
`/recipes` is the tab, and `/recipe/[id]` and `/recipe/edit` are pages you go
to and come back from. Those two have a layout of their own that waits for the
session, because a shared recipe is a link and a link is opened cold — before
the keychain read that restores the session has finished.

---

## Getting in

Apple, Google, a password, or a code in the post. `(auth)/sign-in` asks which,
and asks for the address and nothing else; `(auth)/password` owns the rest.
Full version in `apps/mobile/src/features/auth/README.md`, which is the
authority. Three things belong here because they shape more than the auth
screens.

**THE MAIL LEADS WITH A CODE, and the link is the second offer.** It was a link
alone, and the reasoning was sound until it met the rest of the world. A
Supabase confirmation link is single use, and corporate mail security fetches
every link in an incoming message to check it — so the mail arrives already
spent and the app says it expired ten seconds after it was sent. And a link only
works on the phone the app is on, which is not where most people read mail. Six
digits have neither problem: nothing consumes a code by reading a mailbox, and
it crosses devices in somebody's head. `{{ .Token }}` is in the subject line as
well as the body, so a signup can be finished from a notification banner.

**Nothing said the redirect was broken, because nothing could.** Supabase DROPS
an `emailRedirectTo` that is not in the allow-list and quietly substitutes
`site_url`. The hosted project had an empty allow-list and
`http://localhost:3000`, so every link in every mail opened localhost on
somebody's phone — a bug that reads as the app's and is two fields in a settings
page. Both are `pnpm auth:config` now, which prints a diff before it writes, and
the site URL is the app's own scheme so even the fallback lands somewhere real.

**A password is an option, never a wall.** Every screen in the flow also offers
the mailed code, because the failure a password has on a phone keyboard is a
support ticket and the recovery for it is an email anyway. An account made with
a code has no password until it sets one.

---

## What the database holds

```
auth.users
  └── profiles ────────────── body + target weight: the calorie budget's inputs
       ├── user_settings ──── display, notifications, privacy
       ├── meal_times ─────── when each meal is, and whether to remind
       ├── daily_goals ────── the budget, effective-dated
       ├── subscriptions ──── read-only mirror of RevenueCat
       ├── scan_usage ──────── scans spent, one row per LOCAL day, per tier
       ├── food_logs ──────── what was eaten, WITH ITS OWN NUMBERS
       │    └── food_log_ingredients   what a scanned plate was made of
       ├── daily_logs ─────── water and a day note
       ├── recipes ────────── home cooking       → recipe_ingredients
       ├── weight_logs ────── the source of truth for current weight, TYPED OR SYNCED
       └── health_connections  which health store, and how far back it has read
            ├── activity_days ───── one day of movement, keyed by local date
            ├── activity_sessions  one workout, keyed by the store's own id
            └── activity_hours ──── steps by local hour, last month only

archetypes                    the ~60 tier-5 fallbacks the scan cascade lands on
food_scan_items               what the model claimed, and where it landed
food_scan_misses              the catalogue-widening backlog
barcode_misses                the same, for packets
```

`foods`, `food_servings`, `food_aliases` and `food_sources` are NOT here. They
are in Cloudflare D1 — see the top of this file — and nothing in Postgres joins
to them.

The archetypes are, and that is deliberate: tier 5 is where a scan lands when
the catalogue, the model or the NETWORK has failed it, so reading it over HTTP
would make the fallback for "the network failed" another network call. Its rows
come from `seed_archetype_foods()`, a function rather than inserts because
schema files only shape the shadow database during a diff, and data written
there would never reach a migration.

Read shapes are views, all `security_invoker`:
`food_log_details`, `food_log_ingredient_details`, `daily_nutrition`,
`user_food_stats`, `current_daily_goals`, `recipe_details`,
`recipe_ingredient_details`. Plus `goals_on(date)`,
`logging_streak()`, `day_marks(from, to)`, and three range families —
`trend_days` / `trend_series` / `trend_summary` for the diary,
`activity_days_range` / `activity_series` / `activity_summary` for movement, and
`review_days` / `review_periods` / `review_summary` / `review_series` /
`review_meals` for a finished week or month. The review family is the one that
takes DATES rather than a named window, because "the week of 3 August" stopped
moving when the week ended and `local_today()` has no name for it.

`weight_logs` has two authors. `provider` is null for a reading the user typed
and names a store for one read off Apple Health or Health Connect, and the two
are not equal — see the invariant below.

Three things are effective-dated or keyed in a way worth knowing. `daily_goals`
is one row per change rather than one mutable row, so a target tightened on
Thursday does not redraw Monday. `activity_sessions` is keyed by the store's own
id, because two badminton games can start in the same minute. And
`meal_times.at` is a `time` rather than a timestamp, because "08:00 in the
user's own clock" stays true when they fly somewhere else.

The schema is DECLARATIVE: `apps/supabase/schemas/*.sql` is the source of truth
and migrations are generated from it, never hand-written. The exceptions are
documented in `apps/supabase/README.md` — the archetype seed call, which is data
rather than structure, and the `auth` trigger, which the diff sees too well.

---

## The catalogue, and what is in it

It is in Cloudflare D1, behind the Worker in `apps/cloudflare/workers/catalogue`:
`../../d1/food-catalogue/schema.sql` is the shape, `src/index.ts` is every query.
Both deploy from CI on `main`, schema first — `apps/cloudflare/README.md`.

**Two tables, and their sizes are opposite on purpose.**

```
food          52,900   everything findable by typing
product    3,255,494   packaged goods, reachable by an exact barcode and nothing else
```

**Name search wants to be small.** Every row it holds is a competitor for rank.
The catalogue held 464,000 once, 450,000 of them USDA Branded — American
supermarket packaging, imported because it was free — and they made fuzzy
matching unaffordable: "milk" rechecked 60,934 rows and took 785 ms.

**Barcode lookup wants to be enormous.** A code is exact, so a row it will never
match costs nothing but disk, and the only real failure of a scanner is a packet
it has never heard of.

Two tables is what lets both be true. `product` is a barcode primary key with no
secondary index, so 3.25 million packets cost search no rank, no index memory and
no query time.

What is in `food`:

| source | rows | |
|---|---|---|
| Open Food Facts | 25,422 | Southeast Asian shelves and the world's most-scanned |
| USDA (Foundation, SR Legacy, FNDDS) | 13,276 | measured generic food |
| researched Asian dishes | 7,701 | 60-odd payload files under `apps/supabase/data/foods` |
| other national composition tables | 4,574 | Singapore, Vietnam, Indonesia, Taiwan, India, Thailand, Japan |
| MyFCD | 1,412 | the Malaysian composition table |
| hawker / chain / drinks | 451 | recipe-derived from measured rows |
| archetypes | 65 | the tier-5 fallbacks, which also live in Postgres |

**Seven other countries publish a composition table, and reading one beats a
research round on every axis.** The figures are measured rather than reasoned,
the round is a script rather than two days, and the rows can claim `verified`
honestly — Singapore's carry a household portion with its weight and say whether
each is a lab analysis. What they cost is judgement at the door: a table is
mostly ingredients, and importing one whole is the USDA Branded mistake in a new
accent, so each is loaded as a SLICE. Which slice, and where each table lives,
is in `apps/supabase/data/foods/README.md`.

Three things ride along with a dish, and each removed a workaround:

- **Aliases are rows** (`food_alias`), not tokens in a search bag. An alias among
  fifty words scores like one word; an alias in a table of its own scores like a
  name.
- **Portions carry their weight** (`food_serving.grams`). `servingGrams` in
  `_shared/portion.ts` had to recover it from the label with a regex, which is
  why it refuses to read cups and spoons. The cascade reads the STATED weight
  first and the label only as a fallback (`rowGrams` in `cascade.ts`) — reading
  the label alone switched the weight path off for exactly the rows that had the
  number, since a curated Malaysian dish says "1 plate" and carries the 300 g in
  a column beside it.
- **Provenance travels as columns** (`source_id`, `source_name`,
  `source_attribution`), carrying the licence and the attribution the detail
  screen prints. Open Food Facts is ODbL: serving its facts through an app is a
  Produced Work and attribution is required.

`search()` fuses FOUR arms with Reciprocal Rank Fusion — exact name, exact
alias, full text, trigram — then multiplies a **bounded prior** (locale,
popularity, verified; capped at 1.35) that can settle a near-tie and can never
outrank relevance. The two FTS5 indexes are contentless, and `food_trgm` is the
one thing that had to be rebuilt rather than ported: `pg_trgm` scored
similarity, while FTS5's trigram tokenizer only matches substrings, and a
misspelling is by definition not a substring of the right spelling. The Worker
splits the QUERY into trigrams and lets bm25 rank by how many a row shares.

**The two exact arms match a stored NORMALIZED column**, `food.name_norm` and
`food_alias.alias_norm`, each indexed. Written as `lower(name) = ?` they were
two bugs in one expression: no index can serve that, so every search full-scanned
both tables before the FTS arms had done anything, and `lower()` is not the
folding the query went through, so "Chicken Rice (Nasi Ayam)" could not be
reached by typing its own words. Both arms are two rows read now.

**A catalogue load is gated on search quality**, because it is the one change
here that can silently make the app worse: nothing errors, "nasi lemak" just
starts returning something else. `pnpm foods:gate --save before` records thirty
queries and where the dish a Malaysian means by each lands; `--against before`
prints only what MOVED. Adding 300,000 packets moved nothing, and so did 709
Singaporean, Indonesian, Thai and Filipino dishes — which is the outcome an
additive round should have.

One caveat the gate itself taught: a FULL reindex reshuffles near-ties. The
rowids are reassigned, an FTS arm orders by `bm25` and breaks ties by rowid, and
RRF fuses positions — so two rows a hair apart can swap. It moved one gate query
back and forth across rank 1 and 2 with no data change at all. Grade after the
reindex, not between it and the load.

## Logging a meal

Four ways in, and the FAB opens all of them in one sheet (`app/log/index.tsx`):
**Snap** a photo, **Describe** it in words, **Scan** the barcode, or **Search**
the catalogue. Whatever the route, the entry is written against `selectedDate` —
the day the strip on Today has selected, not necessarily today.

Search, scan and quick-add are ordinary writes. The other two run the cascade.

### Scanning a barcode

The only exact way in. Everything else asks a model what something is or asks
the user to spell it; a barcode IS the product, so there is no ranking, no
candidates and no confidence — one row or none.

```
camera reads a code → LEAVE IMMEDIATELY for /log/food/packet:<code>
                    ↓
  functions/barcode   D1 by barcode          hit  → the product, priced
                      Open Food Facts, live  hit  → written back, returned
                                             miss → "we do not have this one yet"
                                                    + Describe + Scan again
```

**The viewfinder does not wait for the answer**, and that is the whole shape of
this flow. It used to: the panel awaited the lookup, put a spinner over the
camera and said which of four things was happening underneath. Three of those
four states were a person standing in a shop watching a camera not move — the
live fallback allows six seconds for Open Food Facts — and the one state that
worked then replaced the sheet with a different screen anyway. So the code IS
the answer as far as the scanner is concerned, and the page it hands the code to
owns every way the lookup can turn out: a skeleton of the product page while it
waits, the product when it lands, and a screen with Describe and Scan again on
it when nothing knows the packet.

A packet reaches that page under an id of its own, `packet:<code>`. A packaged
product lives in D1's `product` table keyed by the barcode and has no `foods.id`
at all, so before this the scanner had nothing to put in the `[id]` segment and
the app answered a correctly identified packet with its own "page not found".
`packetFoodId` mints the placeholder, `useFood` knows to resolve it through the
scanner's endpoint rather than the catalogue's, and `snapshotFromFood` drops it
again before it can reach `food_logs.food_id` — which is a uuid column, so a
placeholder arriving there is not a dangling reference but a 22P02 on the last
tap of the flow. It is the same treatment `ENTRY_FOOD_ID` gets, for the same
reason.

"Scan again" goes to the day with the scanner already open (`/log?panel=`),
because where the user was is a viewfinder inside a sheet this screen replaced,
and there is nothing behind it to go back to. It drops the packet's cached
answer on the way, or a rescan after a lookup that could not reach the catalogue
would be answered from the cached failure without asking anybody.

Codes are stored as **GTIN-14**, zero-padded, because one packet has four
spellings (UPC-E, EAN-8, UPC-A, EAN-13) and an American scanner drops the
leading zero an EAN-13 carries. Padding both ends makes them one key; `gtin14`
exists in SQL and again in the edge function, deliberately duplicated and
separately tested, because the function has to normalize before it can ask
Open Food Facts anything.

The live fallback is what makes the stored slice an acceptable trade. D1 holds
3.2 million packaged products; Open Food Facts has 4.7 million, and the ones
anybody actually scans get written into the catalogue permanently the first time
they are scanned — so the second person to scan that packet gets the index probe.
The check digit is deliberately **not** validated: real packets and OFF both
carry codes that fail it, and a lookup that refuses to try is worse than a miss.

A product with no macro panel is never written. `foods.carbs_g` and its
neighbours are `not null`, so the only way to store one is to fabricate zeros,
and "0 g protein" against a tin of tuna is worse than not having it.

**And Malaysia is the thin part of all of it.** Of those 3.2 million rows, 4,333
carry a GS1 Malaysia prefix — fewer than Thailand, and 0.13% of the catalogue.
That is not a filter in this repo: the pipeline takes every OFF product with a
panel and a code, and 4,333 is 96.5% of every Malaysian-prefix row Open Food
Facts has that is usable at all. The source is the ceiling.
`apps/cloudflare/d1/food-catalogue/BARCODE-COVERAGE.md` is the measurement and the options.

### The cascade

**Client** — `src/data/snap.ts`

1. The shutter (or the send button) puts a *pending snap* on the day
   immediately, in context and MMKV (`data/pending-snaps.tsx`), because there is
   no row to insert yet. `useDayLog` merges it into the day.
2. It also **schedules** the "your plate is counted" notice right there. iOS
   suspends a backgrounded app within seconds, so code that runs when the answer
   arrives may never run; a notification already scheduled still fires. It is
   cancelled if the app is awake when the scan lands.
3. Upload first, then invoke — the function reads the photo out of the bucket,
   so there is nothing to recognise until the object exists. A typed meal skips
   this and is one call shorter.
4. On success the pending row is dropped and the day refetches into the real
   entries. A pending row whose entry arrived by another route (a refetch on
   focus) is recognised by SOURCE and timestamp and dropped, or the meal appears
   twice for a second.

**Server** — `apps/supabase/functions/scan-meal/index.ts`, cascade in
`_shared/cascade.ts`, model calls in `_shared/llm.ts`

One vision call returns queries, per-component sizing and a kcal *range* — never
nutrients.

Sizing is a WEIGHT before it is a calorie count, and `_shared/portion.ts` is
what that buys. Grams are the one thing about a portion a picture actually
carries, and unlike a calorie figure they can be checked: against the macro
grams the model reports beside them (matter cannot outweigh the thing it is in,
and a cooked food is mostly water), and against the catalogue rows that state
their own serving weight — "100 g", "3.0 oz", "1 bowl (400 g)" — where 30 g of
the thing is arithmetic rather than a second opinion. Everything downstream used
to be anchored to the model's kcal instead, which is how one bad guess became a
bad entry: told a satay stick was 180 kcal, the catalogue search accepted rows
within a band around that figure, so the catalogue's own 36 kcal a stick was
excluded and four skewers were logged at 720. Weights only ever bound a figure
DOWNWARDS; a number too big for its mass is impossible, while a number too small
for it usually means the mass was measured against the wrong thing.

Then, in order:

- **Nutrition panel** → read the figures off the label and stop. Nothing is
  searched or estimated; somebody photographing a panel is saying the answer is
  printed here.
- **No food** → answer `{ok: true, food: false}`, write nothing. A blurred plate
  is still a meal; a photo of a cat is not.
- **Tier 2, components** — when the model *listed* ≥2 parts. Each resolves to its
  own catalogue row (or a per-unit estimate row) and the entry is their sum.
  Gated on the list, not on `scene`: a banana leaf of satay came back "single"
  with three components on it.
- **Count** — several of one countable thing. Three durian are three, priced per
  unit, counted in the portion where the stepper reaches it.
- **Tier 1/3, dish** — the Worker's search (specific → generic → head noun), a
  verifier picks one, a wide ratio gate accepts it. Identity is what a vision
  model is good at; calories are what it is worst at.
- **Tier 4, estimate** — a second model call, Atwater-checked, kept as numbers
  on the entry. It used to write a shared catalogue row deduped on name and
  size; a guess reused is still a guess, and it cost a client-facing table the
  scan pipeline wrote to.
- **Tier 5, archetype** — classification over the seeded generic rows, bottoming
  out at a terminal "Mixed meal" at a hardcoded id that needs no model and no
  network.

Once the caller is authenticated and the body parses, this endpoint does not
return an HTTP error: every failure falls to the archetype floor, because a
diary that refuses the meal is worse than one that logs it roughly.
`food_scan_items` records what the model claimed and where it landed;
`food_scan_misses` is the catalogue-widening backlog.

### Typed and photographed are the same pipeline

A meal can be TYPED — "nasi lemak with fried chicken and a teh tarik" — and that
is the same endpoint and the same cascade. Only the first model call differs:
`describeMeal` instead of `analysePhoto`, both answering in the same `Vision`
shape. `food_logs.source` (`text` vs `camera`) is the only place the two part
company afterwards.

The difference between the two prompts is WHO THE AUTHORITY IS. A photo has one
witness and it is the model, so everything it says is inference the catalogue
then checks. A sentence was written by the person who ate the meal, so what it
states — the dish, the number of them, the size, a calorie figure — is the
answer, and the model's job is only to name it searchably and price the portion
it was told about. The shared parts of both prompts are shared CONSTANTS in
`llm.ts`; the size anchors in them were expensive to derive and a second prompt
with its own copy would have relearned them wrong.

**A stated portion is a `count` below one, and a dish the person named as one
thing stays one thing.** Both were prompt rules that did not hold. "Half a plate
of char kuey teow" put the half in the calorie bounds and in the words, neither
of which the app can act on, and logged a whole plate three times out of three —
so a fraction of a serving now lives in `count`, which is the one number that
survives into the logged portion, and `grams` stays the weight of one whole
unit. And "chicken rice" came back decomposed into coconut rice plus roast
chicken (wrong twice over: the rice under a chicken rice is not coconut rice) no
matter how the prompt was worded, so on the TYPED path it is enforced instead —
`keepDishesWhole` drops a breakdown when the sentence contains nothing that
could join two foods. That check is possible here and only here, because this is
the one path where the app knows exactly what the person wrote.

The client mirrors that difference only where it has to: a typed row wears the
sentence until the dish lands, because a snapped row has its photograph and a
typed one would otherwise be a spinner over an empty line.

**A typed meal also picks its own drawing**, and only a typed one. It has no
photograph, so the row would be a name over an empty square in a diary where
its neighbours have pictures, and the model that just read "nasi lemak with
fried chicken" knows perfectly well which of our illustrations that is. So the
prompt carries the list of icon names and the answer is validated against it in
`_shared/icons.ts` — the one place in a scan where a hallucination CANNOT be
useful, since an invented name renders nothing. A photographed meal is never
asked: it has the better picture, and `food_logs` holds one or the other. Same
split on a recipe, for the same reason.

Two things about that list were learnt immediately. Two hundred hyphenated
slugs is the largest block of example text in either prompt, and a model reads a
long list of names as the vocabulary it should answer in: asked for "Fried flat
rice noodles with prawns" it came back NAMED `Char-kuey-teow`. So the block goes
last, after every field it could contaminate, and says outright that these are
filenames and belong in no other one. And a rejected name is logged, because it
is the one failure on this path with no symptom — a near miss looks exactly like
a row that never had a drawing.

The names come from `icons.generated.ts`, written by the same script that builds
the app's icon registry: edge functions are Deno and cannot import it, and a
hand-kept second copy drifts the first time an icon is renamed.

### Correcting it

There are two ways to change a logged entry, and they are separated because
they cost different things.

**By hand, on `app/log/food/[id].tsx`.** ONE SAVE PER SECTION, and there is no
Save button on the page. Every edit used to stage in local state and one footer
button wrote the lot — a coherent model for a page of controls, and it stopped
being one when each group moved behind a pencil into a sheet of its own: a sheet
with a Done button that writes nothing is a second staging level, and nobody
reading "Done" expects to have to find another button afterwards. So each sheet is
a form that saves what it is about, the footer is left with the one thing that is
not a section of this entry (handing the meal back to the model), and leaving the
screen loses nothing — which is why the discard prompt, the disabled edge swipe
and the Android back handler behind it are all gone.

Each `save*` function on the screen throws on failure so its sheet can stay open
with the draft still in it, and stages the value locally as well: the write
invalidates the day and the refetch is a round trip behind it, so without the
local copy the card would show the old figure for that beat.

THE PORTION IS THE EXCEPTION, and it saves on a SHORT DEBOUNCE. A plus and a minus
have nowhere to put a Save, and written per tap they are three round trips to reach
two and a half plates. The objection to debounced writes was about a whole page of
them — "a plate corrected in four places was four round trips, and changing your
mind meant changing the control back" — and none of it applies to one control whose
only state is one number. A pending edit is flushed on unmount through a ref, so
backing out inside the debounce window does not drop it.

The ADD path is untouched by all of this: composing a row genuinely is a staged
form, since there is nothing to write until Add.

**The plate is the top of the screen, full width, with the chrome floating on
it.** It was a padded tile under an `AppBar`, and the two were one job in two
boxes: the bar held the way out and the way to delete, the tile held the picture,
and between them they spent a fifth of the screen on things that are not the
meal. The photograph goes edge to edge now (the `Screen` is `flush`, and one
wrapper puts the gutter back for everything under it), the chrome sits over it —
back on the left, the entry's pencil and the bin on the right, in that order,
least to most destructive — and the dish name is the page's own heading
underneath, where it stopped truncating: a bar between two 44pt buttons had room
for about three words of "Nasi Lemak with Fried Chicken with pineapple juice".
The name and the time under it are ONE block rather than two stacked children, so
they read as a heading and its subtitle instead of a date floating between the
title and the first card. Square on every edge — it is not a card hanging off the
top of the screen, it is where the screen starts — and it runs BEHIND the status
bar rather than stopping under it. `Screen`'s `flush` keeps the top inset as
padding, which is right for content and wrong for a picture that is meant to BE
the top of the page: it left a band of canvas above the plate at rest and let the
plate slide under the clock as soon as the page moved, so the photograph was cut
around the notch either way. A negative margin cancels that padding and the height
takes it back, so everything below stays where it was, and the floating chrome
pads itself down past the notch. The trade is the status bar, which draws in the
theme's colour over whatever is up there.

The two ENTRY-level controls are together up there for a reason. The pencil was at
the end of the date line, which read as "edit the date" when what it opens is the
name and the when; beside the bin it reads as what it is — the other thing that
acts on the whole entry — and the date line goes back to being a fact.

**Each editable group carries one pencil**, and the pencil opens a sheet: the
entry's own details (`DetailsSheet` — the name and the when), the figures
(`NutritionSheet`) and the plate (`PlateSheet`). All three were edited WHERE THEY
WERE READ for a while — tap the calorie total and it became a caret in its own
place, tap a macro amount and the same, tap the title in the app bar and the
heading turned into a field, and every ingredient row carried a pair of stepper
buttons. One figure at a time it was a lovely mechanic; as a form it was a bad
one. Nothing said which of the four figures had already been changed, the number
pad covered the bars whose labels were the only thing distinguishing them, and two
buttons on an ingredient row took enough width that a part's name was truncated on
the one screen whose job is checking what the model decided the plate was made
of. The card shows the whole name now.

THE PENCIL IS THE WHOLE CONTROL — no "Edit" beside it. Three of them sit one under
another, so the word was printed three times to say what the icon says, and each
card header read as two labels rather than a title and a control. The words moved
to the `accessibilityLabel`, and they are the specific ones ("Edit the
ingredients", never "Edit"), because three buttons announcing "Edit" tell a screen
reader nothing. The glyph is NOT tinted, unlike the chevron and the bin either
side of it: those are silhouettes and survive being flattened to one colour, while
this one is a yellow pencil with a red eraser whose whole meaning is the colour —
tinted pandan at 20pt it came out as a green lozenge.

**A PART IS EDITED BY WEIGHT.** The ingredient card reads "Fried rice (90 g)" — the
name and what it weighs, one line, the bracket wrapping with the text — where it
used to read "× 0.5 · 90 g" on a second line and lead with the number nobody can
act on. The multiplier is how `food_log_ingredients` STORES an amount; the grams
are the amount, and the only thing about a part somebody can check against the
plate in front of them. The sheet steps and types in grams too, and
`quantityForGrams` is the seam: `set_ingredient_quantity` takes a quantity and the
column is `numeric(6, 2)`, so a weight lands within a gram or two of what was asked
for, and the number on screen is always what the row actually weighs rather than
what was typed. A part nobody weighed keeps its multiplier, because a count is the
only thing that can be said about it.

Each sheet holds a draft and its Save writes it; leaving any other way drops what
was typed. `stagedParts` in `features/logging/parts.ts` is shared between the card
and the plate sheet, because two copies of that arithmetic would be two previews of
one plate. None of them carries a description or a title: four labelled fields with
numbers in them say what they are, and a paragraph explaining that nothing is saved
yet was a sentence the Save button already makes.

ONE OF THEM KEEPS ITS STATE ABOVE THE BODY, because it was written with its button
in the sheet's `footer` rather than in the scrolling half — and that state outlives one opening,
since a `Sheet` is a `Modal` that stays in the tree with `visible={false}`. Both
therefore reset the draft AND the saving flag when the sheet opens. Without the
second half a successful save left the spinner running, and the next time the sheet
opened its button was already disabled and could not be pressed.

THE FIGURE FIELDS ARE PRE-FILLED, which puts a burden on the save. A box with the
number in it is a box you can correct, where an empty one asks you to remember what
you are replacing — but it also means a field holding the app's OWN answer comes
back looking exactly like one somebody typed. `saveFigures` compares each figure
against what the app worked out and writes null for a match, so opening the sheet
and pressing Save changes nothing. Left un-compared it would pin all four as
overrides, and since those sit above the portion in `food_log_details` the next
portion change would move the serving and not the calories.

**A DAY AND A TIME ARE PICKED ON WHEELS**, in a panel the details sheet leads to
rather than in controls laid out flat under the name. It was a week strip that
paged, an hour field, a minute field and an am/pm control — five things to say
one, and typing digits into boxes is not what anybody means by picking a time.
`src/ui/Wheel.tsx` is the column: a `ScrollView` with `snapToInterval`, because
the platform's own picker is a native module and this app wants the feature in
builds already on phones. Three things it cost, all written down there. It needs
an explicit frame or it lays out at its content height inside a parent that clips
it, which renders perfectly and cannot be scrolled. It needs more rows than it
shows, so am/pm is two buttons rather than a two-row wheel whose whole range is
one snap step. And the sheet holding it is `scrollable={false}`, because a
vertical scroller inside a vertical scroller loses every drag.

**WHEN it was eaten is one question over two columns**, and
`features/logging/when.ts` is the seam. `log_date` is the day the entry counts
towards and `logged_at` is the instant; the diary already reads them that way
round — the row sits under its `log_date` and prints the time off its `logged_at`
— so the screen prints them as ONE LINE under the title, the same pair of facts
the diary row prints under a dish name, and `EntryPatch.when` writes them as a
pair. It had a card of its own headed LOGGED, which gave a date the same weight on
that screen as the calorie total and made the entry's identity into a form field;
what replaced it is a line of prose and the pencil that also renames the dish,
since those are the two things about a logged meal that are not figures.

Sent alone, the timestamp would move the row inside a day it had not left and the
date would move the row to a day whose ordering still read off the old afternoon.
Two more consequences: the change detection compares a DAY and a CLOCK FACE rather
than two ISO strings, because `instantOn` writes whole seconds where Postgres
hands back microseconds and every Save would otherwise rewrite an untouched
timestamp; and moving the DATE invalidates both days and the streak, since it is
the one edit here that changes which days have entries on them. Nothing ahead of
today can be picked, for the reason the week strip disables those cells.

**By describing it to the model**, through the sparkle button beside Save. That
opens a sheet with the field and the suggested chips
(`features/logging/FixSheet.tsx`), and it is a sheet rather than a card on the
page because it is not one more staged control — the words go to the server,
come back as a different meal, and leave the screen behind. Anything staged is
written BEFORE the correction is sent: the server interprets the words against
the entry as it stands there, so "and half the rice" against a plate already
changed on screen would correct a meal neither of them is looking at.

There is ONE behaviour here, not one per source. `scan-refine` reads `scan_id`
as optional everywhere it touches it, so a hand-logged entry corrects exactly
like a photographed one — and the chips are instructions to the model rather
than text the client acts on, which is why "Half portion" is no longer a serving
swap the screen performs itself. There was briefly a second variant that saved
the words as a note on the row instead; it was a different feature wearing this
one's clothes, and nothing in the app displayed the note it wrote.

**`scan-refine/index.ts`** — free text against a logged entry becomes one of
four things, and they are a LADDER ordered by how much of the entry survives.
The interpreter's prompt is written as one, and it is told to stop at the first
rung that fits:

```
none        not a correction, or has no calories in it ("extra spicy")
quantity    only the amount changed — rescale the entry and every part under it
adjust      one part added, removed, resized or SWAPPED; re-price from the parts
redescribe  the food itself was wrong — re-run the whole cascade
```

Offered as a flat menu instead, the model reached for `redescribe` whenever it
was unsure, which is the one answer that throws away everything the user has
already accepted: "this was more like 500 calories" re-guessed a dish nobody
said was wrong, and "it was rendang chicken not fried chicken" binned the rice,
the sambal and the egg to fix one side. A correction that comes back as a
different meal is the failure this feature exists to avoid.

Three consequences worth knowing:

- A part that turned out to be a different food is a **swap** — one row out, one
  row in, the rest untouched — and it is priced by asking what the NEW food
  costs, never by asking how it differs from the old one. As a delta the model
  put rendang chicken 172 kcal below fried chicken.
- The interpreter is shown each part's **count and calories**, not just its name:
  "I left half the rice" cannot be answered by a model that has only been told
  the word "rice".
- A stated calorie total **rescales** rather than overrides. `override_kcal`
  would hit the number exactly, but it sits above the parts in
  `food_log_details`, so an entry with a breakdown would show the typed figure
  over an ingredient list adding to something else. Rescaling keeps the two in
  lockstep and pays for it in granularity — hence twentieths in
  `refineQuantity`, where quarters rounded small corrections back to no change
  at all.

`pnpm eval:prompts` grades the typed-meal prompt, this one and the recipe
reader against 68 written-down cases. It imports the prompts rather than
copying them — a harness with its own copy grades a prompt nobody ships.

---

## Home cooking

A shared pot has no serving size, which is where logging breaks down. A recipe
is two answers — what went in, and how many it feeds — entered once, and every
future log of it is one tap.

**A recipe WAS a `foods` row, and is not any more.** It had to be, once:
`food_logs.food_id` was not null and referenced the catalogue, and everything
downstream read a logged entry as a catalogue row times a portion times a
quantity. So each recipe MIRRORED into one — `is_recipe`, priced per serving,
carrying the portions the detail screen offers — rebuilt by triggers on every
write.

The mirror existed for the foreign key, and the foreign key is gone. Logging a
pot now writes the same snapshot every other entry writes, built from
`recipe_details`'s per-serving figures by `snapshotFromRecipe`, and
`food_logs.recipe_id` records where it came from.

What that costs is the property people expect here: correcting a recipe no
longer moves last week's diary, because realising the pot was six servings and
not four does not reach entries that already took their copy. It is the same
trade the diary makes with the catalogue at large, for the same reason.

**Ingredients are stored PER UNIT.** `kcal_per_unit` is what one gram, one
millilitre or one of the thing costs, and `amount` is how many went in. That is
what survives the amount being corrected: 400 ml of santan changed to 250
reprices with no lookup and no second opinion, because the density was the part
that was true. `ingredientBasis` in `features/recipes/basis.ts` is what turns a
catalogue serving into one — it reads a weight out of the serving label ("100 g",
"1 bowl (400 g)", "3.0 oz") and falls back to counting when there is none.

**Three shelves, one list.** Mine, the RiceCal kitchen, and the community. Which
one a recipe is on is a property of the row: official is the ABSENCE of an owner
(so "official and owned by Farah" cannot be spelled), and community is somebody
else's that is both public and approved.

Somebody else's recipe is SAVED before it can be logged — `save_recipe_copy`,
a copy with `source_recipe_id` for provenance. Logging it directly would put
their future corrections into your past diary.

### The publishing gate

Making a recipe public is two writes and they are deliberately not one.

```
set_recipe_public(id, true)     flips is_public, parks review_status at pending
functions/recipes {action:review}   the model reads it, writes approved/rejected
```

`is_public` and `review_status` are NOT in the client's column grant — see the
header in `22_recipes.sql`. With a table-wide update grant the same client that
asks to publish could approve itself, and the review would be a formality the
app performs on itself. `set_recipe_public` can only ever move a row to
`pending`; only `service_role` approves one.

**An edit sends a published recipe back**, and without that the gate is
decoration: publish something bland, collect an approval, then rewrite the name
and the steps into an advert. A trigger resets `review_status` when the name,
the steps, the servings or the ingredient list change on a public recipe — in
the database, because a rule the client is trusted to follow is a rule an
attacker declines to. `useSaveRecipe` then re-runs the review and reports what
it said. Private recipes are left alone: there is nothing to re-review about
something nobody else can see, and marking one `pending` would let an edit stand
in for a reading at the next publish.

Everything fails SHUT. The community tab reads `approved` only, so a review that
errors, times out or was never deployed leaves the recipe public, pending and
invisible — and the client says "we are still looking at this one" rather than
claiming either verdict. There is no branch in `functions/recipes` that approves
a recipe because something went wrong.

The reviewer asks ONE question and it is "is this a recipe". Two grounds follow
from it: the text is not a recipe at all (placeholder text, a note to nobody,
things that are not food), or it is not fit to read (vulgarity, hate, spam, an
advert, a link). A moderator with a wider brief starts rejecting food it finds
unhealthy, and the app has a calorie budget for that.

Accuracy is explicitly none of its business, and that is a correction rather
than an omission. There used to be a second ground about nutrition being
credible, and it read as an invitation to audit: a model handed a licence to
check arithmetic finds something wrong with almost every real pot, and ordinary
home cooking was rejected often enough that publishing felt broken. The author
could do nothing with it either, because the figures are the cascade's and not
theirs. So the reviewer is not shown a single calorie figure — see the note on
`ReviewInput` — and is told outright that the numbers are the app's work.

### Filling the form in, from a photo or from a sentence

Two offers on a new recipe, and they answer different situations rather than
different preferences: the pot is on the stove, or it is not. Both land in the
same `read` action and come back as the same draft, so only the first model call
differs — exactly the split `scan-meal` makes between a photographed meal and a
typed one, and `RECIPE_SHAPE` is shared between the two prompts for the reason
`llm.ts` shares its size anchors.

WHO THE AUTHORITY IS is the whole difference. A photograph has one witness and
it is the model, so everything it says is inference. A sentence was written by
the person who cooked the dish, so the amounts and the serving count they gave
ARE the answer and the model only fills in what they left out.

A photo uploads first and then invokes, because the reader on the server fetches
the object out of the bucket. Neither path goes near the catalogue: what comes
back lands in a form the user is about to check line by line, and a lookup per
ingredient would be six searches to populate fields that are about to be edited.
A failed read is a form they fill in themselves, and the endpoint says so.

A draft is applied ONLY OVER EMPTY FIELDS. Somebody who typed a name and then
reached for the camera meant it to fill in the parts they had not done.

Two things about that prompt were learnt the expensive way, and both are about
saying LESS. It described the app as Malaysian, and the model read that as an
instruction about the food rather than about the audience: beef tacos came back
named "Nasi goreng kampung" and a Thai green curry as "Kari hijau ayam", while
every Malaysian case passed throughout. And its "nothing cookable in it" escape
was written loosely enough that a dish named with no amounts — "Coq au vin,
feeds 6" — looked to the model like describing no food, which is the ordinary
way this feature is used. The home cuisine is now a tie-break rather than the
framing, the escape is fenced to text that names no food at all, and
`RECIPE_CASES` in `eval-prompts.ts` is the twelve examples written down.

The steps are ONE INSTRUCTION A LINE, and that shape is settled rather than
hoped for: the prompt asks for newlines, `shapeSteps` breaks a paragraph into
its sentences when it did not get them, and `RecipeSteps` draws the numerals.
Numbering in the data would double up against the numerals beside it, survive
into the field the cook edits by hand, and renumber nothing when a step was
taken out of the middle.

`R2_ENDPOINT` exists so a local stack can point the storage seam at any S3 —
the one Supabase runs beside it, say. Without it the one check standing between
two users' diaries could only be exercised in production.

---

## Which day Today is showing

A week strip above the ring, Monday to Sunday, paged back a year — one page per
calendar week, each fetching only its own seven days as it scrolls into view.
Picking a day moves `selectedDate` (`data/selected-date.tsx`, the one piece of
genuinely client-owned state), and everything below follows it: the ring, the
water, the entry list, and anything logged while it is selected. The heading
stops saying "Today" the moment it is used, and the two present-tense lines
under the ring switch tense with it.

The dot under each number is that day's verdict, and there are three of them
plus silence: under goal, over goal, a hollow ring for a past day with nothing
on it — and NOTHING for today-before-breakfast or a day still ahead. That last
distinction is the one worth keeping: a day nobody has had yet has not been
missed, and marking it would be the app inventing a failure.

`day_marks(from, to)` returns the three facts a dot needs — what was eaten, the
goal effective THAT day, what movement added — and no verdict. It takes dates
rather than a named range, unlike the trend families, because a calendar week
has no window for `local_today()` to name. `features/logging/week.ts` turns
those facts into a dot and is unit-tested, because the ORDER is the whole thing:
ahead-of-today and not-yet-loaded both mean "say nothing", and only then does an
empty past day mean "missed".

---

## Looking back at a week

A finished week or month, read as one column of cards. A row at the foot of
Trends leads to `/reviews`, which lists the periods worth opening, and one of
them opens `/reviews/[id]` — `week-2026-08-03` or `month-2026-07-01`, the kind
and the first day, from which the server works out the rest.

**IT SCROLLS, and it used to page.** Four screens of cards, tapped or swiped
through under a progress bar, borrowed the shape of an Instagram story without
borrowing the thing that makes one work: a story page is a photograph read in a
second, and these are charts and figures somebody wants to COMPARE. Paged, the
answer to "what did that say" was a tap backwards and a hunt, and seeing the
food beside the calories meant remembering one of them. What went with the pager
is everything that existed to serve it — the step counter, the segmented
progress bar, the two edge strips that took a tap, and the `fullScreenModal`
presentation those strips needed. The cards themselves are unchanged.

**Only finished periods, and every one of them.** Weeks reach three months back
and months reach six, because a weekly review is about something somebody still
remembers eating and a monthly one is about a shape only visible from a
distance. Nothing is hidden for being thin: there was a sufficiency rule —
four logged days of a week, twelve of a month, as a `qualifies` column — and it
hid the weeks whose shape was most worth seeing, while making the route into the
feature invisible to exactly the person who had not found it yet. The row on
Trends is always there for the same reason.

**How many sections a review has is data.** `reviewSteps` reads the summary: the
card, the food and the calories always hold, and the body section exists only if
there was a weigh-in or a watch. A month before the health store was connected
is three sections rather than four, of which the last would be dashes. Within
the body section each card is conditional again, so the same page is
weight-and-water for an older month and weight, steps and movement for last
week.

**A tap on a card shares it.** Every card draws ITSELF into a picture through
Skia's `makeImageFromView` and offers it in a sheet with a Share button — the
preview is that captured file rather than a second rendering, so what is on
screen is exactly what leaves the phone. iOS gets the picture, Android the
sentence beside it: React Native's `Share` takes `url` on iOS alone, and sharing
a file on Android needs a content:// provider, a dependency and a rebuild.

That press is now the ONLY one on the page, which is what makes a scrolling
review simpler than a paged one rather than merely different. The pager had to
share the screen with it, and the arrangement that worked was the second
attempt: strips down either edge, laid OVER the cards. Under them they did
nothing, because React Native offers an unclaimed touch to the hit view's
ANCESTORS and never to a sibling that overlaps it — a lesson worth keeping even
though the strips are gone.

**The biggest plates carry the plate.** Each dish on the food card leads with
the newest photograph logged under that name and falls back to its drawing, so
a camera user's week is their own five plates rather than five copies of one
outline. `review_meals` returns the key beside the icon and the client prefers
it exactly as the diary does; the five signatures it needs are batched into one
request by `data/photos.ts`.

**Two reminders open a review**, and they are the only notifications in the app
that go anywhere. The weekly one fires on MONDAY morning and the monthly on the
first, both looking back at something that has just finished — a weekly report
sent on Sunday evening would link to the week before last, since
`review_periods` will not offer a week until it is over. Both link to
`week-latest` / `month-latest` rather than to a date, because a reminder is
scheduled weeks before it fires and cannot name the period it will be about;
`useReportLinks` routes the tap and the story resolves the id against the list.

---

## How movement extends the budget

Apple Health on iOS, Health Connect on Android. Both are on-device stores, so
the phone is the reader and Postgres is the record — a figure that only exists
on one handset cannot take part in a budget computed in the database, a chart
computed in the database, or a report job with no client to ask.

**Reading** — `src/lib/health/`. Three providers behind one interface:
`apple.ts`, `androidHealth.ts`, and `demo.ts` — generated, deterministic,
dev-only, and a `health_provider` enum value rather than a flag, so every query
and delete treats it like a real one. Both native libraries are `require`d
lazily; a top-level import of a Nitro module throws on a dev client built before
the dependency landed, and the symptom is a white screen rather than a broken
tab.

**Syncing** — `src/data/health-sync.ts`. A WEEK-deep backfill on connect, then
the last SEVEN DAYS re-read on every foreground. It was a year, then a month,
then a week, and each cut was the same argument carried further: the backfill
exists so the Activity tab is not empty on the day it is turned on, and a week
answers that. Nothing about FORWARD syncing changed; only how far back a first
connect reaches. What it costs is the 30-day range, which starts three-quarters
empty and fills in over the following weeks — the accepted trade against a
permission screen somebody waits through inside onboarding, a screen away from
an account a minute old. Not a cursor, and that is the
decision the file is shaped around: health data arrives late and arrives edited
— a watch out of range writes Tuesday on Wednesday, Strava back-dates an upload,
Apple recomputes a day when a second source appears. "Everything since the last
sync" misses all three permanently. Every key in the schema exists to make that
repetition free.

**Storing** — `schemas/41_activity.sql`, read side in `93_activity.sql`.

---

## Money, and reminders

**Entitlement is the store's to decide and RevenueCat's to report.**
`subscriptions` is a read-only mirror with no client write grant at all, filled
by the `revenuecat` edge function; `data/purchases.ts` buys and restores but can
never grant. A client that could write that table is not a paywall. Every SDK in
`lib/startup.ts` is gated on its key being real.

Three products, on both stores and in RevenueCat: monthly, yearly, and a
one-off lifetime. The two subscriptions carry a SEVEN-DAY free trial and
lifetime does not, which is why the button and the small print on
`paywall/intro.tsx` change with the selection — "start free trial" over a
one-off purchase is a promise the store does not keep.

**The webhook is the load-bearing part, and it depends on the client.**
`app_user_id` is the only thing tying a purchase to a row, and it is whatever
the app told RevenueCat — so `identifyPurchaser` in `lib/revenuecat.ts` has to
run on sign-in or every purchase arrives as `$RCAnonymousID:...` with no account
to credit. `CANCELLATION` is deliberately not an ending: in RevenueCat it means
auto-renew was turned off and the user keeps what they paid for until
`EXPIRATION` follows, so reading it as the end takes the app away from somebody
who has paid for another three weeks of it.

**Out-of-order delivery is ordered by when the event HAPPENED**
(`subscriptions.last_event_at`, from `event_timestamp_ms`), and the first attempt
at this compared the event's expiry against the stored `current_period_end`
instead. That is the same test only while every ending is the natural one, and it
is not: a refund, a support cancellation and a revoked promotional grant all end
a subscription inside the period it had already paid for, so every one of them
looked stale and was dropped. Two promotional grants revoked in the dashboard
went exactly that way — the accounts kept Pro, and the log line saying why
(`ignoring a stale expiration: 2026-08-17 < 2027-08-17`) was the only trace.
Read `isStale`.

**That bug is also a lesson about where to look.** It presented as RevenueCat
having said nothing: the customer-events API showed no events at all for either
revoked account, the original grant included. That endpoint reflects the
transactions a customer CURRENTLY has rather than what was delivered, so a
revoked grant leaves nothing behind in it, and reading it as a delivery log
points the investigation at the third party instead of at us. The edge function's
own logs had both events, received on time.

**Nothing pulls from RevenueCat on a schedule, and that is a decision rather
than an omission.** A reconciler was written and then removed: it existed for a
problem that turned out to be ours, and once the ordering guard was right the
only thing left for it was a delivery lost past RevenueCat's retries. The expiry
rule below already bounds that to the period somebody paid for rather than for
ever, which is a small enough exposure not to be worth a second source of truth,
a second credential and a schedule to forget about. If it ever comes back, the
one thing it must keep is downgrading ONLY on a positive answer — a job that read
"RevenueCat did not answer" as "they have nothing" would cancel every paying
customer the first time the API had a bad night.

**That id is the SUPABASE UUID and must never become the email.** An address is
the readable choice and it is wrong on three counts at once: it changes, and a
changed one logs the SDK in as a different customer whose `app_user_id` matches
no row in `subscriptions`, so a paying user silently stops being entitled; not
every way in supplies one; and it is guessable, which with a public SDK key is
enough to ask about somebody else's purchases. What the dashboard needs is the
address as an ATTRIBUTE, and `$email` is set right after the log in — never
before, or it is filed against the anonymous customer the process started with.

**Two platforms are told who this is, and they have to agree.** RevenueCat
forwards its purchase events into Mixpanel under the `$mixpanelDistinctId`
attribute, falling back to `app_user_id` when nothing set it, and Mixpanel knows
the person by whatever `identifyUser` registered. Both are the user's uuid, so
the fallback lands correctly by coincidence rather than by design — which is why
`identifyUser` RETURNS its distinct id and `SessionProvider` hands that same
string to `identifyPurchaser`. Wrong, it is invisible from both dashboards: the
subscription attaches to a profile with no behaviour and the behaviour to a
profile that never paid, and the paywall funnel reads as zero conversions. The
email is the one thing the two are told differently, and deliberately: support
searches RevenueCat by address, while `PersonProps` carries no name, no email
and no body figures because a segment is never built on one.

**Prices come from the store, never from this repo.** `usePlanPrices` reads the
current offering and uses RevenueCat's localised `priceString`, so a Malaysian
user sees ringgit because that is what they will be charged. They were strings
in the copy bundle and were wrong three ways at once: dollars shown to somebody
billed in ringgit, Apple and Play disagreeing on lifetime because Apple has no
119.90 price point for a one-time purchase, and every repricing needing an app
release before the paywall stopped lying. Until the store answers, a price is a
dash — a plausible wrong number is worse than an obviously absent one. The
saving on the yearly badge is computed from those two prices for the same
reason: it is the one figure on that screen a user can check.

**A purchase confirms before our mirror knows about it.** The store answers,
then RevenueCat, then the webhook writes `subscriptions` — which is what
`useEntitlement` reads. Navigating on the store's confirmation alone put the
paywall back in front of somebody one tap after they paid, and it is invisible
on a fast connection. Every purchase and restore awaits `useAwaitEntitlement`,
which polls the mirror and gives up rather than blocking for ever.

### Free and Pro

**THE APP USED TO GATE WRITING AN ENTRY, AND NOW IT DOES NOT.** Every write went
through `useRequirePro` — the shutter, quick add, a dish out of the catalogue,
logging a recipe — which made a free account a read-only tour of somebody else's
diary. What replaced it is a free tier that can keep a real diary, and a paid
tier that takes the limits off:

| | Free | Pro |
|---|---|---|
| photographed plate | 3 a day | 50 a day, sold as unlimited |
| barcode, search, quick add, logging a saved recipe | yes | yes |
| a meal typed in words (`describe`) | no | yes |
| a meal corrected in words (`refine`) | no | yes |
| a recipe read out of a photograph | no | yes |
| recipes kept | 3 | unlimited |
| trends | 7 days | 7d / 30d / a year |
| reviews | the newest week | every week and month |
| meal photographs kept | 30 days | for good |
| budget, health sync, reminders, the whole catalogue | yes | yes |

Three of those numbers live in `packages/shared` for the copy to interpolate,
and ALL of them are enforced in Postgres — `free_daily_scans()`,
`free_recipe_limit()`, `free_photo_retention_days()`. The client's copy is what
makes the buttons read honestly; the database's is what refuses.

**The unit of the meter is a SCAN, and it used to be a request to OpenRouter.**
`scan_usage` is one row per account per LOCAL day and `claim_scan` does the check
and the increment in ONE statement, because a hard limit two concurrent scans can
both walk through is not one. It reads `is_entitled(user)` itself, so the ceiling
is a property of the tier rather than of the table.

The old unit is why the old ceiling could never be sold: one photographed plate
is a vision call, often a verifier call, sometimes an estimate, and a retried 429
is another — three or four requests for one shutter press. "3,000 model requests
a month" is not a number anybody can hold against their own week, and a user
refused after logging forty meals had an objection the figure could not answer.
Counted in scans, the refusal has an answer, and that answer is the paywall.

One scan is one user-initiated pass at the model: a photographed plate, a typed
meal, a correction, a recipe read out of a picture. Claimed ONCE, at the top of
the endpoint, before the photo is read and before the first model call. `Meter`
is still threaded down to `chatJSON` and still required, but it only COUNTS now
— what it records is what a scan cost us, for the logs and the debug trace.

**A free account's refusal opens the paywall; a Pro account's does not.**
`claim_scan` returns `entitled` alongside the numbers, and `announceRefusal` in
`data/refusals.ts` is the one place that decides: a free user gets a toast saying
they have used today's three and the paywall behind it, and a subscriber who has
somehow reached fifty in a day gets the message and nothing to buy. Showing a
paywall to somebody who has already paid is the worst thing this app can do with
a refusal.

**Pro is also offered without being asked for, once every two days.**
`useProNudge` on Today, a beat after the diary appears. Everything else in the
app waits to be refused, and an account that never presses a gated button would
otherwise never learn there is a paid tier. EVERY paywall resets that clock —
the refusals, the onboarding one, the nudge itself — so the rule the user
experiences is "at most one paywall every two days" rather than one nudge plus
every refusal. It is MMKV and keyed by user, for the reasons the tour flag is.

**Free photographs are swept after thirty days, and only the photographs.**
The entry stays for ever: its name, its macros and its place in the diary are
the history somebody came for. `functions/retention` does it rather than a cron
job in Postgres, because Postgres cannot reach R2 and the ORDER is the whole
problem — delete the object, then clear the column. A crash between the two is
picked up by the next run, since deleting a key that is already gone is a no-op;
the other order strands the bytes for ever, the key being their only name. The
row keeps a drawing where the plate was (`icon-match.ts` again), or a swept month
would be a column of grey tiles.

**Reminders are all local.** A meal reminder is "every day at 08:00 in the
user's own timezone", which both platforms express as a repeating calendar
trigger: no server, no push token, nothing to deliver if the phone is offline at
breakfast. Push, when it exists, is for what the phone cannot know by itself.

---

## The interface

`src/ui` is the design system and knows nothing about RiceCal;
`src/features/*` knows about meals, foods and targets; `app/*` is routes. A
`FoodRow` could not go in the design system without dragging the domain in with
it.

Colour is a role (`bg-pandan`, `text-muted`), never a literal. `ThemeProvider`
swaps the whole palette through CSS variables, so dark mode is not `dark:`
variants — the same `bg-surface` means white or `#1A2220` depending on the mode.
`Squish` is the press mechanic every raised control shares, and its slab is a
real view rather than a shadow, which is why a control's outer box is `depth`
taller than its visible surface.

`app/gallery.tsx` renders every component in every state, in both modes, on a
real device.

---

## Invariants

Break these and the feature is wrong in ways tests may not catch.

- **An entry with a breakdown IS its breakdown.** `food_log_details` coalesces
  three sources in order: what the user typed (`override_*`), what the parts add
  up to, what the dish costs at this portion. `lib/nutrition.ts`'s `entryTotals`
  is the client's copy of that same rule — they must agree. Scaling one parent
  row moves all four macros in lockstep, which is why editing an ingredient once
  changed only the calories.
- **An entry states its own numbers, and `food_id` is only a note about where
  they came from.** It is nullable and unconstrained, and null is ORDINARY: a
  tier-4 estimate, a tier-5 archetype and a plate rebuilt from its own parts are
  none of them catalogue rows. Anything that needs to exclude guesses filters on
  `food_id is not null` — which is what `user_food_stats` does, and it catches
  the same three cases the old `is_estimate`/`is_archetype`/`is_recipe` flags
  did. `serving_id` is TEXT, not a uuid: D1 keys a portion `(food_id, slug)` and
  the Worker names one `"<food id>:<slug>"`.
  So **a screen editing a saved entry prices it from the entry, never from the
  catalogue.** `app/log/food/[id].tsx` fetches the food anyway, but only for the
  portions it can offer — `withCataloguePortions`, which declines a list that
  disagrees with the entry about the size the entry is already at. Letting the
  catalogue win showed a soy milk logged at 108 kcal off its own nutrition panel
  as 511, priced from an unrelated row while wearing the entry's own name and
  photograph, with Today still showing 108. The bad id was the narrow cause; the
  wide one is that any entry whose row has since been re-costed disagreed the
  same way, silently.
- **Changing a portion writes THREE columns, not one.** `serving_label` and
  `serving_factor` are what the day counts; `serving_id` is a soft note that
  nothing in Postgres can resolve, because `food_servings` is in D1 and no view
  joins to it. It was enough when the catalogue was local and `food_log_details`
  joined for the factor. Writing the id alone now changes what a row CLAIMS its
  portion is and nothing about its arithmetic: switching a nasi lemak to Large
  previewed 975 kcal, saved, and left a row labelled "1 serving" still counting
  650. `snapshotColumns` writes all three on insert; `EntryPatch` carries all
  three on update.
- **An LLM figure is never averaged with a catalogue figure**, and the nutrition
  call is never told the vision call's guess — anchored, the model answered
  450 kcal for a plate of apple slices, and 120 without.
- **A breakdown must account for the meal.** The parts and the calorie band are
  two answers from the same model to the same question, and when they contradict
  each other the LIST is the one that is wrong — because the band is about the
  meal and the list is about whatever the model chose to enumerate. What it
  leaves out is the plain thing underneath: a basket of wings came back as
  celery and a pot of dip, and since the entry is priced FROM the parts, a meal
  the model itself bounded at 780-900 kcal was logged at 160. A breakdown far
  outside its own band is dropped, not repaired, and the dish tier prices the
  plate whole.
- **A signup form never says an address is taken.** Supabase will not, because
  that turns the form into an oracle for who uses this app: with confirmations
  on it answers a repeat signup with an ordinary user object carrying
  `identities: []`, and sends no mail. `signUpWithPassword` reads the empty
  array, the screen switches itself to sign-in and offers a code, and neither
  says why. Read naively that response is somebody marched to a code screen to
  wait for a mail that will never arrive.
- **A wrong code and an expired one are ONE error**, for the same reason: both
  come back 403 `otp_expired`. So there is one `code_invalid` reason and its
  copy covers both. Copy that named expiry would tell somebody who mistyped to
  go and wait for another mail.
- **A recovery code creates the session, so choosing a new password is ONE
  screen.** `(auth)/_layout` redirects the moment a session appears, which is
  right for every other way into that stack and wrong for this one — split
  across two screens, the reset carries the user off to Today the instant it
  starts working, leaving the password they came to change in force. The layout
  exempts `new-password` by name, and that screen navigates itself once the new
  password is actually saved.
- **The captcha fails OPEN on the client and CLOSED on the server.** No site
  key, no WebView in the binary, a script that will not load: all of them send
  no token, and Supabase decides. Failing closed in the app adds no protection
  the gate is not already providing and does add a way for a broken WebView to
  lock somebody out of their own account. The consequence is an ordering rule
  rather than a code rule: `security_captcha_enabled` must not be turned on
  until a build carrying the site key is the one people are running, because a
  build already on a phone cannot know it is meant to send one.
- **A client may READ the catalogue as itself, and may never write it.** This
  used to read "no client reaches the catalogue directly", and the rule behind
  the wording was always about the SHARED SECRET: a client holding that token
  could read the catalogue as fast as it liked from anywhere, and one that could
  write it could put numbers in front of everybody. The app carries the user's
  own Supabase JWT now and the Worker verifies it against a public key, so the
  first half is satisfied by different means and the second is unchanged and
  absolute. Nothing but our own server, holding the shared secret, reaches
  `/product`. See `apps/cloudflare/workers/catalogue/src/auth.ts` for what a token has to
  survive — including `alg` being pinned to ES256, without which `alg: none` and
  an HMAC over the public key are both accepted forgeries.
- **A barcode is a GTIN-14, at both ends.** Normalized where it is stored and
  where it is asked for, so the four spellings of one packet are one key. The
  check digit is not validated, on purpose. `public.gtin14` survives in Postgres
  for the client's own use; the Worker carries the same rule.
- **D1 takes at most 100 bound parameters in a statement.** The candidate list
  in `search` is bound one id per parameter, so it is capped at that — see
  `D1_MAX_BOUND_PARAMS`. Uncapped it over-fetched `limit * 4` and every search
  above `limit` 25 failed, which the edge function turned into an empty result
  and the app drew as "No dish by that name". It looked perfect at the small
  limits it was tested with.
- **An unreachable catalogue is not an empty one.** `data/catalogue.ts` throws
  for anything that is not a clean answer, so react-query reaches its error
  state and the search panel says something went wrong. Answering `[]` for a
  Worker that is down tells somebody their dish does not exist, which is what
  made the bug above invisible for an hour.
- **A recipe reaches the community only when a reviewer says so.** `is_public`
  and `review_status` are outside the client's column grant, and the community
  query requires `approved`. Every failure in the review leaves the row
  `pending`, which is invisible.
- **Adjust the amount, never the macros**, when a row is the right dish at the
  wrong size.
- **The gap between the current and target weights IS the calorie plan.** Its
  sign says lose or gain, its size says how hard, and equal says neither — so
  there is nothing else to ask, and nothing else that can contradict it. There
  was a `weight_goal` enum with its own onboarding screen, and it could only
  agree with those two numbers or disagree with them; disagreeing, it forced the
  formula to pick which of the user's own answers to ignore.
- **Every input to `compute_targets` is on the recompute trigger's column list.**
  `profiles_sync_daily_goals` is `after update of <columns>`, so a column the
  formula reads and the trigger does not name is one whose edits are silently
  ignored — the budget goes on describing the old plan until something else
  about the profile changes. `target_weight_kg` was exactly that for as long as
  it was a number the app stored and nothing read.
- **A hand-set budget is one the user actually set.** `daily_goals.is_custom`
  stops the recompute permanently, so writing it for a save that merely passed
  through the goals screen freezes a user's target for good. It is set when the
  number differs from what the formula asks for, and not before.
- **A weigh-in the user typed is never overwritten by a synced one.**
  `weight_logs` is one row per day and both the person and their health store
  write it, so they compete for the same key — and the sync re-reads the last
  seven days on every foreground, so it competes about once a minute for as long
  as the app is open. `provider is null` means "typed", and
  `sync_weight_readings` refuses to update a row that says so. It is a function
  rather than an `.upsert()` because that rule is a `WHERE` on the
  `ON CONFLICT DO UPDATE` and PostgREST cannot express one. The corollary lives
  on the client: `useLogWeight` writes `provider: null` EXPLICITLY, because
  PostgREST updates only the columns a payload names, so omitting it would leave
  a corrected weigh-in still marked as the scale's and the next foreground would
  put the scale's number back. The user would watch their own correction undo
  itself and blame the text field.
- **A synced weigh-in moves the calorie budget, and that is the point.**
  `weight_logs_sync_daily_goals` fires on the function's writes like any other,
  so a scale can change somebody's target with the app closed. Two consequences:
  anything that writes weight has to invalidate `keys.goals` as well as
  `keys.weighIns`, and a reading a health store rejects must be DROPPED rather
  than raised — this runs inside the same pass that writes activity, so one junk
  5 kg entry in Health would otherwise cost the user their steps too.
- **Burned calories extend the budget; they never shrink what was eaten.** The
  arithmetic is `goal + active - eaten`, written as an addition on screen. Every
  app in this category has at some point shipped the subtraction, and it turns a
  diary into a scoreboard people play by eating less. The week strip's dots are
  drawn against that same sum, because the ring and the dot under it describe
  one day and must not disagree about it.
- **Only ACTIVE energy reaches the budget.** The goal is already Mifflin-St Jeor
  with an activity multiplier, so adding the store's resting figure would credit
  a user ~1,500 kcal for being alive twice. Resting is stored beside it and read
  only by the burn breakdown.
- **Null is not zero in `activity_days`.** Health Connect has no stand hours at
  all, and a store reports only what its writers wrote; a confident zero there
  is a claim about the user rather than about the provider. This one is harder
  than it reads on Android, because the aggregate API cannot say "nobody wrote
  this" — the native bridge coalesces a missing metric to `0.0`, so every figure
  comes back a number. `dataOrigins` on the result is the only thing that tells
  the two apart, and believing the zero once filed a Samsung user's ENTIRE daily
  burn as resting for a week while their budget got nothing.
- **On Android, one app answers for a measurement, not all of them.** Health
  Connect dedupes Activity by a priority list the USER owns and can empty, so a
  plain aggregate can return the same walk twice from two sources — read as
  4,675 steps against the 2,808 Samsung Health showed the same user. The
  provider picks one origin and re-reads with `dataOriginFilter`;
  `connectOrigins.ts` holds the order and what it costs. Apple needs none of
  this: a statistics collection merges across sources itself.
- **A paywall enforced only in the client is enforced only on people running
  the client.** `useRequirePro` makes the buttons read honestly;
  `requireEntitlement` in the edge functions is what actually stops the request,
  and it fails SHUT — a failed read of `subscriptions` refuses, because an
  outage in one query handing the model to everybody is the expensive direction
  to be wrong in. The METER fails the other way on purpose: a database blip
  while claiming budget lets the request through uncounted, since telling
  somebody who has paid that they are cut off is worse than losing a tally mark.
  The free tier's other two ceilings are enforced the same way and in the same
  place: `recipes_enforce_free_limit` is a TRIGGER because a client writes
  `recipes` directly under RLS with no function in between, and the retention
  sweep runs as `service_role` with no client involved at all. Only the trend
  ranges and the older reviews are client-side, and deliberately: they are reads
  of the user's OWN data, so the worst case is somebody seeing their own year.
- **An entitled status is not enough; the PERIOD has to be running too.**
  `entitledBy` on the server and `isEntitledRow` on the client both read
  `current_period_end`, and null means no expiry rather than an expired one —
  lifetime renews never, so RevenueCat sends no date and reading it the other way
  round would refuse the one plan that cannot lapse. Written on the status alone,
  as both were, every missed ending is PERMANENT instead of temporary: a delivery
  that failed past RevenueCat's retries, or an event the ordering guard wrongly
  dropped — which is what happened to two revoked promotional grants — leaves a
  row saying `active` with an expiry in the past and an account reaching the model
  for ever.
  It does not replace the webhook and cannot — only RevenueCat knows a
  subscription ended EARLY — it bounds the damage of never hearing to the period
  that was actually paid for. The two copies cannot import each other across the
  Deno / React Native line and have to be changed together. What follows from it
  on screen: anything PRINTING the plan reads `entitled`, not the status, or the
  Me tab says "Pro active" on the same screen whose buttons are about to refuse.
- **The quota counts SCANS, not requests to OpenRouter, and it is claimed once
  BEFORE any of them.** One user-initiated pass at the model is one unit,
  whatever it costs underneath. Claimed afterwards, an account already at its
  ceiling would still get to send the request that put it there.
  This also retired an invariant rather than restating it. "Running out of
  budget is never answered with an archetype" used to need `AiLimitReached`
  rethrown through every `.catch` in the cascade — swallowed anywhere, each tier
  below retried the same refusal and handed the user a guessed "Mixed meal"
  instead of an explanation. Claimed at the top of the endpoint, a budget
  failure can no longer reach the cascade at all, and the rethrows are gone.
- **The OpenRouter key never reaches the client**, and neither do the R2
  credentials. A client that could name its own object key, or hold a key that
  does not expire, is a client that can read someone else's plate.
- **A plate is STORED wider than it is SHOWN.** The two readers of a photograph
  want opposite things: the model judges a portion against what is around the
  food, so the widest frame is the one worth keeping, while the person wants
  back the picture they framed rather than a photo of their table. So the
  viewfinder is already a centre crop of what the shutter records, and every box
  that draws a stored photo afterwards (`MealPhoto`) crops in by the same
  amount. One constant, `PHOTO_CROP` in `lib/photo.ts`, because two of them is a
  diary framed differently from the viewfinder that took it.
- **An image column holds a KEY, never a URL.** `food_logs.photo_path` and
  `profiles.avatar_path` are what made a change of storage provider a change of
  base URL rather than a migration over every row. It has already paid for
  itself once.
- **A key names ONE object, for good.** `newKey` mints a UUID per upload and
  nothing ever writes over an existing one — replacing a photo means a new key
  and a delete of the old. That is what lets the client cache the picture under
  the key (`storedImageSource`) instead of under a signature that rotates
  hourly, and it is what makes a correction invalidate itself: the new photo is
  a different name, so there is no stale entry to find. An upload path that
  reused a key on replace would leave every phone that had seen the old
  photograph showing it indefinitely, with no way to know it had changed.
  It has a price, and `clearImageCache` is it: cached against a rotating URL
  those pictures aged off the device by accident, and cached against a stable
  key they do not, so signing out now has to say so.
- **The disk is asked before the network, and the disk copy is unkeyed.**
  `resolveStoredImage` returns expo-image's own cache path when there is one,
  which is why a cold launch is not a screen of grey tiles waiting on a
  signature for pictures that never left. That path IS the cache entry, so
  `storedImageSource` hands it over with no `cacheKey` — filing it again would
  ask the cache to store what it just produced.
- **Nothing off the diary reaches Mixpanel.** No calorie totals, no weights, no
  dish names, no search text — `src/lib/analytics/events.ts` is the whole list
  of what is sent, and a call site cannot add to it without editing that file.
  The ONE identifier that names a real person is `$email`, and it is an
  exception made on purpose rather than a hole in the rule: the address is what
  a support conversation starts from, and a profile that cannot be found by it
  is a profile nobody can act on. It is set from `identifyUser` alone, from the
  address on the session, and it is the same address RevenueCat is given — so
  both dashboards answer the same search. Nothing else about the person follows
  it: no name, no body figures, and the diary half of this rule is unchanged.
  Where a number is genuinely wanted, its SHAPE goes instead: `planDirection`
  sends lose/gain/maintain rather than the two weights, and `dateOffset` sends
  how many days back an entry was logged rather than which day. This is not only
  a privacy rule — the pipeline's own quality is already measured in Postgres by
  `food_scan_items` and `food_scan_misses`, so a second copy in an analytics
  product would be a worse one that drifts. Purchases are RevenueCat's, which
  funnels them in itself; what the app sends is the INTENT either side of the
  store sheet, because the store never reports a purchase that did not happen.
- No embeddings.

---

## Things that will bite you

- **`supabase db diff` misses function grants.** Against the full local stack it
  reports no changes for `revoke`/`grant` deltas; the CI `migrations` job catches
  them. Five functions shipped executable by `PUBLIC` this way. After touching
  grants, check that job or query `pg_proc.proacl` directly — a leading
  `=X/postgres` means PUBLIC still has EXECUTE. `tests/02_rls.test.sql` asserts
  the ones that matter.
- **A function's COMMENTS are part of its body, as far as the diff is
  concerned.** Postgres stores `prosrc` exactly as written, so `db diff`
  compares the comment text too: a migration that redefines a function with the
  prose trimmed for length declares a function no migration produces, and the
  `migrations` job fails on a change that is genuinely captured. When a
  hand-written migration has to restate a function, copy the block out of
  `schemas/` verbatim rather than retyping it. Only what is between the `$$`
  markers counts — a note above the `create` is free.
- **Deploy the SCHEMA first, then the code that reads it. Always.** The chain is
  `D1 schema → the Worker → the edge functions → the app`, each arrow meaning
  "is read by", and it has to be extended from the end nothing points at yet.
  Deployed in that order every intermediate state has something existing that
  nobody asks for, which is invisible; deployed against it, every intermediate
  state has something asked for that does not exist, which is an error on a live
  request — and not only for the new field. A Worker deployed ahead of its
  column answers EVERY request with a D1 error; an edge function ahead of the
  Worker reads `undefined` and prices a meal off a missing number. Only the
  first arrow is automatic (`cloudflare.yml` runs the schema job before the
  deploy job and stops if it fails); the rest is several deploys with a window
  between each, so make every step backwards compatible rather than merely
  quick. **Removing runs backwards**: stop reading it everywhere, ship that,
  then drop the column. Full version in `apps/cloudflare/README.md`.
- **The Supabase CLI's remote endpoints move.** On 2.111.0, `functions deploy`
  and `gen types --project-id` both answer 404 when handed a project ref that
  does not exist — which is indistinguishable from the endpoint being gone.
  Check the ref against `apps/supabase/.temp/project-ref` before concluding the
  CLI is broken. `pnpm db:apply` never has this problem: it derives the ref from
  the app's own `.env.local`, which is why a migration cannot be applied to the
  wrong project by passing the wrong argument.
- **Expo Router orders a navigator's screens by the LENGTH of their route
  names**, and a tab navigator goes "back" to whichever it decides is first. Left
  to itself, `me` is two characters and sorts ahead of `today`, so the router's
  idea of the first tab was the profile, and the Android back button on any tab
  went there. `unstable_settings = { anchor: 'today' }` in `(tabs)/_layout.tsx`
  pins it.
- **`router.back()` is offered to every navigator in the focused chain**, so a
  back with nothing left to pop is answered by the TABS underneath, and answering
  it means changing tab. `canGoBack()` asks the same chain and says yes for the
  same reason, which is why a fallback guarded by it never ran. `useBack` pops
  instead: POP is a stack's action, and a dismissal that arrives twice — the
  handle and the scrim answering one gesture — finds nothing to pop rather than
  taking a bite out of the screen behind.
- **NativeWind only styles React Native's own components.** A third-party one
  takes `className` as an ordinary prop and drops it silently. `Screen.tsx`
  registers `cssInterop` for gesture-handler's ScrollView for exactly this.
- **`flex-1` names an axis you cannot see.** In a row it shares the width; in a
  column it takes the leftover *height* from a basis of nothing, and collapses
  when that height is bounded — which is what a keyboard does to a card. Let the
  caller ask for it rather than baking it into a component.
- **A `TextInput` crops to its line box where `Text` does not.** Copying a text
  variant's `leading-*` onto an input slices tall glyphs. Let the font choose its
  line box and pin the row's height instead.
- **A sheet with a text field in it is `fullHeight`. Every time.** This has been
  got wrong repeatedly, so it is a rule rather than a judgement call. A capped
  panel is PADDED UP off the bottom edge by `KeyboardAvoidingView` when the
  keyboard opens, and the strip left behind shows the scrim through the curve of
  the keyboard's top corners — the sheet stops reading as attached to the bottom
  of the screen and starts reading as floating over it. `fullHeight` keeps the
  panel where it is and lets the scroll view inset its own content instead
  (`automaticallyAdjustKeyboardInsets`). The picture picker, the quick selector's
  search and describe panels, and `FixSheet` are all this shape.
  Two corollaries, both learnt the hard way. Such a sheet has NO `footer`: a
  footer sits outside the scroll view, so at full height it lands at the bottom
  of the panel behind the keyboard. Put the button in the body, after the field.
  And if the content is SHORT — a field, some chips, a button, rather than a
  list — pass `scrollable={false}` as well. A scroll view scrolls itself to
  reveal the first responder when the keyboard opens, and on the first open,
  before the keyboard's real height is known, it overshoots and carries the
  field clean off the top of the panel. A full-height sheet lays its content out
  at the top and lets the keyboard cover the empty part below; with nothing to
  scroll there is no scroll to get wrong.
- **A number is typed on the app's own pad, and that is not a flourish.** The
  system number pad has no return key, so iOS 26 floats a "Done" pill above it —
  inside the keyboard frame the app is told about, while the keys are not.
  Everything positioned against that frame therefore clears a control it cannot
  see, and the strip left behind shows the diary through it: on the food detail
  screen, a system button sitting on the totals card. The height of that pill is
  Apple's to change, so there is no number to correct by. `src/ui/Numpad.tsx` is
  the answer — `showSoftInputOnFocus={false}` leaves the caret and takes the
  keyboard away on both platforms, and what slides up instead is a view whose
  height is a constant this app owns. Nothing about the geometry is reported by
  anybody any more. Two consequences: a numeric field needs a `NumpadHost` above
  it, which `Screen` and `Sheet` both provide, and a `Sheet` provides its own
  because a native modal window cannot be drawn over from below. `keyboardType`
  stays on every field regardless, as the fallback if a platform ever declines
  to suppress the keyboard.
  **One field is exempt, and it is the six digit code.** The pad types a
  quantity, and a code is a string that happens to be digits: the pad refuses a
  leading zero, because `07` is a typo in every figure this app holds and the
  first digit of one code in six, and suppressing the keyboard suppresses
  `oneTimeCode` autofill with it. `systemKeyboard` on `TextField` is the
  opt-out, `(auth)/verify` and `(auth)/new-password` are the only two callers,
  and the "Done" pill is harmless there because those screens have nothing
  behind the footer but canvas.
- **A field on that pad never blurs when you leave the screen.** Taking the
  system keyboard away also takes away the reason the platform had to resign
  first responder, so a push, a replace or a tab change fires no `onBlur` at
  all: the session stays open, on a screen still mounted under the one you are
  looking at. That is survivable only because the pad's inset is scoped to the
  host DRAWING it (`useNumpadZone`). Read straight off the provider, which holds
  ONE offset for the whole app, a stale session lifted the footer and the
  floating action of every screen by the pad's full height, and the footer's own
  canvas then covered the content with a screenful of empty canvas below it.
  Onboarding's weight field is the first numeric field a new user meets, so a
  first app open showed the log button and the paywall's button floating 280pt
  up the screen. It reads as a layout bug and is a lifetime bug.
- **A hosted Postgres does not fail a write when the disk fills. It stops
  accepting them ALL.** Supabase puts a project over its plan's ceiling into
  read-only, and the free plan's ceiling is 500 MB. This is what drove the
  catalogue out to D1: loading three million packaged rows crossed it
  mid-statement, and the database then refused every write including the
  `drop table` that would have freed the space. The way out is
  `set default_transaction_read_only = off` on a session, then drop whatever
  grew. The catalogue cannot do this again, but the diary shares the ceiling.
- **A worklet FREEZES everything it closes over, and the pad's live value was
  reachable from one.** This cost an afternoon and the symptom was absurd: the
  app's own number pad could not type a two-digit number. Press 1, then 2, and
  the field read "2" — every calorie edit, every weight, every portion.
  `useNumpadField` writes the field's current value into a ref on every render
  and the pad reads it back on every key; `NumpadSurface`'s slide animation was
  written `useAnimatedStyle(() => ... context.height - context.offset.value)`,
  which captures `context`, which holds the session, which holds that ref.
  Reanimated freezes the whole graph so the UI thread can read it, so
  `field.current = {...}` became a silent no-op and the pad went on appending to
  the value the field had when it was first focused — the empty string, for
  ever. In dev Reanimated does say so ("Tried to modify key `current` of an
  object which has been already passed to a worklet"), buried among warnings; in
  a release build it is silent. The fix is one line of destructuring: read
  `context.height` and `context.offset` on the JS thread and let the worklet
  capture a number and a shared value. **Never let a worklet close over an
  object that owns mutable state** — pull the primitives out first.
- **The keyboard's reported height is still not where the keys start.**
  `Screen`'s footer skirts for it: canvas continuing below the footer for a
  screen's worth, so a frame taller than what it covers reads as chrome rather
  than a hole. The numeric case is fixed at the source now, but the class is
  not — a floating IME on Android, an autofill panel, whatever a platform
  attaches next. Do not cap the lift instead: a frame taller than its keys is
  usually taller for a reason, and covering the difference puts Save under
  somebody else's control.
- **`autoFocus` inside a `Modal` is dropped.** The field mounts with the window,
  before the platform has presented it, and the keyboard never comes up. `Sheet`
  takes an `onShow` for this — fire `ref.focus()` there. `SheetSurface` is a
  route rather than a window and needs none of this, which is why `autoFocus`
  works in the quick selector and not in a `Sheet`.
- **A current iOS simulator has a Health store with nothing in it.** It is widely
  documented as having no Health app; that stopped being true. iOS 26 reports
  `isHealthDataAvailable()` as true and shows the real permission sheet, then
  reads a year and returns nothing — which looks like a broken feature rather
  than an empty device. The Activity tab offers generated data once a connected
  store turns out to have no days in it.
- **The free tier applies to a local stack too, so the FOURTH scan of the day
  fails there.** Both gates run before the mock-AI branch on purpose — a local
  stack where they did not exist would be the one place every gating bug is
  invisible — and `handle_new_user` creates a profile, settings and meal times
  but no `subscriptions` row. So a fresh local account is a FREE account: three
  photographed plates a day work, and describe, fix-by-typing and the recipe
  reader all answer 402 `not_entitled`, which reads as a broken pipeline if you
  are not expecting it. One row fixes all of it:

  ```sql
  insert into public.subscriptions (user_id, status, plan)
  values ('<your uuid>', 'active', 'yearly')
  on conflict (user_id) do update set status = 'active';
  ```

  Testing the OTHER direction — what a free account actually meets — is the same
  row with `status = 'none'`, or no row at all. `scan_usage` is where the day's
  count lives, and deleting the row is how you get your three back without
  waiting for midnight.

  The same applies to the account behind `.secrets/eval.json`: `pnpm eval:scan`
  and `pnpm eval:recipe` drive the DEPLOYED functions, so that account needs a
  real entitlement (a promotional one in RevenueCat) or every case fails
  identically at the first request. AND IT NOW HAS A CEILING TOO: Pro is fifty
  scans a day, `eval:scan` is 27 cases, so a second `--repeat` in one day runs
  into it and the cases past 50 fail as 429s rather than as bad answers. Clear
  `scan_usage` for that account between runs, or read the failures for what they
  are.
- **Mock AI** is on whenever `OPENROUTER_API_KEY` is unset (or `MOCK_AI=true`),
  so a local stack scans with no config and production can never mock silently.
  Requests may steer it via `body.mock`, honoured in mock mode only.
- **Adding or renaming an edge function** needs a full stop and start of the
  local stack; the running edge runtime does not pick it up.
- **Edge functions are Deno and outside the pnpm workspace**, so the workspace
  check does not see them. `deno check --no-lock --config <fn>/deno.json
  <fn>/index.ts` is their typecheck, and CI runs it over every function.
  `--no-lock` matters: a lockfile left in a function directory gets bundled and
  triples the deployed script.
- **`supabase db push` and other networked CLI commands** block on an invisible
  login prompt when `~/.supabase/` has no access token. The Supabase MCP tools
  work regardless.
- **One simulator at a time. Never the iOS simulator and the Android emulator
  together.** This machine does not have the headroom for both, and what it
  costs is not a slow session but wrong answers: a Gradle build running beside
  a jest run pushed 18 tests past their 5s timeout with nothing actually
  broken, and the iOS simulator was shut down under us mid-test. Anything
  timing-sensitive — the test suite, a keyboard animation, a screenshot of a
  transition — has to be read on a quiet machine. Shut one platform down
  before booting the other, and stop the build daemons afterwards
  (`./gradlew --stop`, then `pkill -f GradleDaemon`, `pkill -f kotlin-daemon`).

---

## What is not wired up

Worth knowing before wondering where the handler went.

- **RevenueCat is live now**, and the dashboard has caught up with the code: the
  `pro` entitlement exists with all six store products attached, and the webhook
  points at the `revenuecat` function with no environment filter — which is the
  right setting, because the function drops anything that is not `PRODUCTION`
  itself rather than trusting the dashboard to. What cannot be read back from
  the API, and so is worth checking by hand when a purchase does not land:
  `REVENUECAT_WEBHOOK_TOKEN` set on the edge functions and matched in the
  dashboard's webhook, and an App Store Connect API key uploaded to RevenueCat
  before an iOS receipt can be validated.
- **The RevenueCat → Mixpanel integration is dashboard configuration**, and the
  app has done its half: every signed-in customer carries `$mixpanelDistinctId`.
  Until the integration is switched on in RevenueCat, purchases simply never
  reach Mixpanel and the funnel stops at `Purchase Started` — which reads as
  nobody buying anything rather than as a missing integration.

---

## How it is checked

`pnpm check` is typecheck + jest + biome across the workspace, and CI runs it on
every push. Two more workflows guard the database. `supabase-migrations` rebuilds
a throwaway Postgres from every migration, runs the pgTAP suite in
`apps/supabase/tests`, and deno-checks each edge function.

`cloudflare` is the one workflow that both checks and DEPLOYS, and the only one
scoped by path: it fires on nothing outside `apps/cloudflare`, and deploys only
on a merge to main. `deploy.yml`'s push trigger ignores that same directory in
return, so a Worker change cannot archive and submit a new binary for a change
the app never sees. The trade is that the two filters have to stay opposites —
widen one and a commit either runs both pipelines or neither.

A PULL REQUEST's Worker is the exception, and it is in `deploy.yml` rather than
here: `wrangler versions upload --preview-alias pr-N` puts this branch's code at
a stable URL taking 0% of production traffic, and the PR's `eas update` is
pointed at it, so the JS and the catalogue behind it come from one commit and
land in one comment. The URL has to reach the bundle through a pulled
`.env.local` — `eas update --environment X` ASSIGNS the downloaded values over
the process, so a URL exported by the workflow is overwritten rather than
honoured, and the preview goes on reading production while appearing to work.

`supabase-drift` is the interesting one: it diffs the DEPLOYED schema against
the committed migrations nightly, and it exists because there is no hosted
toggle to make the dashboard read-only. Anything applied through the SQL editor
— or through the Supabase MCP server, which is connected with write access and
is indistinguishable from a dashboard edit as far as the database is concerned —
bypasses migrations entirely, and this job is the only thing that notices. So a
migration applied that way needs its file committed at the SAME version, or the
job goes red on a change that is genuinely in the repo.

The RLS-sensitive pgTAP files run as `authenticated` with a forged JWT claim,
which is what PostgREST does on every request. Run as `postgres` the table owner
bypasses RLS and every assertion passes while proving nothing.

The catalogue is not in Postgres, so the pgTAP suite says nothing about it.
`pnpm foods:gate` is what guards it: thirty queries and, for each, the dish
somebody typing it is after, read from `search-gate.cases.json`. There were two
of these for a while, one grading Postgres and one grading the Worker off the
same file, which is what made the move answerable rather than hopeful — D1
scored 28/30 top-1 against Postgres's 26/30 on identical work.

**Three harnesses grade the model paths, and they answer different questions.**

| | what it drives | what it grades |
|---|---|---|
| `pnpm eval:prompts` | the prompt alone, imported | the shape of one answer: which action, how many components, whether the band brackets something sane |
| `pnpm eval:scan` | the DEPLOYED functions, photographs and all | the row that lands in the diary — 27 cases, with the cascade's `debug: true` trace on every call |
| `pnpm eval:recipe` | the deployed recipe reader | the arithmetic (calories per serving, macros agreeing) and the WRITING (one action a step, imperative, a doneness cue) |

`eval:prompts` says nothing about the upload, the catalogue search, the
verifier, the ratio gate or the portion sizing, and most of what goes wrong with
a scan goes wrong in exactly those — which is what the other two are for. The
two that drive deployed functions need a session, which is why
`.secrets/eval.json` holds a password for a throwaway account rather than a
token: setting that password revokes every refresh token the account holds, so a
simulator signed in as it lands back on the welcome screen.

Use `--repeat` whenever you change something. One pass over these cases is not a
measurement — the same sentence resolved to tier 1 at 657 kcal, tier 4 at 525
and tier 3 at 821 on three consecutive runs of identical code, which is wide
enough to credit a prompt change with an improvement it did not make.

---

## Conventions

Comments explain *why*, in prose, and are worth the space when the reason is not
recoverable from the code — a bug that motivated a shape, a constraint that looks
arbitrary. Match the density around you rather than adding a header to
everything.

Commit subjects are a sentence about what changed, not a conventional-commits
prefix.

**No long dashes in copy.** Anything a user reads is written without em dashes
or en dashes: use a comma, a full stop, a semicolon or a pair of brackets
instead. That covers `src/i18n/en/*`, any string that reaches a screen, a
notification, a share sheet or a toast, and the model prompts that produce text
we display back (the recipe reviewer's rejection reason is copy, so its prompt
says so).

Two things it does NOT cover. **Comments and this file** are prose for whoever
is reading the code, and the dash is doing real work in them. And a lone `—`
standing in for a missing measurement is a SYMBOL rather than a sentence: it is
how a stat tile says "no reading", and it stays. A missing NAME is different and
gets a word ("Someone"), because a dash where a person should be reads as a
rendering fault.

Rewrite rather than substitute. "Enter it once — what went in and how many it
feeds — and logging it is one tap" becomes "Enter what went in and how many it
feeds, once, and logging it is one tap"; swapping the dashes for commas without
moving the words leaves a sentence with too many clauses in it.
