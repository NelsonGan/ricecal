/**
 * Copy shared by more than one feature. Anything used on a single screen
 * belongs in that feature's file instead, so a screen can be deleted without
 * leaving orphans here.
 */
export const common = {
  action: {
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save changes',
    done: 'Done',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    undo: 'Undo',
    skip: 'Skip',
    retry: 'Try again',
    close: 'Close',
  },

  nav: {
    today: 'Today',
    recipes: 'Recipes',
    activity: 'Activity',
    trends: 'Trends',
    me: 'Me',
    /** The floating button on Today. Not a tab — it opens the log sheet. */
    log: 'Log food',
  },

  /**
   * Named days, for lists that mix recent and not-so-recent rows.
   *
   * Only the two everybody thinks of by name. Anything older is a weekday or a
   * date, decided by the list — "3 days ago" is a phrase people have to convert.
   */
  date: {
    today: 'Today',
    yesterday: 'Yesterday',
  },

  meal: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
  },

  macro: {
    carbs: 'Carbs',
    protein: 'Protein',
    fat: 'Fat',
  },

  unit: {
    kcal: 'kcal',
    kcalUpper: 'KCAL',
    grams: '{{value}}g',
    /** Eaten against the day's allowance, on a macro bar that has been toggled. */
    gramsOfGoal: '{{value}}/{{goal}}g',
    kg: 'kg',
    lb: 'lb',
    cm: 'cm',
    /** Screen-reader expansion. "182 g" reads better than "182g". */
    gramsLong: '{{value}} grams',
  },

  /** Reused counts. i18next picks _one/_other from `count`. */
  count: {
    glasses_one: '{{count}} glass',
    glasses_other: '{{count}} glasses',
    dayStreak_one: '{{count}} day streak',
    dayStreak_other: '{{count}} day streak',
    times_one: '{{count}} time',
    times_other: '{{count}} times',
  },

  notFound: {
    title: 'That screen has moved',
    body: 'The link you followed does not point anywhere in this version of the app.',
    action: 'Go to Today',
  },

  a11y: {
    back: 'Go back',
    close: 'Close',
    more: 'More options',
    decrease: 'Decrease',
    increase: 'Increase',
    /** The onboarding progress bar, which shows its position without words. */
    step: 'Step {{current}} of {{total}}',
    /** The app's own number pad. Its digits read as themselves; these two do not. */
    backspace: 'Delete the last digit',
    decimalPoint: 'Decimal point',
  },
} as const
