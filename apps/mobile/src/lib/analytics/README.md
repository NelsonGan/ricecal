# The tracking plan

Mixpanel, and what RiceCal asks it.

`events.ts` is the authority: every event is declared there with the exact
properties it carries, and `track` accepts nothing else. This file is the
reasoning — what each event is for, and, more usefully, what was deliberately
left out.

```
client.ts    the seam. Imports nothing, so anything may track.
events.ts    the plan, as a type. A typo does not compile.
props.ts     the two derived properties more than one call site needs.
```

`startup.ts` builds the Mixpanel instance and hands it to `registerAnalytics`.
Nothing else in the app touches the SDK, and the reason is the same one that put
the RevenueCat lifecycle in its own file: `mixpanel-react-native` is imported at
module scope and jest cannot transform it, so a native import in a module that
tracking is fired from would drag an untransformable dependency into most of the
test suite. Events fired before the SDK finishes starting are queued and drained
on registration, because `initServices` runs inside an effect and the router has
already decided where a launch belongs by the time it resolves.

Nothing is sent in development. `initSentry` makes the same call for the same
reason, and the console line `trace` prints instead is what makes a new call site
verifiable without a dashboard.

---

## The rules this plan was written against

**One event per decision, not per render.** A screen appearing is not a fact
about anybody; a button being pressed is.

**Every event answers a question somebody would actually ask.** If the answer
would not change what gets built next, the event is not here.

**Nothing off the diary.** No calorie totals, no weights, no dish names, no
search text. They are health data, they answer none of the questions below, and
Postgres already holds every one of them next to the arithmetic that produced
it. Where a number is genuinely wanted, its SHAPE is sent instead: which way a
calorie plan runs rather than the two weights, how many days back an entry was
logged rather than which day.

**Errors belong to Sentry.** A failure that is also a product fact — a scan that
found no food, a barcode nothing knows, a request refused for want of budget —
travels as an `outcome` property on the event it belongs to. Everything else is
an exception and goes where exceptions go.

**Scan quality belongs to Postgres.** `food_scan_items` records what the model
claimed and where it landed, and `food_scan_misses` is the catalogue-widening
backlog. Mixpanel measures BEHAVIOUR; those two measure the pipeline, and a
second copy here would be a worse one.

---

## What is not tracked, and why

- **Purchases.** RevenueCat funnels its own events in, and it is the only party
  that knows whether the store settled a transaction. What it CANNOT see is
  either end of the store sheet, so `Purchase Started` and `Purchase Abandoned`
  are here and `Purchase Completed` is not — the store never reports a purchase
  that did not happen, and without those two the funnel stops at "paywall shown"
  and resumes at "subscription started" with the whole abandonment step missing.
- **Screen views.** Automatic route tracking would be the largest event stream
  in the app and would answer almost nothing. The screens worth counting have an
  event of their own: `Paywall Shown`, `Log Sheet Opened`, `Review Opened`.
- **Sessions, installs and updates.** `trackAutomaticEvents` is on, so
  `$ae_session`, `$ae_first_open` and `$ae_updated` arrive without an event of
  ours. An "App Opened" of our own would be a second, slightly different answer
  to the same question.
- **Water, day selection, tab switches, panel toggles inside the log sheet.**
  High volume, and each is already implied by something else. Which panel a meal
  was logged from is on `Meal Logged`; which day is `date_offset`.
- **The `calculating` onboarding step.** It advances itself on a timer, so its
  count could only ever equal the step before it.
- **People counters** (`meals_logged`, `recipes_created`). Mixpanel builds a
  cohort from an event count directly, so a counter would be a hand-maintained
  second answer — and one that has to decide for itself whether a scan that
  failed halfway counts.
- **Search text.** What people type and cannot find is worth capturing, and the
  place to capture it is the Worker, which is already authenticated and rate
  limited and is where the rest of the catalogue backlog lives. What reaches
  Mixpanel is the length and the result count.

---

## The funnels this is shaped around

**Acquisition.** `Onboarding Started` → `Onboarding Step Completed` (broken down
by `step`) → `Signed In` → `Onboarding Completed`. The account sits in the
middle of the flow rather than at the front, so the sign-in step is where the
largest drop is expected, and `Sign In Failed { reason: 'cancelled' }` is the
half of it that is invisible everywhere else — closing Apple's own sheet throws
nothing and writes nothing.

`Onboarding Completed` carries `referral_source` as well as setting it on the
person, and the duplication is deliberate: "which channel produces accounts that
FINISH" is a breakdown of this event, and a property that only ever exists on
the profile could answer it only by joining back to one. It is one of a fixed
list of platforms — the grid on the source step — rather than free text, which
is what keeps it a breakdown instead of a tag cloud.

