/**
 * Activity: what the phone's health store says you did.
 *
 * The voice here has to keep saying that burned calories are a bonus. Every app
 * in this category quietly subtracts exercise from what you ate, so the budget
 * line reads as an addition and nothing phrases movement as permission to eat
 * less.
 *
 * The second job is Android. Health Connect is an aggregator, so what is present
 * depends on which app wrote it, and every gap has its own sentence naming the
 * app responsible: "not available" tells a user nothing they can act on.
 */
export const activity = {
  title: 'Activity',

  connect: {
    title: 'Let your watch do the counting',
    body: "Connect your phone's health app and every walk, run and badminton game adds back to today's budget.",

    readTitle: 'WHAT WE READ',
    energy: 'Active energy',
    energyBody: 'What you burned moving',
    steps: 'Steps and distance',
    stepsBody: 'Daily habit, not a target',
    workouts: 'Workouts',
    workoutsBody: 'Type, time, pace, heart rate',

    /** The promise, and it is a real one: `toShare` is empty in every request. */
    privacy:
      'Read only. We never write anything back, and your health data is only ever stored in your own account.',

    /**
     * The line UNDER the connect button, on each platform. There is no longer a
     * label for the button itself: it says `common:action.continue`, because
     * App Review reads a button naming the permission as the app doing the
     * asking rather than the system. See `ConnectPanel`.
     */
    appleBody: 'Apple Health, on iPhone and Apple Watch',
    connectHealthBody: 'Health Connect: Samsung Health, Fitbit, Garmin',
    /**
     * Only ever a ROW LABEL on the health-settings screen, which is why it is
     * here beside the other three rather than reusing `workout.zonesTitle` —
     * that one is a caps section heading, and borrowing it put
     * "HEART RATE ZONES" in a list of sentence-case rows.
     */
    heart: 'Heart rate',
    demo: 'Use demo data',
    demoBody: 'Generated on this device, for development',

    connecting: 'Reading your history…',
    /** During the backfill. A year is a wait worth narrating. */
    progress: '{{done}} of {{total}}',

    /**
     * iOS grants nothing visibly, so an empty read is the only evidence of a
     * refusal — hence the wording, which does not accuse the user of declining
     * when the honest answer is that we cannot tell.
     */
    emptyTitle: 'Nothing came back',
    emptyBody:
      "We could not read any activity. If you turned RiceCal off in Health's privacy settings, turn it back on and try again.",
    retry: 'Try again',

    unavailableTitle: 'No health data here',
    /**
     * `HKHealthStore.isHealthDataAvailable()` said no — an iPad, or an older
     * simulator. A CURRENT iOS simulator does not land here: it reports the
     * store as available and simply has nothing in it, which is handled after
     * the connect instead.
     */
    simulator:
      'This device has no Health store to read. On a simulator, generated data fills these screens instead.',
    notInstalled:
      'Health Connect is not set up on this phone. Install it from the Play Store, turn on an app that records your movement, then come back.',
    notLinked:
      'This build does not include the health module. Rebuild the dev client after installing it.',
    wrongPlatform: 'This phone has no health store RiceCal can read.',
    openStore: 'Open Play Store',
    checkAgain: 'Check again',
  },

  /** How long ago the last sync was. Settings, Health reads these. */
  today: {
    syncedJustNow: 'Just now',
    syncedMinutes: '{{count}} min ago',
    syncedHours: '{{count}} hr ago',
    syncedDays: '{{count}}d ago',
    syncedNever: 'Not synced yet',
  },

  workout: {
    bpmUnit: 'bpm',
    metresUnit: 'm',
    kilometresUnit: 'km',
    heartRate: 'Heart rate',
    energy: 'Active energy',
    swimPaceUnit: '{{value}} /100 m',
    rowPaceUnit: '{{value}} /500 m',
    distance: 'DISTANCE',
    time: 'TIME',
    pace: 'PACE',
    /**
     * Its own heading, not PACE.
     *
     * A speed rises as you go faster and a pace falls, so the two read in
     * opposite directions; "PACE 24.1 km/h" made a cyclist work out which they
     * had been given.
     */
    speed: 'SPEED',
    paceUnit: '{{value}} /km',
    speedUnit: '{{value}} km/h',
    avgHr: 'AVG HR',
    maxHr: 'MAX HR',
    elevation: 'ELEV',
    bpm: '{{value}} bpm',
    metres: '{{value}} m',

    zonesTitle: 'HEART RATE ZONES',

    missing: 'This workout is no longer in your health app.',
  },

  settings: {
    title: 'Health sync',
    connectedTitle: 'CONNECTED',
    sourceTitle: 'WHAT WE READ',
    lastSynced: 'Last synced {{when}}',
    syncNow: 'Sync now',
    syncing: 'Syncing…',
    extendBudget: 'Movement extends my budget',
    extendBudgetBody: 'Burned calories are added to the day, never subtracted from what you ate.',
    /**
     * "Step goal", not "Daily step goal". It shares a row with a stepper, and
     * separating the number took the character that pushed the label to three
     * wrapped lines. The row sits under a movement toggle, so "daily" carried no
     * weight the context did not.
     */
    stepGoal: 'Step goal',
    disconnect: 'Disconnect',
    disconnectBody: 'Stops syncing. Everything already read stays in your history.',
    disconnectConfirm: 'Stop syncing?',
    disconnectConfirmBody:
      'RiceCal will stop reading your health app. The activity already recorded stays.',
    clearDemo: 'Delete demo data',
    clearDemoBody: 'Removes every generated day and session from this account.',
    granted: 'On',
    notGranted: 'Not granted',
    /** Android partial grants. iOS can never populate this — see the provider. */
    partial: 'Some data is not shared',
  },

  /** Where a stat came from, when a screen has to name it. */
  provider: {
    apple_health: 'Apple Health',
    health_connect: 'Health Connect',
    demo: 'Demo data',
  },

  /** Heart-rate bands. Four, not the conventional five — see `hrZones.ts`. */
  zone: {
    easy: 'Easy',
    steady: 'Steady',
    hard: 'Hard',
    peak: 'Peak',
  },

  kind: {
    run: 'Run',
    walk: 'Walk',
    hike: 'Hike',
    cycle: 'Cycling',
    swim: 'Swim',
    badminton: 'Badminton',
    tennis: 'Tennis',
    football: 'Football',
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    gym: 'Gym',
    strength: 'Strength',
    hiit: 'HIIT',
    yoga: 'Yoga',
    dance: 'Dance',
    martialArts: 'Martial arts',
    rowing: 'Rowing',
    stairs: 'Stairs',
    other: 'Workout',
  },

  /**
   * Units used across the tab. One, now: `km`, `steps`, `minutes` and
   * `hoursMinutes` were never rendered, because the formats they duplicate live
   * in `features/activity/format.ts` beside the decision about when not to show a
   * figure at all.
   */
  unit: {
    kcal: '{{value}} kcal',
  },
} as const
