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
    diary: 'Diary',
    trends: 'Trends',
    me: 'Me',
    /** The raised centre button. */
    log: 'Log food',
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
    kg: 'kg',
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

  a11y: {
    back: 'Go back',
    close: 'Close',
    more: 'More options',
    decrease: 'Decrease',
    increase: 'Increase',
  },
} as const
