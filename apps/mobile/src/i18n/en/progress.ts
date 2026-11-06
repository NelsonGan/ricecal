/**
 * Trends: four cards over one range.
 */
export const progress = {
  title: 'Trends',

  /** "5 of 7". Shared by every card that counts something over the range. */
  ofDays: '{{done}} of {{total}}',
  /** The first card's switch, read out: what the account follows. */
  focus: 'Track',

  /** Each card's heading, and the tabs on `/history`. */
  metric: {
    calories: 'Calories',
    water: 'Water',
    weight: 'Weight',
    protein: 'Protein',
  },

  range: {
    label: 'Range',
    '7d': '7D',
    '30d': '30D',
    '1y': '1Y',
    /** What a chart covers, for its screen-reader label. */
    span7d: 'Last 7 days',
    span30d: 'Last 30 days',
    span1y: 'Last 12 months',
    /** The axis under a 30-day chart, whose columns are seven-day blocks. */
    week: 'Wk {{index}}',
  },

  calories: {
    /** Beside the big figure, which averages the days that had food logged. */
    unit: 'kcal a day',
    /** The readout over a tapped point. */
    value: '{{value}} kcal',
    under: '{{value}} under',
    over: '{{value}} over',
    chart: 'Calories a day over {{span}}, against your goal',
    /** The legend under the macro bar: "Carbs 52%". */
    share: '{{macro}} {{value}}%',
    grams: '{{value}} g',
    empty: 'No meals logged in this range.',
  },

  /** The first card when the account follows protein rather than the budget. */
  protein: {
    unit: 'g a day',
    above: '{{value}} g above',
    short: '{{value}} g short',
    chart: 'Protein a day over {{span}}, against your target',
  },

  /**
   * Training on Trends. The count is the headline, compared with the period
   * of the same length before it; the line is time trained.
   */
  workouts: {
    title: 'Workouts',
    unit_one: 'workout',
    unit_other: 'workouts',
    /** The pill beside the count. `delta` arrives signed: "+3", "-1". */
    vs7d: '{{delta}} vs last week',
    vs30d: '{{delta}} vs previous 30 days',
    vs1y: '{{delta}} vs previous year',
    chart: 'Time trained over {{span}}',
    latest: 'LATEST',
    /** The whole card for somebody who has never logged a workout. */
    startTitle: 'Track your workouts',
    startBody: 'Log a session and your training shows here.',
  },

  water: {
    /** Beside the big figure: "1.9 L a day". */
    unit: '{{unit}} a day',
    goalDays: '{{done}} of {{total}} goal days',
    chart: 'Water a day against a goal of {{amount}}',
    empty: 'No water logged in this range.',
  },

  weight: {
    /**
     * The unit is interpolated, not written in. Every one of these renders in
     * pounds for anybody whose Units setting says so, and a hard-coded "kg"
     * beside a converted number is worse than carrying no unit at all.
     */
    change: '{{value}} {{unit}}',
    chart: 'Your weight over {{span}}',
    /** Read by the workout progress page too. */
    thisWeek: 'THIS WEEK',

    toGoal: '{{value}} {{unit}} to your {{target}} {{unit}} goal',
    atGoal: 'At your goal weight',
    weeksAway: '~{{count}} weeks',
    empty: 'No weigh-ins yet.',

    add: 'Add',
    reading: '{{value}} {{unit}}',
    firstReading: 'First',

    /** The sheet. Adding a weigh-in is a sheet, not a page. */
    sheetTitle: 'Add weight',
    sheetEditTitle: 'Weigh in on {{date}}',
    thisMorning: 'This morning',
    down: '{{value}} {{unit}} down from {{day}}',
    up: '{{value}} {{unit}} up from {{day}}',
    same: 'The same as {{day}}',
    save: 'Save weigh in',
    saved: 'Weigh in saved',
    saveFailed: 'Weigh in not saved. Try again.',
    saveOffline: 'You are offline. Weigh in not saved.',
    remove: 'Remove this reading',
    removeTitle: 'Remove this reading?',
    removeBody:
      'The chart loses this day. If it was your latest, your budget goes back to the one before it.',
  },

  /**
   * Every entry behind the charts, newest first, on `/history`. A meal is a
   * row, water is a day's total, and a weigh-in is a day's reading, because
   * that is how each is stored. Each Trends card's heading opens it.
   */
  history: {
    title: 'History',
    /** Beside a day's heading: everything eaten that day. */
    dayTotal: '{{value}} kcal',
    /** A water month's heading, beside the month: the average of days logged. */
    waterAverage: '{{amount}} avg',
    goalMet: 'Goal met',
    emptyTitle: 'Nothing logged yet',
    emptyBody: 'Everything you log shows up here.',
    failed: 'History did not load',
  },
} as const
