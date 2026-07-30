export const progress = {
  tabs: {
    weight: 'Weight',
    nutrition: 'Nutrition',
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

  // No `report` block. The weekly report screen is gone, and its copy went with
  // it — this file's rule is that a screen can be deleted without leaving orphans
  // behind in here.

  nutrition: {
    title: 'Nutrition',
    range: 'Last 30 days',
    averageDay: 'AVERAGE DAY',
    calories: 'Calories',
    caloriesValue: '{{value}} kcal',
    fibre: 'Fibre',
    sugar: 'Sugar',
    gramsValue: '{{value}} g',
    topFoods: 'TOP FOODS',
    timesThisMonth: '{{count}} times this month',
  },
} as const
