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

  /** The line under each shelf's name. Says what this shelf IS. */
  blurb: {
    official: 'Cooked and weighed in our kitchen. Save a copy to change it.',
    community: 'Cooked something good? Share yours as public and it shows up here.',
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
    describing: 'Reading what you wrote…',
    describeFailed: 'We could not read that one. Fill it in yourself below.',
    described: 'Filled in from what you wrote. Change anything that looks off.',
    scanning: 'Reading your photo…',
    scanned: 'Filled in from your photo. Change anything that looks off.',
    scanFailed: 'We could not read that one. Fill it in yourself below.',
  },

  edit: {
    title: 'Edit recipe',
    name: 'NAME',
    namePlaceholder: 'What do you call it?',
    photo: 'PHOTO',
    addPhoto: 'Add',
    servings: 'HOW MANY SERVINGS',
    ingredients: 'INGREDIENTS',
    ingredientsCount: 'INGREDIENTS · {{count}}',
    ingredientsEmpty: 'Nothing yet. Search each item and we add up the pot for you.',
    addIngredient: 'Add an ingredient',
    steps: 'HOW YOU COOK IT',
    stepsPlaceholder: 'Write the steps however you like. Free text, no need to number them.',
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
    empty: 'No recipes yet. Add one and logging it is a tap.',
  },
} as const