**The habit.** `Log Sheet Opened` → `Meal Logged`, broken down by `method`. The
two scan paths add `Meal Scan Completed`, which is where `tier` lives: how often
the catalogue actually answers rather than being guessed past. `Entry Deleted`
by `source` is the closest thing to a quality signal that does not involve
reading anybody's diary.

**The catalogue.** `Food Searched` with zero results, and `Food Picked` by
`position` — the live version of what `pnpm foods:gate` grades against thirty
fixed queries. `Barcode Scanned { outcome: 'not_found' }` is the live version of
`BARCODE-COVERAGE.md`.

**Money.** `Paywall Shown` by `trigger`, which names the button that was
refused — the only way to find out which capability sells the app, since the
paywall screen cannot know why it was opened. Then `Plan Selected` →
`Purchase Started` → RevenueCat.

**Retention.** `Health Connected`, `Reminder Toggled`, `Notification Opened`,
`Review Opened`, `Review Card Shared`, `Meal Shared`. Each is a hook that brings
somebody back, and none of them can be counted from the diary. The last two
carry the SHAPE of what left the app and never its contents — which kind of
review, and whether the meal went out as a photograph or as an illustration.

---

## Identity

`identifyUser` and `resetIdentity` are called from `SessionProvider`, beside
`identifyPurchaser` and on the same terms — once per process for whoever is
signed in, including a cold start with a restored session, which is the launch
where nothing else would have named them.

**Mixpanel and RevenueCat have to mean the same person, and one line makes
sure of it.** RevenueCat forwards its own purchase events here, and it files
each one under the `$mixpanelDistinctId` subscriber attribute — falling back to
the app user id when nothing set it. Both are the Supabase user id, so the
fallback happens to land in the right place, and "happens to" is what stops
being true the first time either side changes. So `identifyUser` RETURNS the
distinct id it registered and `SessionProvider` hands it to
`identifyPurchaser`, which sets the attribute. Get this wrong and nothing looks
broken from either dashboard: the subscription sits on a profile with no
behaviour on it, the behaviour sits on a profile that never bought anything, and
every funnel from `Paywall Shown` onwards quietly reports zero conversions.

The id is null in development and in a build whose token is still a
placeholder, and the attribute is then left unset rather than guessed at —
claiming a distinct id for somebody Mixpanel has never been told about would
file real purchases against an empty profile.

**Both platforms get the same address, from the same read of the session.** It
is `$email` on either side — RevenueCat's subscriber attribute and Mixpanel's
reserved people property — and the reserved spelling is the point: written as
`email` it is an ordinary property that neither dashboard's search box looks in.

The reason is support rather than segmentation. A segment is never built on an
address, and nothing here breaks down by one. What an address answers is the
message that begins "I paid and it is still locked": the purchase is found in
RevenueCat and what the person actually did is found in Mixpanel, and a profile
identified only by a uuid can be reached from neither. Told to one platform and
not the other, half of that question stays unanswerable.

`identifyUser` is the only thing that sets it, from the address on the session,
and it sends it AFTER the identify — a people property is filed against
whichever distinct id the SDK is holding at the time, so an email sent first
lands on the anonymous device profile and the real account stays blank. An
account whose provider supplied no address leaves it unset rather than blank.

This is a carve-out from the privacy rule in the root `CLAUDE.md` and it is the
whole of it. No name, no body figures, and nothing off the diary: the address is
the one fact here that names a person, and it names them so somebody can be
helped rather than so a chart can be cut by them.

`Signed In` is deliberately NOT fired there. Supabase announces `SIGNED_IN` on
every launch that finds a usable token in the keychain, so counting it as a
sign-in would report a returning user's every cold start as an acquisition. The
three call sites in `data/auth.ts` are the moments a person signed in.

**Person properties** are in `PersonProps` and nowhere else: no name, no body
figures, and `$email` as the single exception explained above. Each of the rest
is either a stated preference or a fact about which parts of the app are
switched on, which is what a segment is ever built from.
`finish.tsx` writes them when onboarding lands, and `useAnalyticsIdentity` keeps
them fresh — including on a handset that never ran onboarding, which is what a
reinstall or a second phone looks like.

**One super property**, `entitled`, stamped on every event. It is the cut every
other report wants, and the alternative is a paid/free property on twenty event
definitions. It waits for a real answer: offline with nothing cached, registering
`false` would mark a paying user's whole session as free.

---

## Adding an event

1. Declare it in `events.ts`, with its properties and a comment saying what
   question it answers. If that comment is hard to write, the event is probably
   not worth having.
2. Track it at the point of DECISION, not the point of render.
3. Prefer a property on an existing event to a new event. `Meal Logged` with a
   `method` is one thing to reason about; six events are six.
4. If the property is a number off somebody's diary, send its shape instead. See
   `props.ts`.
