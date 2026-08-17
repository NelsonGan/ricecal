# Health providers

What a phone can tell RiceCal about how its owner moved, where that comes from,
and which of it is worth reading.

```
types.ts          the four shapes every provider answers in
kinds.ts          workout type numbering, per provider, to our slugs
hrZones.ts        heart-rate samples to four bands
apple.ts          Apple Health (HealthKit)
androidHealth.ts  Health Connect
demo.ts           generated data, for the simulator and for development
index.ts          which of the three this device may offer
```

The sync that drives them is `data/health-sync.ts`; the screens are
`app/(tabs)/activity.tsx` and `app/activity/*`.

## The landscape, as of 2026

There are **two** health stores and everything else feeds one of them.

| | Apple Health | Health Connect |
|---|---|---|
| Platform | iOS, iPadOS, watchOS | Android 8+ (part of the framework since Android 14) |
| Kind | first-party store on device | first-party *aggregator* on device |
| Written by | iPhone, Apple Watch, and any app the user allows | Samsung Health, Fitbit, Garmin Connect, Strava, Mi Fitness, Zepp, Google Fit |
| Auth | on-device permission sheet | on-device permission sheet, per record type |
| Server access | none — device only | none — device only |

**Google Fit is gone.** Google stopped accepting new developers for the Fit REST
and Android APIs in May 2024 and switched them off through late 2026, with no
automatic data migration; historical Fit data has to be exported by hand through
Takeout. Anything written today about "reading Google Fit" is describing a dead
API. Health Connect replaced it.

**The wearable vendors are not separate integrations.** Fitbit, Garmin, Whoop,
Oura and Strava all publish cloud APIs, and every one of them is a server-side
OAuth integration with its own developer agreement, rate limits and review
process. All of them also write into Apple Health or Health Connect on the
phone the user already has. Reading the store gets their data with one
permission sheet, no keys, no backend, and no per-vendor outage. That is the
whole reason this directory has two real providers rather than seven.

The cost of that choice is stated honestly on the screens: a vendor that writes
coarse data into the store gives us coarse data, and there is no second path to
the good version. See "what Android is missing" below.

## What each store actually gives us

These are the types RiceCal reads. Both stores expose far more — sleep, cycle
tracking, blood glucose, ECG, medications, workout GPS routes — and the request
lists in `apple.ts` and `androidHealth.ts` are deliberately short. A calorie
diary that hoovers a user's medical history because the sheet was open anyway is
a different app.

| What | Apple Health | Health Connect | Used for |
|---|---|---|---|
| Active energy | `activeEnergyBurned` | `ActiveCaloriesBurned`, or `TotalCaloriesBurned` − basal | **the budget**, the Move tile, the balance chart |
| Resting energy | `basalEnergyBurned` | `BasalMetabolicRate`, or `TotalCaloriesBurned` − active | the burn split only — never the budget |
| Steps | `stepCount` | `Steps` | the steps screen, the third tile on Android |
| Distance | `distanceWalkingRunning` | `Distance` | beside steps, and on a workout row |
| Exercise minutes | `appleExerciseTime` | `ExerciseSession` durations | the Exercise tile |
| Stand hours | `appleStandTime` | — **nothing** | the Stand tile, Apple only |
| Workouts | `HKWorkout` | `ExerciseSession` | the session list and detail |
| Heart rate | `heartRate` samples | `HeartRate` samples | zones and averages on a workout |
| Body weight | `bodyMass` | `Weight` | **the calorie budget**, and the weight chart |
| Body fat | `bodyFatPercentage` | `BodyFat` | stored beside a weigh-in |

The last two are not movement, and they are the one place this list reaches
past what the Activity tab draws. A weigh-in is an INPUT to the budget rather
than a statistic beside it: `weight_logs` is what `current_weight_kg` reads and
what the recompute trigger fires on, so a user whose scale writes to their
health store gets a target that follows their weight without typing anything.
That is a different kind of justification from the rest of the table, which is
why it is written down rather than left to look like scope creep.

