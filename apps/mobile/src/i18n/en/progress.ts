export const progress = {
  tabs: {
    weight: 'Weight',
  },

  weight: {
    title: 'Weight',
    current: 'CURRENT',
    goal: 'GOAL',
    chartNote: 'Your last readings. One heavy weekend is not a trend.',
    now: 'Now',
    /** The dated list under the chart. */
    history: 'HISTORY',
    reading: '{{value}} kg',
    readingToday: 'Today',
    changeValue: '{{value}} kg',
    firstReading: 'First',
    editTitle: 'Weigh in on {{date}}',
    remove: 'Remove this reading',
    removeTitle: 'Remove this reading?',
    removeBody:
      'The chart loses this day. If it was your latest, your budget goes back to the one before it.',
    thisWeek: 'THIS WEEK',
    average: '7 DAY AVG',
    pace: 'PACE',
    paceValue: '{{value}} kg/wk',
    goalDate: 'GOAL DATE',
    bmi: 'BMI {{value}}',
    bmiNote: 'Healthy band. Context, never a score.',
    log: 'Log weigh in',
    sheetTitle: "Today's weigh in",
    sheetBody: 'First thing in the morning gives the steadiest reading.',
    saved: 'Weigh in saved',
  },

  // No `report` or `nutrition` block. Both screens are gone and their copy went
  // with them — this file's rule is that a screen can be deleted without leaving
  // orphans behind in here.
} as const
