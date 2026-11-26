/**
 * Home cooking: the Recipes tab, the form, cook mode and the community gate.
 *
 * The word on screen is "recipe" again. It was "food" while these lived behind
 * a row in Settings, because half of what people wrote down was a sandwich; a
 * tab of its own, with times, meal tags and a cook mode, is a recipe box, and
 * the people opening it cook.
 *
 * Dish names are NOT here and never will be — "rendang daging" is what the cook
 * typed, in whatever language they typed it, and it is data. Nothing in this
 * file names a food.
 */
export const recipes = {
  /** The tab's name, in the nav bar and over the shelf. */
  title: 'Recipes',

  shelf: {
    mine: 'Mine',
    community: 'Community',
  },

  /** Meal tags. Keys of `recipes.tags`; the database refuses any other. */
  tag: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    dessert: 'Dessert',
    drink: 'Drink',
  },

  /** The four ways in, in the sheet behind the tab's plus. One word each. */
  add: {
    title: 'Add a recipe',
    write: 'Write it',
    photo: 'Photo',
    describe: 'Describe',
    video: 'Video',
    quota: '{{used}} of {{count}} free',
  },

  /**
   * The apps a recipe can be imported from. Their own names, which only change
   * where the app is known by another one (小红书 in Chinese).
   */
  platform: {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    x: 'X',
    threads: 'Threads',
    facebook: 'Facebook',
    rednote: 'Rednote',
  },

  /**
   * Importing a recipe from a cooking video: the paste sheet, the screen that
   * waits for it, and the ways it fails. The waiting screen is up to forty
   * seconds, so its line says the user may leave; every failure says what to
   * do next in one sentence.
   */
  import: {
    title: 'Import from a video',
    /** Free accounts only, in the sheet's title row. */
    left_one: '{{count}} left this month',
    left_other: '{{count}} left this month',
    placeholder: 'Paste a video link',
    paste: 'Paste',
    unsupported: 'That is not a link to a post we can read.',
    worksWith: 'Works with',
    action: 'Import recipe',
    screenTitle: 'Making your recipe',
    step: {
      watch: 'Watching the video',
      write: 'Writing the recipe',
      count: 'Working out the calories',
    },
    leave: 'You can leave this screen. The recipe will be in Mine.',
    done: 'Saved to your recipes',
    doneCommunity: 'Saved, and shared to Community',
    doneExisting: 'You already have this one',
    readyAway: 'Your recipe from the video is ready',
    /** The toast's action when the recipe arrives after the user left. */
    open: 'Open',
    tryAgain: 'Try again',
    otherLink: 'Use another link',
    seePro: 'See Pro',
    /** The row on a recipe that came from a video. */
    watch: 'Watch on {{platform}}',
    failure: {
      not_recipe: {
        title: 'Not a recipe',
        body: 'This video does not show a dish being made. Try one that does.',
      },
      unreadable: {
        title: 'Could not open that post',
        body: 'It may be private or deleted. Copy the link again and retry.',
      },
      unsupported_link: {
        title: 'Not a video link',
        body: 'Paste a link to a post on Instagram, TikTok, YouTube, X, Threads, Facebook or Rednote.',
      },
      failed: {
        title: 'Something went wrong',
        body: 'The recipe could not be made this time.',
      },
      busy: {
        title: 'Too many videos at once',
        body: 'Give it an hour, then try this one again.',
      },
      offline: {
        title: 'You are offline',
        body: 'It tries again once you are back online.',
      },
      /** Pro's ceiling, which is never printed elsewhere: no paywall, nothing to buy. */
      proLimit: {
        title: 'That is a lot of recipes',
        body: 'You have imported the most videos one account can this month. More next month.',
      },
      too_long: {
        title: 'Video too long',
        body: 'Only videos up to 3 minutes can be imported.',
      },
      limit: {
        title: 'No imports left this month',
        body_one: 'A free account imports {{count}} video a month. Pro has no limit.',
        body_other: 'A free account imports {{count}} videos a month. Pro has no limit.',
      },
    },
  },

  card: {
    /** The plus on a card: one serving into today. */
    log: 'Add {{name}} to today',
    logged: '{{name}} added to your day',
    favourite: 'Favourite',
    unfavourite: 'Remove from favourites',
  },

  search: {
    community: 'Search shared recipes',
    mine: 'Search my recipes',
    clear: 'Clear search',
    none: 'Nothing by that name',
    noneBody: 'Try a shorter word, or part of the dish name.',
  },

  empty: {
    mineTitle: 'No recipes yet',
    mineBody: 'Save the dishes you cook often to log them in one tap.',
    communityTitle: 'Nothing shared yet',
    communityBody: 'Share one of yours from its menu.',
  },

  /** The count under a food's name in a list. */
  servings_one: '{{count}} serving',
  servings_other: '{{count}} servings',
  fromAuthor: 'From {{name}}',
  /**
   * Whoever cooked it, when the credit is missing — a profile with no display
   * name, or one deleted since. A word, not a dash: "— · saved 3 times" reads
   * as a rendering fault rather than as an answer.
   */
  someCook: 'Someone',

  new: {
    title: 'New recipe',
    scanTitle: 'Fill it in from a photo',
    describeTitle: 'Describe it',
    // A worked example, and short enough to read at a glance: the long version
    // wrapped to three lines and turned the field into a wall of grey.
    describePlaceholder: 'Kari ayam. 600g chicken thigh, a tin of santan, 3 potatoes. Feeds 4.',
    describeHint: 'Amounts and how many it feeds are the two worth typing.',
    describeAction: 'Fill in the form',
    describeFailed: 'We could not read that one. Fill it in yourself below.',
    scanFailed: 'We could not read that one. Fill it in yourself below.',

    /**
     * The wait while the pot is being read, as stages rather than one line.
     * The form is not editable for these few seconds, so the copy has to say
     * what is happening rather than merely that something is.
     */
    readingPhoto: 'Reading your photo…',
    readingText: 'Reading what you wrote…',
    readingIngredients: 'Working out what went in…',
    readingPortions: 'Sizing the portions…',
    readingSteps: 'Writing the steps…',
    readingHint: 'Hang on a moment. You can change anything once it lands.',
  },

  edit: {
    title: 'Edit recipe',
    name: 'Name',
    namePlaceholder: 'What do you call it?',
    changePicture: 'Change the picture',
    /**
     * The one choice in this form that throws something away: a drawing over a
     * photograph of the real pot.
     */
    replacePhotoTitle: 'Use a drawing instead?',
    replacePhotoBody: 'The photo of this recipe will be removed.',
    replacePhotoConfirm: 'Use the drawing',
    /**
     * The three short tiles under the name. The long names are what the number
     * pad and a screen reader say; the short ones are drawn.
     */
    servingsRow: 'Servings',
    serves: 'Serves',
    prep: 'Prep time',
    cook: 'Cook time',
    prepShort: 'Prep',
    cookShort: 'Cook',
    /** Beside the minutes field. */
    minutes: 'min',
    meal: 'Meal',
    source: 'Source',
    sourcePlaceholder: 'Link to the reel or post',
    sourceInvalid: 'That link does not look right',
    /** Over the save button. */
    perServing: '{{kcal}} kcal per serving, serves {{count}}',
    ingredients: 'Ingredients',
    addIngredient: 'Add an ingredient',
    steps: 'Steps',
    stepsSheetTitle: 'How you cook it',
    /** Beside the Steps heading, and under the first three steps for the rest. */
    stepsCount_one: '{{count}} step',
    stepsCount_other: '{{count}} steps',
    stepsMore_one: '{{count}} more step',
    stepsMore_other: '{{count}} more steps',
    /** Read out in place of the list itself, which a screen reader would spell. */
    stepsEdit_one: 'Edit the steps, {{count}} step',
    stepsEdit_other: 'Edit the steps, {{count}} steps',
    stepsWrite: 'Add cooking instructions',
    stepLabel: 'Step {{count}}',
    stepPlaceholder: 'What happens in this step?',
    addStep: 'Add step',
    removeStep: 'Remove step {{count}}',
    save: 'Save recipe',
    saved: 'Recipe saved',
    nameRequired: 'Give it a name first',
    saveFailed: 'Could not save that. Try again.',
    /**
     * The free tier's ceiling, met at the write. The plus button on the shelf
     * normally catches this first, so the sentence has to work for the case
     * where it did not: a food saved on another phone since this count was
     * read, or a subscription that lapsed with the form already open. It names
     * the number rather than saying "limit reached", because a ceiling somebody
     * has just met is a ceiling they want to know the size of.
     */
    limitReached: 'A free account keeps {{count}} recipes of its own. Pro has no limit.',
    discardTitle: 'Leave without saving?',
    discardBody: 'The changes you made here will be lost.',
    discardConfirm: 'Discard',
  },

  ingredient: {
    title: 'Add ingredient',
    search: 'Search for an ingredient',
    ownTitle: 'Add your own ingredient',
    ownBody: 'Not in the list? Give it a name and its calories.',
    name: 'NAME',
    namePlaceholder: 'What is it?',
    calories: 'CALORIES',
    amount: 'PORTION',
    add: 'Add to the pot',
    remove: 'Remove',
    /**
     * The row itself, read out. The amount is in it because that is what
     * tapping changes, and it is the number an autofilled pot most often has
     * wrong.
     */
    change: 'Change how much {{name}}, currently {{measure}}',
    /**
     * The three units an amount can be counted in. Data-ish, but chosen from a
     * menu — and only one of them has a plural, because "1 g" is already right
     * and "1 pieces" is not. Every call site passes `count`; the two that do
     * not pluralise ignore it.
     */
    unit: {
      g: 'g',
      ml: 'ml',
      piece_one: 'piece',
      piece_other: 'pieces',
    },
    /** The sheet the unit beside an amount opens, and that unit read out. */
    unitTitle: 'Measure in',
    changeUnit: 'Unit for {{name}}, {{unit}}',
    /** The rows of the unit picker, by what each measures. Short: they sit beside chips. */
    unitGroup: {
      weight: 'Weight',
      volume: 'Volume',
      count: 'Count',
    },
  },

  detail: {
    portion: {
      pot: 'Whole pot',
    },
    ofServings: '{{count}} OF {{total}} SERVINGS',
    /** The strip under the title. */
    prep: 'Prep',
    cook: 'Cook',
    perServing: 'per serving',
    tabIngredients: 'Ingredients',
    tabMethod: 'Method',
    /** Read before the switch between a recipe's translation and its English. */
    language: 'Recipe language',
    /** The scaler over the ingredient list. Changes the amounts, not the log. */
    cookingFor: 'Cooking for',
    /** An ingredient row read out, ticked or not. */
    tick: 'Tick off {{name}}',
    source: 'Source',
    /** Half the footer's width, beside "Add to today", so one short word. */
    startCooking: 'Cook',
    /** The sheet "Add to today" opens: how much of the pot was eaten. */
    logTitle: 'How much did you have?',
    steps: 'HOW I COOK IT',
    stepsFrom: 'HOW {{name}} COOKS IT',
    noSteps: 'No steps written down.',
    noIngredients: 'No ingredients written down.',
    addToDay: 'Add to today',
    saveCopy: 'Save to my recipes',
    savedCopy: 'Saved to your recipes',
    saveCopyFailed: 'Could not save that one. Try again.',
    goneTitle: 'Recipe not found',
    goneBody:
      'It may have been deleted, or made private again. Ask whoever shared it for a fresh link.',
    delete: 'Delete recipe',
    deleteTitle: 'Delete this recipe?',
    deleteBody: 'Meals you have already logged from it stay in your diary.',
    deleted: 'Recipe deleted',
  },

  /**
   * Reporting somebody else's food, and hiding the cook who wrote it.
   *
   * App Review guideline 1.2 requires both of a community shelf, and the writing
   * must not read as an accusation form: nobody is asked to justify anything,
   * there is no free-text box, and each button says what it does about the one
   * food in front of the reader. That three reports take a food off the shelf
   * for everyone is deliberately not promised here, because the reader cannot
   * know whether anyone else will report it.
   *
   * The four reasons are `report_reason` in `schemas/01_enums.sql`, in its order.
   */
  report: {
    title: 'Report this recipe',
    body: 'It stops showing up for you straight away. The cook is not told.',
    inappropriate: 'Offensive or not food',
    spam: 'Spam or advertising',
    dangerous: 'Unsafe to cook or eat',
    stolen: "Somebody else's work",
    /** The cook's own name, or "Someone" when there is none. */
    block: 'Hide everything by {{name}}',
    done: 'Reported. You will not see it again.',
    blocked: 'Hidden. You will not see their recipes again.',
    failed: 'Could not do that. Try again.',
  },

  share: {
    action: 'Share',
    title: 'Share this recipe',
    body: 'Anyone with the link can see the ingredients, the steps and the calories, and save their own copy. Yours stays yours.',
    /** The toggle at the foot of the share sheet. */
    publicTitle: 'Make it public',
    publicBody: 'It joins the community tab for anyone to find and save.',
    publishFailed: 'Could not change that. Try again.',
    published: 'Your recipe is in the community',
  },

  /**
   * Cook mode: one step at a time, large, with the screen kept awake. The
   * phone is propped against the tiles and read from a step away.
   */
  cook: {
    step: 'STEP {{count}} OF {{total}}',
    next: 'Next step',
    back: 'Back',
    done: 'Done',
    /** The ingredients a step names, under it. */
    youNeed: 'You need',
    ingredients: 'Ingredients',
    close: 'Stop cooking',
    noSteps: 'No steps written down yet. Add them from the recipe menu.',
    finishedTitle: 'Enjoy your meal',
    finishedBody: 'Add a serving to your day?',
    finishedSkip: 'Not now',
  },
} as const