Everything above the line is read through an **aggregate** API rather than by
summing raw samples — `queryStatisticsCollectionForQuantity` on iOS,
`aggregateGroupByPeriod` on Android. That is not a performance choice: summing
samples on a phone that has an iPhone *and* a Watch writing step counts produces
double the steps, the classic "12,000 in the app, 6,000 in Health" bug.

**On iOS that is the end of it.** A statistics collection merges across sources
itself, so the aggregate is the answer.

**On Android the aggregate is only where the question starts.** Health Connect
dedupes by a priority list the USER controls, which means it can be switched
off without anybody being told, and then the aggregate hands back the sum of
every app that wrote. So the Android provider reads which origins contributed
and re-reads filtered to one of them — see "Who writes what" below, which is
the section to read before touching `androidHealth.ts` at all.

**The two body measurements are read as SAMPLES instead**, and the reason the
aggregate is mandatory elsewhere is exactly the reason it is wrong here. Weight
is a discrete quantity: nobody adds up three weigh-ins, so two apps reporting
the same one is a value repeated rather than a value doubled, and the
double-counting the aggregate exists to prevent cannot happen. What the
aggregate would cost is the answer itself — `cumulativeSum` over a Saturday's
three weigh-ins is 217 kg, and Health Connect's `WEIGHT_AVG` / `WEIGHT_MIN` /
`WEIGHT_MAX` are none of them the number wanted. A day's weight is its LAST
reading, which is the rule `weight_logs` has always applied to somebody weighing
themselves twice before breakfast, so both providers read ascending and keep the
last sample per local day.

**A percentage means different things on the two platforms.** HealthKit's `%`
unit is a FRACTION — 22% body fat reads as `0.22` — while Health Connect's
`BodyFat.percentage` is already `22`. Converting on both sides gives 2,200 on
one of them, and `body_fat_pct` is checked `between 1 and 75`, so the figure
would be dropped and body fat would silently never appear. `asPercent` in
`apple.ts` normalises it, branching on 1 rather than on the platform, because 1%
body fat is not a body and the whole plausible range is therefore unambiguous.

**A reading the user typed is never overwritten by a synced one.** Both authors
write `weight_logs`, one row per day, so they compete for the same key — and the
rolling window means the sync competes once a minute for as long as the app is
open. The rule lives in `sync_weight_readings` rather than in this directory,
because it is a `WHERE` on an `ON CONFLICT DO UPDATE` and PostgREST's `.upsert()`
cannot express one. See the header of `schemas/40_weight_logs.sql`.

### What Apple will not tell us

**Whether a read was granted.** `authorizationStatusFor` answers for writes
only; for reads it returns `notDetermined` however the sheet was answered. This
is a deliberate Apple privacy decision — knowing an app was denied is itself
information about the user. The consequence runs all the way to the UI: the
connect flow syncs immediately and treats *zero days written* as the signal, and
the copy for that state does not accuse anybody of declining, because we cannot
tell.

**Ring goals.** Move, Exercise and Stand targets live on `HKActivitySummary`,
which the binding used here does not expose. `activity_days` has the columns and
they stay null on Apple; the tiles fall back to a figure with no target rather
than inventing one.

### What Android is missing, and why the screens say so

Health Connect holds what other apps wrote to it, so the gaps are a property of
the user's app mix rather than of the platform:

- **No stand hours, ever.** There is no such record type. The third tile becomes
  Steps and a footnote says why.
- **Active energy only if something writes it.** This is the big one — see the
  table below. `energyFor` in `androidHealth.ts` derives it from a total minus a
  basal when it has to, and reports nothing at all when it cannot.
- **Heart rate at whatever resolution the writer chose.** A watch writes a
  sample every few seconds and produces real zones. Strava writes one average
  per session and produces none — `hr_zones` is null, and the workout screen
  names Strava and says what would fix it.
- **Hourly steps only if the writer recorded short segments.** Samsung Health
  writes one record for the whole day, which is worse than coarse — see
  `informativeHours`.

None of these is an error state and none of them is hidden. Every one has copy
in `i18n/en/activity.ts` that names the app responsible, because "not available"
is not something a user can act on.

