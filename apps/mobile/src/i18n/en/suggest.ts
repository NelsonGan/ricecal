export const suggest = {
  /**
   * The offer on Today: a thin row under the week strip. The words are on
   * screen now rather than only in the accessibility tree, which is what a
   * glyph in the log sheet could never manage — nobody discovers a feature from
   * an icon two taps inside another screen.
   */
  card: {
    title: 'Not sure what to eat?',
  },

  /** L7 ASK MODAL. Every control opens on an answer, so none of this is a prompt. */
  ask: {
    title: 'What are you after?',
    meal: 'MEAL',
    focus: 'MACROS',
    cuisine: 'CUISINE',
    limit: 'CALORIE LIMIT',
    /**
     * The cuisine list is the user's own. The pencil says what it opens rather
     * than saying "Edit", which is what three buttons on the food detail screen
     * were saying before their labels were made specific.
     */
    editCuisines: 'Edit the cuisines',
    addCuisine: 'Add a cuisine',
    addCuisinePlaceholder: 'Thai, Nyonya, Japanese',
    removeCuisine: 'Remove {{cuisine}}',
    kcal: 'kcal',
    less: 'Fewer calories',
    more: 'More calories',
    /** Beside the heading, so it is short: the sheet is only about today. */
    leftToday: '{{kcal}} left',
    /**
     * The lean, as a two-state pill on the title's line. Named for what the
     * suggestions WILL be rather than for what the switch does, so the word on
     * screen is always true of the answer.
     */
    healthy: 'Lighter',
    anything: 'Anything',
    healthyA11y: 'Lean towards lighter dishes',
    action: 'Suggest something',
  },

  /** L8 THINKING and L9 PICKS SHEET, which are one sheet in two states. */
  picks: {
    /**
     * "Ideas for dinner". It used to name the count — "Five for dinner" — on
     * the reasoning that the count never varies. It varied: the list went to
     * seven, and a heading that counts is a heading that lies whenever a pick is
     * dropped for having nothing to say for itself.
     */
    title: 'Ideas for {{meal}}',
    thinking: 'Looking for something for {{meal}}',
    thinkingA11y: 'Working out what to suggest',
    /** The three constraints, in the order they were set. */
    summary: '{{focus}}, {{cuisine}}, under {{kcal}} kcal',
    protein: '{{grams}}g protein',
    retry: 'Try again',
    /**
     * The model would not answer. Said as what happened rather than as an
     * error, because nothing is broken and the button is right there.
     */
    emptyTitle: 'Nothing came to mind',
    emptyBody: 'Ask again, or loosen one of the answers.',
  },

  /** L10 PICK DETAIL, inside the picks sheet. It is a read: there is no way to log from it. */
  detail: {
    /** "420 KCAL, ONE BOWL" — the figure and what it is a figure for. */
    unit: 'KCAL, {{portion}}',
    /** The badge beside it: what the day would have left if they ate this. */
    leftAfter: '{{kcal}} kcal left after',
    /** And the other side of it, said kindly. */
    overAfter: '{{kcal}} kcal over after',
    why: 'WHY THIS FITS',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    sodium: 'Sodium',
    // No "that suggestion has gone". It was for a pick reached by a route, on a
    // day the picks behind it had been cleared; a pick is a body inside the
    // sheet that holds them now, so an index with nothing at it shows the list.
  },

  /** The four sittings, as the dropdown says them. */
  meal: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  },
  /**
   * The same four INSIDE a sentence, which is a different word each time.
   * "Ideas for Dinner" has a capital in the middle of a heading, and "Ideas for
   * Snacks" is not what anybody says. Two blocks rather than one is the cost of
   * copy that reads properly in both places.
   */
  mealFor: {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'a snack',
  },
  focus: {
    protein: 'Protein',
    balanced: 'Balanced',
    carbs: 'Carbs',
  },
  /** The same three inside a sentence, where the dropdown's own word will not fit. */
  focusShort: {
    protein: 'Protein heavy',
    balanced: 'Balanced',
    carbs: 'Carb heavy',
  },
  // No `cuisine` block. The kitchens are a list the user edits and keeps on
  // their own phone, so a cuisine is a word this repo has never seen — it goes
  // on screen as it was typed, and there is nothing here to translate it
  // against. The defaults a new account starts with are in
  // `features/suggest/ask.ts`.

  /** How salty, in the three words the model can honestly answer. */
  sodium: {
    low: 'low',
    medium: 'medium',
    high: 'high',
  },

  /**
   * The picks landed while the sheet was closed. Offered rather than forced:
   * a panel that rises on its own after a screen was dismissed is the app
   * taking the screen back, and the scan has already been spent either way.
   */
  ready_one: '{{count}} idea is ready',
  ready_other: '{{count}} ideas are ready',
  readyAction: 'See them',

  /** The request did not arrive. Not a refusal, which says its own thing. */
  failed: 'Could not fetch any suggestions. Try again in a moment.',
} as const
