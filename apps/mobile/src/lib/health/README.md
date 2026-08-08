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
| Active energy | `activeEnergyBurned` | `ActiveCaloriesBurned` | **the budget**, the Move tile, the balance chart |
| Resting energy | `basalEnergyBurned` | `TotalCaloriesBurned` − active | the burn split only — never the budget |
| Steps | `stepCount` | `Steps` | the steps screen, the third tile on Android |
| Distance | `distanceWalkingRunning` | `Distance` | beside steps, and on a workout row |
| Exercise minutes | `appleExerciseTime` | `ExerciseSession` durations | the Exercise tile |
| Stand hours | `appleStandTime` | — **nothing** | the Stand tile, Apple only |
| Workouts | `HKWorkout` | `ExerciseSession` | the session list and detail |
| Heart rate | `heartRate` samples | `HeartRate` samples | zones and averages on a workout |

Both are read through an **aggregate** API rather than by summing raw samples —
`queryStatisticsCollectionForQuantity` on iOS, `aggregateGroupByPeriod` on
Android. That is not a performance choice. Both stores deduplicate across
sources inside the aggregate, and summing samples on a phone that has an iPhone
*and* a Watch writing step counts produces double the steps. It is the classic
"12,000 in the app, 6,000 in Health" bug.

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
- **Resting energy only if something writes it.** Many phones write neither
  `BasalMetabolicRate` nor `TotalCaloriesBurned`. Without it there is no honest
  three-way burn split and no daily balance, and the balance screen says which
  half is missing instead of drawing zeros.
- **Heart rate at whatever resolution the writer chose.** A watch writes a
  sample every few seconds and produces real zones. Strava writes one average
  per session and produces none — `hr_zones` is null, and the workout screen
  names Strava and says what would fix it.
- **Hourly steps only if the writer recorded short segments.** Samsung Health
  writes coarse blocks. The steps chart falls back to three blocks a day rather
  than drawing twenty-four columns of which three are skyscrapers.

None of these is an error state and none of them is hidden. Every one has copy
in `i18n/en/activity.ts` that names the app responsible, because "not available"
is not something a user can act on.

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
| Exercise Minutes | **no** | derived; "Apple Watch automatically tracks and logs" |
| Stand Minutes / Stand Hours | **no** | derived, same reason |
| Workouts | **no** | Health has no way to create an `HKWorkout` |

So a simulator can exercise the budget, the steps screen and the energy balance
end to end on genuinely real HealthKit reads, and cannot exercise the Exercise
or Stand tiles, the session list, or heart-rate zones — those need a device with
a watch, or the demo provider.

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

**Health Connect reads nothing that the manifest did not declare, and nobody
tells you.** `react-native-health-connect`'s config plugin adds the rationale
intent-filter and the `ViewPermissionUsageActivity` alias and *no*
`uses-permission` at all — those are the app's to declare. Android health sync
shipped without them, and the failure has no error anywhere in it: the record
type is left off the permission sheet, `requestPermission` resolves without it,
and `requestAccess` reports a refusal the user was never offered the chance to
make. On a phone with RiceCal installed, Health Connect's own App permissions
screen said "No compatible apps installed".

So the six live in `app.json` under `android.permissions`, and they cannot be
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