## Who writes what, and what it costs us

Health Connect is an aggregator with no opinion, so the shape of the data is the
shape of whatever the user installed. This table is the thing the Android
provider is written against, and it was assembled the expensive way: from a
support report where the diary said 4,675 steps and the user's own Samsung
Health said 2,808 on the same afternoon.

| source | steps | energy | workouts | the thing to know |
|---|---|---|---|---|
| **Samsung Health** | ONE record spanning the whole day | `TotalCaloriesBurned` only | sessions + dense HR | no active energy, and no intra-day step shape |
| **Garmin Connect** | daily wellness + per-workout | active AND total, both | sessions with distance, elevation, cadence | the richest source here, and one-way: Garmin will not read back |
| **Fitbit / Google Health** | yes | yes, partial coverage | yes | reads and writes, but not every type |
| **Strava** | activities only | per-activity calories | GPS activities, one average HR | writes nothing about a day the user did not record |
| **Mi Fitness / Zepp** | via their own app, patchy | patchy | patchy | reaches Health Connect indirectly at best |
| **the phone itself** | granular, all day | none | none | lowest priority by default; attributed to `android` before June 2026 and to a device-specific synthetic name after |
| **Apple Health** (for contrast) | dedupes in the query | active AND basal, always | sessions with their own energy | none of the problems below apply |

Three consequences fall out of that table, and all three are implemented rather
than merely noted.

**A sum across every writer double counts.** Health Connect dedupes Activity and
Sleep by a priority list, and the list belongs to the user: they can reorder it
and they can remove a source from it, after which that source goes on writing
and simply stops being deduped against. So `aggregated` picks ONE origin and
re-reads filtered to it. The whole argument, including what it costs, is in
`connectOrigins.ts`.

**A zero is not a measurement, and it is not always a zero.** The native bridge
reads a missing aggregate metric as `0.0` — `record[StepsRecord.COUNT_TOTAL]
?.toDouble() ?: 0.0` — so a record type nobody on the phone writes is
indistinguishable from one everybody wrote zero to. `dataOrigins` on the
aggregate result is the difference, and `hasOrigins` is the one place that check
lives.

Probed against a Health Connect with **nothing in it at all**, on a Pixel API 36
emulator, the two answers came back:

```
Steps                { dataOrigins: [], COUNT_TOTAL: 0 }
ActiveCaloriesBurned { dataOrigins: [], ACTIVE_CALORIES_TOTAL: 0 kcal }
Distance             { dataOrigins: [], DISTANCE: 0 m }
TotalCaloriesBurned  { dataOrigins: [], ENERGY_TOTAL: 1564.5 kcal }
BasalMetabolicRate   { dataOrigins: [], BASAL_CALORIES_TOTAL: 1564.5 kcal }
```

The last two are the ones to remember. Health Connect DERIVES an energy figure
rather than declining to answer, so an empty store reports 1,564.5 kcal a day as
confidently as a watch would. Nothing about the number says it came from
nowhere; only the empty `dataOrigins` does.

Run the pre-fix code over that payload and it writes eight rows of `active_kcal
0, resting_kcal 1565, distance_m 0` for a phone that has never recorded a step
— which is the shape the Samsung account's rows were actually in. So a constant
"resting" figure in somebody's diary is not necessarily their store's basal; it
can be this. The same guard drops both, and it is what makes the project's "null
is not zero in `activity_days`" rule true on Android rather than merely written
down.

**Active energy has to be derived, for the commonest phone in this market.**
Only the active half of a day's burn may reach the budget, because the goal is
already a Mifflin-St Jeor figure with basal metabolism inside it. Samsung writes
only the total, so `energyFor` subtracts a basal — the store's own
`BasalMetabolicRate` where there is one, else the profile's own figure through
`basalRate`, which is the same formula `compute_targets()` runs in Postgres.
With neither, it reports null and the Move tile draws a dash.

### What that bug actually looked like

Worth keeping, because every part of it read as something other than what it
was.

