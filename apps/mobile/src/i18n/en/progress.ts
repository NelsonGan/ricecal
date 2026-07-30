/**
 * Trends: three tabs over one range.
 *
 * The screen used to be weight and only weight, and this file used to be its
 * copy. It is now three panels — calories, water, weight — each of which reads
 * differently at seven days, thirty days and a year, which is why so much of
 * what follows comes in threes. A panel picks the one that matches its range
 * rather than assembling a sentence out of fragments: "Weekly average, goal
 * 2,100 a day" is one string in every language, and in some of them the word
 * order is not this one.
 */
export const progress = {
  title: 'Trends',

  /**
   * "5 of 7". Shared by all three panels, because all three count something over
   * the same range and three copies of one sentence is three places to fix it.
   */
  ofDays: '{{done}} of {{total}}',

  /**
   * The three tiles under the title, which are the tabs.
   *
   * A tile is a summary and a control at once: it says what the range averaged
   * and it switches the panel below to that metric. The unit is the tile's
   * small print, so it stays short — "avg" rather than "daily average".
   */
  metric: {
    calories: 'Calories',
    water: 'Water',
    weight: 'Weight',
    caloriesUnit: 'avg',
    waterUnit: 'cups',
    /** Nothing logged in the range at all. Never a zero: zero is a measurement. */
    none: '—',
    a11y: '{{metric}}, {{value}}',
  },

  range: {
    label: 'Range',
    '7d': '7D',
    '30d': '30D',
    '1y': '1Y',
    span7d: 'Last 7 days',
    span30d: 'Last 30 days',
    span1y: 'Last 12 months',
    /** The axis under the 30-day chart, whose columns are seven-day blocks. */
    week: 'Wk {{index}}',
    weekLong: 'Week {{index}}',
  },

  calories: {
    goalNote: 'Goal {{goal}} kcal a day',
    goalNoteWeekly: 'Weekly average, goal {{goal}} a day',
    goalNoteMonthly: 'Monthly average, goal {{goal}} a day',
    /** Before onboarding computes a budget. The chart still draws. */
    noGoal: 'No daily budget set yet',
    under: '{{value}} under',
    over: '{{value}} over',
    chart: 'Calories a day, split by carbs, protein and fat',

    grams: '{{value}} g',
    shareOfIntake: '{{value}}% of intake',

    goalTitle: 'AGAINST YOUR GOAL',
    daysUnder: 'Days under {{goal}}',
    daysLogged: 'Days logged in full',

    /** Replaces the goal card on the year view, where 365 bars of it say less. */
    notableTitle: 'NOTABLE MONTHS',
    monthAverage: '{{value}} avg',

    emptyTitle: 'No meals in this range',
    emptyBody: 'Log something and the bars fill in from the day you did.',
  },

  water: {
    cupNote: 'A cup is 250 ml',
    cupNoteWeekly: 'Weekly average, a cup is 250 ml',
    cupNoteMonthly: 'Monthly average, a cup is 250 ml',
    goalPill: 'goal {{goal}}',
    chart: 'Cups of water a day against a goal of {{goal}}',

    reached: 'Reached goal',
    short: 'Short of goal',

    goalDays: 'GOAL DAYS',
    bestDay: 'BEST DAY',
    bestMonth: 'BEST MONTH',
    yearAverage: 'YEAR AVG',
    total: 'TOTAL',
    cups: '{{value}} cups',

    todayTitle: 'TODAY',
    todayCount: '{{filled}} of {{goal}} cups',
    toGo: '{{count}} to go',
    goalMet: 'Goal reached',

    /**
     * The habit card. "Six or more" is not a second goal — it is the line below
     * which a day stops counting as a day you drank, and it moves with the goal
     * rather than being a number of its own.
     */
    habitTitle: 'HABIT',
    daysAtLeast: 'Days at {{cups}} cups or more',
    daysLogged: 'Days logged',
    monthsAveraging: 'Months averaging {{cups}}+',
    monthsLogged: 'Months logged',

    emptyTitle: 'No water logged in this range',
    emptyBody: 'Tap a glass on Today and this fills in.',
  },

  weight: {
    /**
     * The subtitle under the line: the heaviest reading, and when it was.
     *
     * The unit is interpolated, not written in. Every one of these renders in
     * pounds for anybody whose Units setting says so, and a hard-coded "kg"
     * beside a converted number is worse than carrying no unit at all.
     */
    peakOn: '{{value}} {{unit}} on {{date}}',
    peakIn: '{{value}} {{unit}} in {{month}}',
    change: '{{value}} {{unit}}',
    chart: 'Your weight over {{span}}',

    thisWeek: 'THIS WEEK',
    thisMonth: 'THIS MONTH',
    thisYear: 'THIS YEAR',
    average7: '7 DAY AVG',
    average30: '30 DAY AVG',
    lightest: 'LIGHTEST',
    weighIns: 'WEIGH INS',
    monthsLogged: 'MONTHS LOGGED',

    toGoal: '{{value}} {{unit}} to your {{target}} {{unit}} goal',
    /** No target weight, or already at it. The tile row above still stands. */
    noTarget: 'No target weight set',
    atGoal: 'At your goal weight',
    weeksAway: '~{{count}} weeks',

    recentTitle: 'RECENT WEIGH INS',
    add: 'Add',
    weekByWeek: 'WEEK BY WEEK',
    byQuarter: 'BY QUARTER',
    quarter: '{{from}} to {{to}}',

    reading: '{{value}} {{unit}}',
    readingToday: 'Today',
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
    remove: 'Remove this reading',
    removeTitle: 'Remove this reading?',
    removeBody:
      'The chart loses this day. If it was your latest, your budget goes back to the one before it.',

    emptyTitle: 'No weigh-ins in this range',
    emptyBody: 'One reading draws a point. Two draw a line.',
  },
} as const
