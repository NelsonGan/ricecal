/**
 * Activity: what the phone's health store says you did.
 *
 * The voice here has one job the other namespaces do not: it has to keep saying
 * that burned calories are a BONUS. Every app in this category quietly
 * subtracts exercise from what you ate, and the number that comes out is a
 * number people chase. So the budget line reads as an addition, the copy under
 * it says so in words, and nothing anywhere phrases movement as permission to
 * eat less.
 *
 * The second job is Android. Health Connect is an aggregator, so what is
 * present depends on which app wrote it — no stand hours ever, often no resting
 * energy, heart rate at whatever resolution the writer chose. Every one of
 * those gaps has its own sentence naming the app responsible, because "not
 * available" tells a user nothing they can act on and "Samsung Health does not
 * report stand hours, so we show steps instead" tells them everything.
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

    apple: 'Apple Health',
    appleBody: 'iPhone and Apple Watch',
    connectHealth: 'Health Connect',
    connectHealthBody: 'Samsung Health, Fitbit, Garmin',
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

  today: {
    /** The freshness stamp beside the title. */
    syncedJustNow: 'Just now',
    syncedMinutes: '{{count}} min ago',
    syncedHours: '{{count}} hr ago',
    syncedDays: '{{count}}d ago',
    syncedNever: 'Not synced yet',

    move: 'Move',
    exercise: 'Exercise',
    stand: 'Stand',
    stepsRing: 'Steps',
    moveUnit: '/ {{goal}} kcal',
    exerciseUnit: '/ {{goal}} min',
    standUnit: '/ {{goal}} hr',
    stepsUnit: '/ {{goal}}',
    /**
     * The reference when the store sets no goal — which on Apple is always, and
     * used to leave three tiles drawing an empty track for the life of the app.
     *
     * Reads in the same grammar as the goal units above, and drops the quantity
     * for the same reason `stepsUnit` does: the tile is a third of a phone wide
     * and the label above it already says what is being counted.
     */
    avgUnit: '/ {{value}} avg',
    /**
     * The provider has no opinion on this measurement — an em dash, never a
     * zero. Only the nullable tiles can show it: active energy and steps are
     * `not null` columns, so a zero there is a real measurement.
     */
    none: '—',
    /** Neither a goal nor a history to average: a connection minutes old. */
    noGoal: 'kcal',
    noGoalMinutes: 'min',
    noGoalHours: 'hr',

    budgetTitle: 'BUDGET WITH MOVEMENT',
    goal: 'GOAL',
    eaten: 'EATEN',
    burned: 'BURNED',
    left: 'LEFT',
    over: 'OVER',
    /** The sentence this whole screen exists to keep true. */
    budgetNote: 'Burned calories extend the bar, they never shrink what you ate.',
    budgetOff: 'Movement is not extending your budget. Turn it on in Activity settings.',

    todayTitle: 'TODAY',
    /**
     * The second section, and the reason there is one.
     *
     * Balance and History are seven-day figures and sat under "TODAY", where the
     * balance read as this morning's. A heading each is cheaper than a
     * qualifier on every row.
     */
    weekTitle: 'THIS WEEK',
    stepsRow: 'Steps',
    stepsRowValue: '{{steps}} today',
    balanceRow: 'Balance',
    balanceDeficit: '{{value}} deficit a day',
    balanceSurplus: '{{value}} surplus a day',
    balanceUnknown: 'Not enough logged',
    /** What History has to say without opening it. */
    historyRowValue_one: '{{count}} workout · {{time}}',
    historyRowValue_other: '{{count}} workouts · {{time}}',
    historyNone: 'No workouts yet',

    // No `noSessionsTitle` / `noSessionsBody`. A day with nothing recorded is
    // the normal state of this screen before the afternoon, and a card saying so
    // was a screenful spent reporting that nothing had happened yet.

    /**
     * The badge while a pass is running, in place of the "13 min ago" stamp.
     *
     * This is the ONLY thing an automatic sync is allowed to move. It used to
     * report itself through the pull-to-refresh spinner, which holds the whole
     * scroll view down while it spins — so the tab opened with its header parked
     * below the notch and stayed there until the sync finished.
     */
    syncing: 'Syncing…',

    /** The one thing separating generated data from a watch. */
    demoBadge: 'Demo data',

    /**
     * A connected store with nothing in it. Development builds only.
     *
     * The simulator's, in practice: iOS 26 reports HealthKit as available and
     * shows the real permission sheet, then has no data behind it.
     */
    storeEmpty:
      'This health store is connected but has no data in it, which is what a simulator looks like. Generated data will fill these screens in.',

    /**
     * Android, where the third ring has nothing behind it.
     *
     * Generic only. There was a `{{source}}` variant naming the writing app and
     * nothing ever rendered it — Health Connect names the app that wrote a
     * SESSION, not the one that failed to write a record type nobody has.
     */
    noStandNoteGeneric: 'Your health app does not report stand hours, so we show steps instead.',
  },

  workout: {
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
    /**
     * Shown when the writing app sent one average instead of samples. Names the
     * app, because the fix — connect a watch that writes per-minute samples —
     * only makes sense once you know which one is at fault.
     */
    zonesNone: 'Session average only, no zones',
    zonesNoneBody:
      '{{source}} sends one average per session. Connect a watch that writes per minute samples for zones and splits.',
    zonesNoneBodyGeneric:
      'This session came with one average rather than a reading a minute, so there is nothing to band.',

    /**
     * No pulse data AT ALL, which is a different sentence from the three above.
     *
     * Those describe a session that arrived with one average; this one arrived
     * with none, and saying "session average only" over it described a figure
     * the screen was not showing and the store had never sent. A phone-logged
     * walk and a treadmill entered by hand both land here.
     */
    noHeartRate: 'No heart rate recorded',
    noHeartRateBody: '{{source}} logged this session without heart rate. A watch would add it.',
    noHeartRateBodyGeneric:
      'Nothing recorded a pulse for this session. A phone can time a workout but cannot take one.',

    counted: "Already counted in today's budget",
    from: 'From {{source}}',
    missing: 'This workout is no longer in your health app.',
  },

  steps: {
    title: 'Steps',
    todaySoFar: 'Today so far',
    goalLine: 'Goal {{goal}} steps',
    over: '{{value}} over',
    under: '{{value}} to go',
    unit: 'steps · {{distance}}',

    busiest: 'Busiest hour was {{hour}}.',
    /**
     * The three-block fallback's labels. It used to carry a footnote explaining
     * the grouping; the labels say it themselves, and the sentence was the app
     * narrating its own plumbing.
     */
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    noHours: 'No hourly breakdown for this day.',

    weekTitle: 'THIS WEEK',
    dailyAvg: 'DAILY AVG',
    goalDays: 'GOAL DAYS',
    best: 'BEST',

    /**
     * Deliberately does NOT say "weekends".
     *
     * The summary knows the best day and the average, not which weekdays were
     * quiet — and the design's "weekends drop by half" is a claim this screen
     * cannot check. Naming the shape without naming the days is the version
     * that is always true of the chart above it.
     *
     * It does not say "week" either, any more. `weekShape` compares a daily best
     * against a daily average, so it is range-agnostic arithmetic — but the copy
     * was not, and the range switch above it left "Your week is even" sitting
     * under twelve months of columns.
     */
    weekendNote: 'A few days carry the total. A short walk on the quiet ones would even it out.',
    steadyNote: 'Your days are even. Whatever you are doing, it is a habit now.',
    shortNote: 'Not enough days yet to see a pattern.',
  },

  balance: {
    chartTitle: 'In versus out',
    chartBody: 'Eaten against total burn',
    deficit: '{{value}} deficit',
    surplus: '{{value}} surplus',
    even: 'Even',
    eatenLegend: 'Eaten',
    burnedLegend: 'Burned',

    /**
     * The heading names the RANGE, because the figures under it are range
     * totals.
     *
     * It did not, and the numbers were unreadable for it: "Resting 48,775 kcal"
     * on the 30-day view is either a month's resting burn or a claim that the
     * user is a furnace, and nothing on the card said which.
     */
    splitTitle7d: 'WHERE THE BURN CAME FROM · 7 DAYS',
    splitTitle30d: 'WHERE THE BURN CAME FROM · 30 DAYS',
    splitTitle1y: 'WHERE THE BURN CAME FROM · 12 MONTHS',
    resting: 'Resting',
    restingBody: 'Just being alive',
    workouts: 'Workouts',
    workoutsBody: 'What your sessions cost',
    walking: 'Walking',
    walkingBody: 'Steps and errands',
    kcal: '{{value}} kcal',

    /**
     * Both sides are needed for a balance, and saying so beats drawing half of
     * one. Named counts rather than "not enough data", so it is obvious which
     * half is missing.
     */
    partial: 'Based on {{days}} of {{total}} days that had both a meal log and a resting figure.',
    noRestingTitle: 'No resting energy',
    /**
     * What is missing and what it costs, and nothing more.
     *
     * This used to promise that "the balance uses the estimate from your profile
     * instead". There is no such fallback: `activity_summary` filters the
     * balance to days that HAVE a resting figure, so with none at all the
     * headline is null and the chart's burn columns are stubs. Describing a
     * substitution that does not happen is worse than describing the gap.
     */
    noRestingBody:
      'Your health app does not report what your body burns at rest, so there is no daily balance to draw. Steps, workouts and active energy are unaffected.',
    empty: 'Log a few meals with your watch on and this fills in.',
  },

  history: {
    title: 'History',
    weekTitle: 'THIS WEEK',
    sessions: 'SESSIONS',
    time: 'TIME',
    burned: 'BURNED',
    allTitle: 'ALL SESSIONS',
    empty: 'No workouts recorded yet.',
    emptyBody: 'Anything your watch or phone records lands here.',
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
     * "Step goal", not "Daily step goal".
     *
     * It shares a row with a stepper, and separating the number ("8,000" rather
     * than "8000") took the one character that pushed the label from two wrapped
     * lines to three. The row sits under a movement toggle on a health-sync
     * screen, so "daily" was carrying no weight the context did not already.
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
   * Units used across the tab.
   *
   * One, now. There were five; `km`, `steps`, `minutes` and `hoursMinutes` were
   * never rendered, because the formats they duplicate live in
   * `features/activity/format.ts` where the decision about when NOT to show a
   * figure lives with them.
   */
  unit: {
    kcal: '{{value}} kcal',
  },
} as const
