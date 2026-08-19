export const suggest = {
  /** The offer on Today, under the ring. */
  card: {
    title: 'Not sure what to eat?',
    /** With a budget in force, which is the case this feature is for. */
    withBudget: 'Get {{count}} picks that fit your {{kcal}} kcal left',
    /** Before onboarding has computed one, or on a day already over. */
    plain: 'Get {{count}} ideas for your next meal',
  },

  /** L7 ASK MODAL. Every control opens on an answer, so none of this is a prompt. */
  ask: {
    /**
     * Short, because the title's line now carries two pills as well: the lean
     * and what is left of the day. "What are you after?" truncated to "What are
     * you…" beside them, and a heading with an ellipsis in it is worse than a
     * shorter heading.
     */
    title: 'What next?',
    meal: 'MEAL',
    focus: 'MACROS',
    cuisine: 'CUISINE',
    limit: 'CALORIE LIMIT',
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
    /** "Five for dinner". The count is in the copy because it never varies. */
    title: 'Five for {{meal}}',
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

  /** L10 PICK DETAIL, which is a read. There is no way to log from it. */
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
    /** A suggestion the user has come back to after the picks were cleared. */
    goneTitle: 'That suggestion has gone',
    goneBody: 'Ask again from Today and it will be there.',
  },

  /** The four sittings, as the chips say them. */
  meal: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  },
  /**
   * The same four INSIDE a sentence, which is a different word each time.
   * "Five for Dinner" has a capital in the middle of a heading, and "Five for
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
  /** The same three inside a sentence, where the chip's own word will not fit. */
  focusShort: {
    protein: 'Protein heavy',
    balanced: 'Balanced',
    carbs: 'Carb heavy',
  },
  cuisine: {
    malay: 'Malay',
    mamak: 'Mamak',
    chinese: 'Chinese',
    /** Not a fifth kitchen: the absence of the constraint. */
    others: 'Others',
  },
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