- Steps ran ~1.6× high. Seven days averaged 9,197 against Samsung's own 5,635.
  The hourly rows gave it away: every day had a constant floor in all 24 hours —
  117 on the day in question — and `117 × 24 = 2,808`, exactly the figure
  Samsung Health was showing. One whole-day record, divided across the buckets
  it overlapped, with a second source's real segments summed on top.
- The hourly chart claimed steps at 3am, every night, for the same reason.
- `active_kcal` was 0 on every single day, so movement extended the budget by
  nothing at all.
- `resting_kcal` was derived as total minus active, so with active at zero the
  ENTIRE day's burn was filed as resting: 2,524 kcal of "resting" on a day with
  two hours of badminton in it.
- The badminton session itself showed 0 kcal against Samsung's 1,210, because
  the session's energy was aggregated from the record type Samsung never wrote.
- `distance_m` was 0 every day against a real 2.15 km, same cause.

Heart rate came through perfectly throughout — 141 average, 178 max, zones and
all — which is what made the session card read as a rendering bug rather than a
data one.

## The simulator has a Health store with nothing in it

This section was written the other way round first, on the strength of a decade
of documentation saying the iOS Simulator has no Health app at all. It is out of
date. An **iOS 26 simulator reports `isHealthDataAvailable()` as true and shows
the real permission sheet** — verified on `iPhone 17 Pro (iOS 26.5)`, which
listed all seven requested types.

What it does not have is *data*. A granted connection reads a year and writes
nothing, so every screen is a row of zeros — a worse failure than an honest
"unavailable", because it looks like the feature is broken rather than like the
device is empty.

That state cannot be detected before reading, since it is indistinguishable from
an iPhone whose owner has never worn a watch. So it is decided by the outcome:
`canOfferDemo(availability, connectReadNothing)`, and the Activity tab offers
generated data as a card once a connected store turns out to have no days in it.

`demo.ts` is the answer, and it is a `health_provider` enum value rather than a
flag so that every query, chart, disconnect and delete treats it identically to
a real one. It is deterministic — a pure function of the date — because the sync
re-reads a rolling window on every foreground, and a `Math.random()` generator
would rewrite Tuesday every thirty seconds and make the one property worth
demonstrating (that syncing twice changes nothing) the one property visibly
absent.

### Seeding a simulator's Health store by hand

The Health app's **Add Data** button works for the types a person could
plausibly enter themselves, and is absent for the ones a watch derives. Verified
on iOS 26.5:

| Type | Add Data | Notes |
|---|---|---|
| Steps | yes | one sample per entry; several entries give the hourly chart its shape |
| Active Energy | yes | |
| Resting Energy | yes | |
| Walking + Running Distance | yes | entered in km, stored in metres |
| Flights Climbed | yes | |
| Weight | yes | entered in the device's unit, read back in kg |
| Body Fat Percentage | yes | typed as `22`, read back as `0.22` — see `asPercent` |
| Exercise Minutes | **no** | derived; "Apple Watch automatically tracks and logs" |
| Stand Minutes / Stand Hours | **no** | derived, same reason |
| Workouts | **no** | Health has no way to create an `HKWorkout` |

So a simulator can exercise the budget, the steps screen, the energy balance and
weight syncing end to end on genuinely real HealthKit reads, and cannot exercise
the Exercise or Stand tiles, the session list, or heart-rate zones — those need a
device with a watch, or the demo provider.

Weight is the useful one to seed by hand, because **the demo provider
deliberately generates none**. Everything else it invents is confined to the
activity tables, which nothing but the Activity screens read and which a
disconnect deletes by `provider = 'demo'`. A weigh-in has no such boundary: it
lands in the same table the user's own readings live in and moves their real
calorie target. Two entries a week apart in the Health app demonstrate the whole
feature without that.

Two consequences worth knowing when seeding: entries default to *now*, so
several step samples at different times need the time wheel; and fewer than
`HOURLY_MIN_BUCKETS` distinct hours makes the steps screen fall back to its
three-block layout, which is correct but easy to mistake for a bug.

