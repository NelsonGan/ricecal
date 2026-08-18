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

  /**
   * A volume, in the unit `volume()` in `lib/water.ts` picked for it.
   *
   * Two keys rather than one with the unit interpolated, because the space
   * before a unit is not the same in every language this may one day carry and
   * a caller assembling "{{value}} {{unit}}" cannot be corrected per language.
   */
  volume: {
    ml: '{{value}} ml',
    l: '{{value}} L',
    /** The unit on its own, for a tile that prints the figure in its own type. */
    mlUnit: 'ml',
    lUnit: 'L',
  },

  /** Reused counts. i18next picks _one/_other from `count`. */
  count: {
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

  /**
   * Shown where the app has nothing saved to fall back on and cannot ask for
   * it. Written as a wait rather than a failure: requests resume by themselves
   * the moment there is a connection, so there is nothing for the user to do
   * and no retry to offer.
   */
  offline: {
    title: 'Waiting for a connection',
    body: 'We have not saved this one to your phone yet. It will load as soon as you are online.',
    dayTitle: 'This day is not on your phone',
    dayBody: 'Pick a day you have opened before, or come back when you are online.',
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
