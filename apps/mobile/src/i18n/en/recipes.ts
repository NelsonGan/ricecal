/**
 * Home cooking: the three shelves, the form, and the community gate.
 *
 * Dish names are NOT here and never will be — "rendang daging" is what the cook
 * typed, in whatever language they typed it, and it is data. Nothing in this
 * file names a food.
 */
export const recipes = {
  shelf: {
    mine: 'Mine',
    official: 'Official',
    community: 'Community',
  },

  heading: {
    mine: 'My recipes',
    official: 'RiceCal kitchen',
    community: 'From the community',
  },

  search: {
    official: 'Search official recipes',
    community: 'Search public recipes',
    mine: 'Search my recipes',
    clear: 'Clear search',
    none: 'Nothing by that name',
    noneBody: 'Try a shorter word, or part of the dish name.',
  },

  empty: {
    mineTitle: 'No recipes yet',
    mineBody:
      'A shared pot has no serving size. Enter what went in and how many it feeds, once, and logging it is one tap from then on.',
    officialTitle: 'The kitchen is empty',
    officialBody: 'Recipes from us will show up here.',
    communityTitle: 'Nothing shared yet',
    communityBody: 'Recipes people have made public will show up here.',
  },

  /** The count under a recipe's name in a list. */
  servings_one: '{{count}} serving',
  servings_other: '{{count}} servings',
  ingredients_one: '{{count}} ingredient',
  ingredients_other: '{{count}} ingredients',
  savedTimes_one: 'saved {{count}} time',
  savedTimes_other: 'saved {{count}} times',
  byAuthor: '{{name}} · {{saves}}',
  fromAuthor: 'From {{name}}',
  /**
   * Whoever cooked it, when the credit is missing — a profile with no display
   * name, or one deleted since. A word, not a dash: "— · saved 3 times" reads
   * as a rendering fault rather than as an answer.
   */
  someCook: 'Someone',

  new: {
    title: 'New recipe',
    /**
     * The two tiles at the top of a new recipe. One word each: at half the
     * screen a sentence wraps to three lines, and the sheet each one opens
     * explains itself better than a caption under an icon could.
     */
    scanLabel: 'Photo',
    describeLabel: 'Describe',
    scanTitle: 'Fill it in from a photo',
    /** The rule above the hand-filled fields, under the two offers. */
    or: 'OR FILL IT IN YOURSELF',
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
    name: 'NAME',
    namePlaceholder: 'What do you call it?',
    picture: 'PICTURE',
    changePicture: 'Change the picture',
    /**
     * The one choice in this form that throws something away: a drawing over a
     * photograph of the real pot.
     */
    replacePhotoTitle: 'Use a drawing instead?',
    replacePhotoBody: 'The photo of this recipe will be removed.',
    replacePhotoConfirm: 'Use the drawing',
    servings: 'HOW MANY SERVINGS',
    ingredients: 'INGREDIENTS',
    ingredientsCount: 'INGREDIENTS · {{count}}',
    ingredientsEmpty: 'Nothing yet. Search each item and we add up the pot for you.',
    addIngredient: 'Add an ingredient',
    steps: 'HOW YOU COOK IT',
    /**
     * The one thing worth saying about this field is what the RETURN key does,
     * because the numbering is added where the steps are drawn and nowhere in
     * the text. Without it people number the lines themselves and end up with
     * "1. 1. Fry the rempah".
     */
    stepsPlaceholder: 'One step on each line. Start a new line and we number it for you.',
    /** Under the field, since a placeholder disappears the moment they type. */
    stepsHint: 'Each new line becomes the next numbered step.',
    stepsSheetTitle: 'How you cook it',
    stepsEditAction: 'Edit the steps',
    /** Read out in place of the list itself, which a screen reader would spell. */
    stepsEdit_one: 'Edit the steps, {{count}} step',
    stepsEdit_other: 'Edit the steps, {{count}} steps',
    stepsWrite: 'Write how you cook it',
    save: 'Save recipe',
    saved: 'Recipe saved',
    nameRequired: 'Give it a name first',
    saveFailed: 'Could not save that. Try again.',
    /** The totals card under the ingredient list. */
    totalLabel: 'Per serving, {{count}}',
    totalWhole: 'Whole pot {{kcal}} kcal',
    discardTitle: 'Leave without saving?',
    discardBody: 'The changes you made here will be lost.',
    discardConfirm: 'Discard',
  },

  ingredient: {
    title: 'Add ingredient',
    search: 'Search for an ingredient',
    ownTitle: 'Add your own ingredient',
    ownBody: 'Not in the list? Give it a name and its calories.',
    customBody: 'For the things only your kitchen has. Read it off the packet or weigh it once.',
    name: 'NAME',
    namePlaceholder: 'What is it?',
    calories: 'CALORIES',
    macros: 'MACROS, IF YOU KNOW THEM',
    amount: 'HOW MUCH WENT IN',
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
  },

  detail: {
    servingLabel: 'serving',
    portion: {
      half: 'Half',
      one: '1 serving',
      two: '2 servings',
      pot: 'Whole pot',
    },
    ofServings: '{{count}} OF {{total}} SERVINGS',
    steps: 'HOW I COOK IT',
    stepsFrom: 'HOW {{name}} COOKS IT',
    noSteps: 'No steps written down.',
    ingredients: 'INGREDIENTS',
    addToDay: 'Add to today',
    added: 'Added to your day',
    saveCopy: 'Save to my recipes',
    savedCopy: 'Saved to your recipes',
    saveCopyFailed: 'Could not save that one. Try again.',
    goneTitle: 'Recipe not found',
    goneBody:
      'It may have been deleted, or made private again. Ask whoever shared it for a fresh link.',
    official: 'From the RiceCal kitchen',
    delete: 'Delete recipe',
    deleteTitle: 'Delete this recipe?',
    deleteBody: 'Meals you have already logged from it stay in your diary.',
    deleted: 'Recipe deleted',
  },

  share: {
    action: 'Share',
    title: 'Share this recipe',
    body: 'Anyone with the link can see the ingredients, the steps and the calories, and save their own copy. Yours stays yours.',
    /** The toggle at the foot of the share sheet. */
    publicTitle: 'Make it public',
    publicBody: 'It joins the community tab for anyone to find and save.',
    publishFailed: 'Could not change that. Try again.',
  },

  /**
   * What the review said. Three outcomes and they are deliberately distinct:
   * `pending` is not a soft rejection, it is nobody having read it yet.
   */
  review: {
    checking: 'Checking your recipe…',
    approved: 'Your recipe is in the community',
    rejected: 'Not published: {{reason}}',
    rejectedPlain: 'We could not publish this one.',
    pending: 'We are still looking at this one. It will show up once it passes.',
    /** The badge on the owner's own list. */
    badgePending: 'In review',
    badgeRejected: 'Not published',
    badgePublic: 'Public',
  },

  /** The fourth option on the log sheet. */
  log: {
    action: 'Recipes',
    seeAll: 'All recipes',
    /**
     * Nothing on this shelf, said per shelf. "No recipes yet" is true of your
     * own and wrong about the other two, where the answer is that nobody has
     * put anything there rather than that you have not.
     */
    empty: {
      mine: 'No recipes yet. Add one and logging it is a tap.',
      official: 'Nothing in the kitchen yet.',
      community: 'Nothing shared yet. Recipes people make public show up here.',
    },
  },
} as const
