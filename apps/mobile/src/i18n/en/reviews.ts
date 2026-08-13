/**
 * Reviews: a finished week or month, read as four cards you tap through.
 *
 * Two shapes of copy, and the split is worth knowing before adding to it.
 *
 * The LIST speaks in periods: a name, a week number, an average. The STORY
 * speaks in one period's numbers, and every headline in it is a figure with a
 * word after it rather than a sentence with a figure in it — the number is what
 * the eye lands on, and a label under it says only what it was.
 *
 * Where a string differs between a weekly review and a monthly one it is
 * written out twice rather than assembled: "Under it on 5 of 7 days" and "Under
 * it on 18 of 27 days" read the same in English and do not in every language,
 * and a panel choosing between two whole sentences is what keeps that possible.
 */
export const reviews = {
  title: 'Reviews',

  /** The row at the foot of Trends that leads here. */
  entry: {
    title: 'Reviews',
    subtitle: 'Look back at a week or a month',
  },

  kind: {
    week: 'Weekly',
    month: 'Monthly',
    label: 'Review length',
  },

  list: {
    /**
     * The two lines under a period's name, and they divide the same facts
     * differently by kind.
     *
     * A week is named by its number, so the count of logged days sits beside
     * the average on the line below. A month has no number anybody thinks in,
     * so the count moves up to that line and the average stands alone. Neither
     * shape says a figure twice.
     */
    weekMeta: 'Week {{index}}',
    weekSummary: '{{kcal}} kcal a day, {{done}} of {{total}} logged',
    monthMeta: '{{weeks}} weeks, {{done}} of {{total}} days logged',
    monthSummary: '{{kcal}} kcal a day',
    /** The same with the scale's answer, which is what a month is really about. */
    monthSummaryWeight: '{{kcal}} kcal a day, {{weight}}',
    /** A period with a budget but nothing logged. Should not be listed at all. */
    summaryEmpty: 'Nothing logged',
    a11y: '{{title}}, {{meta}}, {{summary}}',

    emptyWeekTitle: 'No weeks to look back on yet',
    emptyWeekBody:
      'A week shows up here once it has finished and you logged at least four of its days.',
    emptyMonthTitle: 'No months to look back on yet',
    emptyMonthBody:
      'A month shows up here once it has finished and you logged at least twelve of its days.',
  },

  /**
   * Lifting a card out of a story.
   *
   * Any card, not just the first one: the sheet shows the picture that will
   * leave the phone, so the copy is about the picture rather than about which
   * card it was.
   */
  share: {
    card: 'Share {{card}}',
    preview: 'The card as it will be sent',
  },

  story: {
    /** The counter beside the title: "2 of 4". */
    step: '{{index}} of {{total}}',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
    share: 'Share',
    missingTitle: 'That review is not here',
    missingBody: 'It may have been a week with too little in it to look back on.',
  },

  /** Step 1, the card that gets shared. */
  card: {
    /** The wordmark at the foot of the card. Not translated: it is a name. */
    brand: 'RiceCal',
    kcalADay: 'kcal a day',
    under: '{{value}} under goal',
    over: '{{value}} over goal',
    onBudget: 'On budget',
    logged: 'LOGGED',
    loggedValue: '{{done}} of {{total}}',
    streak: 'STREAK',
    streakValue_one: '{{count}} day',
    streakValue_other: '{{count}} days',
    /**
     * Short on purpose. "WEIGHT CHANGE" wraps to two lines beside two labels
     * that do not, which pushes one of the three figures out of line with the
     * others. The signed value under it says which way it went.
     */
    weightChange: 'WEIGHT',
    noWeight: '—',
    /**
     * What leaves the app when Share is tapped.
     *
     * A sentence rather than a picture, and it says so plainly: the phone has
     * no copy of the card as an image, so sharing one would mean drawing it
     * twice and hoping the two agreed.
     */
    shareText: '{{period}}: {{kcal}} kcal a day, {{done}} of {{total}} days logged. RiceCal',
  },

  /** Step 2, the food. */
  food: {
    title: 'THE BIGGEST PLATES',
    macros: 'MACROS A DAY',
    grams: '{{value}} g',
    share: '{{value}}% of energy',
  },

  /** Step 3, the calories. */
  calories: {
    average: 'AVERAGE A DAY',
    kcal: 'kcal',
    under: '{{value}} under',
    over: '{{value}} over',
    goalNote: 'Goal {{goal}}. Under it on {{done}} of {{total}} days.',
    noGoal: 'No daily budget was in force then.',
    everyDay: 'EVERY DAY',
    everyWeek: 'EVERY WEEK',
    chart: 'Calories a day, split by carbs, protein and fat',
    /**
     * The weekday is abbreviated by the caller, not spelled out. "THURSDAY,
     * LIGHTEST" is two words too long for half a card and truncated to
     * "THURSDAY, LIGHTE…", which loses the only word that mattered.
     */
    lightest: '{{day}}, LIGHTEST',
    heaviest: '{{day}}, HEAVIEST',
    pastWeeks: 'LAST FIVE WEEKS',
    pastMonths: 'LAST FIVE MONTHS',
    /** A bar for a period nobody logged. The axis label still names it. */
    noData: '—',
  },

  /** Step 4, the body and the movement. */
  body: {
    weight: 'WEIGHT',
    weighIns_one: 'One weigh in',
    weighIns_other: '{{count}} weigh ins',
    weightChart: 'Weight over the period',
    steps: 'STEPS A DAY',
    stepGoal: '{{done}} of {{total}} days over {{goal}} steps',
    stepsChart: 'Steps a day',
    others: 'OTHERS',
    water: 'Water',
    waterValue: '{{value}} cups',
    waterNote_one: 'Full on one day',
    waterNote_other: 'Full on {{count}} days',
    move: 'Active minutes',
    moveNote_one: 'One workout',
    moveNote_other: '{{count}} workouts',
    moveNoteNone: 'No workouts recorded',
    burn: 'Burned a day',
    burnValue: '{{value}} kcal',
    distanceValue: '{{value}} km covered',
  },
} as const