It is offered only in a development build, and only when the native store is
unusable. A developer on a real iPhone should be connecting their real Health
app; a "use demo data" button beside that is a trap you fall into once and then
debug for an hour.

## Things that will bite you

**Both libraries must be `require`d lazily.** `@kingstinct/react-native-healthkit`
is a Nitro module and its iOS entry point reaches for a native HybridObject at
module scope. A top-level `import` throws during the bundle's first evaluation
on any build whose native side lacks it — which is every dev client made before
the dependency landed — and the symptom is a white screen on launch rather than
a broken tab. Both providers load inside a `try` and report `not-linked`.

**Adding these needs a native rebuild.** `expo prebuild && expo run:ios`. They
do not work in Expo Go and never will.

**A Health Connect aggregate never returns null, so it can never say "nobody
wrote this".** Every metric comes back as a number because the native bridge
coalesces a missing one to `0.0`. Read `dataOrigins` on the result before you
believe any figure it carries — `hasOrigins` in `androidHealth.ts` — or a
provider that has no opinion about a measurement will be recorded as having
measured none of it. That mistake filed a user's whole daily burn as resting for
a week.

**A permission granted is not a record type written.** `health_connections
.permissions` said `ActiveCaloriesBurned` was granted on the account where
active energy was zero every day, and it was: the grant was real and Samsung
Health simply never writes that type. When a figure is missing, the permission
list is the wrong place to look — `dataOrigins` is the one that answers.

**Adding a read type re-asks for the whole sheet, once per device.** `asked` in
`health-sync.ts` fingerprints the list, so `BasalMetabolicRate` joining it means
every already-connected Android install sees one more permission sheet on its
next foreground. That is the mechanism working, not a bug, but it is worth
knowing before you add a type casually.

**Health Connect reads nothing that the manifest did not declare, and nobody
tells you.** `react-native-health-connect`'s config plugin adds the rationale
intent-filter and the `ViewPermissionUsageActivity` alias and *no*
`uses-permission` at all — those are the app's to declare. Android health sync
shipped without them, and the failure has no error anywhere in it: the record
type is left off the permission sheet, `requestPermission` resolves without it,
and `requestAccess` reports a refusal the user was never offered the chance to
make. On a phone with RiceCal installed, Health Connect's own App permissions
screen said "No compatible apps installed".

So the nine live in `app.json` under `android.permissions`, and they cannot be
derived there: Expo's config loader transpiles `app.config.ts` alone and
requires its relative imports through plain Node, which will not load a `.ts`
module. `connectPermissions.ts` holds the record types and their permissions,
and `__tests__/health.test.ts` holds the manifest to it in both directions — a
type with no permission fails, and a permission for a type nobody reads fails
too, because an app that asks for more health data than it uses is one a
reviewer rejects.

Those tests read the config through `app.config.ts` rather than off `app.json`,
because the VARIANTS sit between the two. Both of them rebuild `android` by
spreading it today; one that composed the object instead would drop the
permissions for its own build and no other, and on the `development` profile
that is every EAS dev build straight back to the bug above. So each assertion
runs three times, once per variant.

Note the one irregular name while you are there: `ExerciseSession` is read by
`READ_EXERCISE`, not `READ_EXERCISE_SESSION`. Five of the six are the record
type in screaming snake case, which is exactly what makes a derivation tempting
and wrong.

**Health Connect's `revokeAllPermissions` does not take effect until the app
process restarts** — the library's own docs say so, and `getGrantedPermissions`
keeps returning the revoked ones until then. That is why disconnecting in
RiceCal is our own flag on `health_connections` and not a call to that API.

**Calories in Health Connect are gram-calories where the unit says so.**
`inCalories` is a thousandth of `inKilocalories`. Reading the wrong one puts
360,000 on a Move ring.

**Apple's `appleStandTime` is not the Stand ring.** The ring counts hours in
which the user stood for at least a minute; `appleStandTime` is minutes spent
standing. The conversion in `apple.ts` divides and caps at 24, which is the
honest reading of the figure that is actually queryable as a statistic.
