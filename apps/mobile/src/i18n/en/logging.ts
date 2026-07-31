export const logging = {
  today: {
    title: 'Today',
    kcalLeft: 'KCAL LEFT',
    kcalOver: 'KCAL OVER',
    /**
     * The same ring, tapped: eaten so far against the day's allowance. The big
     * number above it is what has been eaten, so this is the second half of a
     * fraction — a slash rather than the word "of", matching the macro bars.
     */
    kcalOfGoal: '/{{goal}} KCAL',
    showGoals: 'Show the day’s allowance',
    showLeft: 'Show what is left',
    /** Shown when the day is over budget. Never scold. */
    overNote: 'A bit over today, tomorrow is a new count.',
    /**
     * Everything logged today, in one list. It was a heading per meal, and the
     * meals are not headings any more — see `EntryList` for why.
     */
    logHeading: 'EATEN · {{kcal}} KCAL',
    /** A snapped plate whose dish is still being worked out. */
    analysing: 'Reading your plate',
    analysingHint: 'Counting once it knows what this is',
    /**
     * The rotating status line over the scan progress bar. Stages, not facts:
     * the client cannot see where the scan actually is, so these describe the
     * cascade truthfully without claiming to track it.
     */
    scanningRead: 'Reading your plate…',
    scanningMatch: 'Finding it in the catalogue…',
    scanningPortion: 'Sizing up the portion…',
    scanningCount: 'Counting the calories…',
    /** The same bar while a fix-by-typing correction is applied to a row. */
    refiningApply: 'Applying your fix…',
    refiningCount: 'Recounting the calories…',
    /**
     * The notification, posted only when the scan lands while the app is in
     * the background — a plate takes half a minute to read and nobody should
     * have to watch it.
     */
    scanDoneTitle: 'Your plate is counted',
    scanDoneBody: '{{food}} · {{kcal}} kcal',
    scanDoneBodyPlain: 'Tap to see what was on it.',
    /** On the panel behind a row being swiped away, and to a screen reader. */
    deleteEntry: 'Delete',
    /**
     * The photo had nothing edible in it. Nothing was logged — the row is
     * there to say so and to be dismissed, which is why the copy is not an
     * apology and not an error.
     */
    noFoodTitle: 'No food in this photo',
    noFoodHint: 'Nothing was added to your day.',
    noFoodDismiss: 'Dismiss',
    analysisFailedTitle: 'Could not read this one',
    analysisFailedHint: 'Tap to pick the dish yourself',
    emptyTitle: 'Nothing logged yet',
    emptyBody: 'Tap the green button to snap or search your first dish.',
    /** No `daily_goals` row yet — onboarding is what computes the first one. */
    noBudgetTitle: 'No daily budget yet',
    noBudgetBody: 'Set your target and the ring has something to fill.',
    noBudgetAction: 'Set my target',
  },

  selector: {
    title: 'Add to {{meal}}',
    remaining: '{{count}} left',
    snap: 'Snap',
    search: 'Search',
    /**
     * The last few dishes logged at this meal, newest first. No empty-state copy
     * for this or for the repeat button: each block is simply absent when it has
     * nothing in it, rather than saying so.
     */
    recent: 'LAST LOGGED',
    repeatYesterday: 'Repeat yesterday',
  },

  camera: {
    title: 'Snap your plate',
    analysing: 'Working out what is on the plate',
    permissionTitle: 'Camera access needed',
    permissionBody: 'RiceCal uses the camera to read your plate. Nothing leaves your phone.',
    permissionGrant: 'Allow camera',
    shutter: 'Take a photo',
    library: 'Choose from photos',
    flip: 'Flip camera',
    captured: 'The photo you just took',
    /** Alt text on a logged entry's photo. */
    photoOf: 'Photo of {{food}}',
  },

  voice: {
    title: 'Say what you ate',
    hint: 'Try "two roti canai and a teh tarik"',
    listening: 'Listening',
    stop: 'Stop',
  },

  added: {
    toast: 'Added to {{meal}}, {{kcal}} kcal',
    removedToast: 'Removed from {{meal}}',
  },

  search: {
    title: 'Search',
    placeholder: 'Search any dish',
    clear: 'Clear search',
    /** Where a dish is usually eaten. Shown under its name in a result. */
    place: {
      mamak: 'Mamak',
      kopitiam: 'Kopitiam',
      hawker: 'Hawker',
      packaged: 'Packaged',
      home: 'Home cooked',
    },
    emptyTitle: 'No dish by that name',
    emptyBody: 'Try a shorter word, or fewer of them.',
    /**
     * A search that could not run is not a search that found nothing, so these
     * two do not borrow the copy above.
     */
    offlineTitle: 'No connection',
    offlineBody: 'The dish list lives on the server. This will run as soon as you are back online.',
    errorTitle: 'Could not search',
    errorBody: 'Something went wrong looking that up. Try again in a moment.',
  },

  detail: {
    servings: 'Servings',
    /** The number in the stepper doubles as a field for an exact amount. */
    typeServings: 'Type the exact amount',
    total: 'KCAL TOTAL',
    /** The collapsed row that opens fibre, sugar and salt. */
    moreNutrients: 'More nutrients',
    fibre: 'Fibre',
    sugar: 'Sugar',
    sodium: 'Salt (sodium)',
    milligrams: '{{value}}mg',
    /** Under the list, when at least one number is known. */
    nutrientsNote: 'For the portion above. A dash means the dish has no figure recorded.',
    /** And when none of them is. */
    nutrientsUnknown: 'No figures recorded for this dish yet. Its calories and macros are.',
    fixTitle: 'Fix it by typing',
    fixPlaceholder: 'no sambal, and it was half a plate',
    /**
     * The send button inside the field, on a scanned entry only. Icon-only, so
     * this is what a screen reader announces.
     */
    fixSend: 'Send this correction',
    fixApplied: 'Updated from your correction',
    fixNotApplied: 'Could not apply that — try rewording it',
    /** The scanned plate's ingredient breakdown. */
    plateTitle: 'INGREDIENTS',
    plateTotal: 'Total',
    /** How many of an ingredient are on the plate. Absent at one. */
    times: '× {{amount}}',
    /** The per-ingredient portion steppers, and the one that empties a row. */
    lessOf: 'Less {{name}}',
    moreOf: 'More {{name}}',
    removeOf: 'Remove {{name}}',
    /**
     * Typing the numbers in by hand, for the dish the app got close but not
     * right — off a packet, off a recipe, off the kitchen scale.
     */
    numbersTitle: 'THE NUMBERS',
    numbersNote: 'Type over anything the app got wrong. Blank means use the app’s figure.',
    numbersReset: 'Use the app’s figures',
    kcalField: 'Calories',
    carbsField: 'Carbs (g)',
    proteinField: 'Protein (g)',
    fatField: 'Fat (g)',
    /**
     * Stands in for a serving label the catalogue import left unusable — a
     * measurement ("1 medium paper (8-5/8\" dia)") or a code ("383 GRM").
     */
    servingWord: 'serving',
    /** Saving an edit to an entry already in the diary. */
    updated: 'Entry updated',
    quickFix: {
      halfPortion: 'Half portion',
      noSambal: 'No sambal',
      addEgg: 'Add an egg',
      extraRice: 'Extra rice',
    },
    mealLabel: 'MEAL',
    editByHand: 'Edit the details by hand',
    deleteEntry: 'Delete this entry',
    deleteTitle: 'Delete this entry?',
    deleteBody: 'It comes straight out of today and the count goes back up.',
    addToDiary: 'Add to diary',
    decreaseServing: 'One less',
    increaseServing: 'One more',
    /** The hero tile doubles as the way in to the icon picker when editing. */
    choosePicture: 'Choose a picture for this entry',
    /** Inside the empty tile. The only thing in it — see the comment there. */
    addPicture: 'Tap to add a picture',
    /** Covers no camera, a refused permission and a failed upload alike. */
    photoFailed: 'Could not save that photo',
    replacePhoto: 'Replace the photo with a picture',
    /**
     * A row holds a photo or a drawing, never both, so picking one discards the
     * other — and the photo is of the actual plate, which no drawing replaces.
     */
    replacePhotoTitle: 'Replace your photo?',
    replacePhotoBody:
      'This entry keeps a photo or a picture, not both. Your photo of the real plate goes for good.',
    replacePhotoConfirm: 'Pick a picture',
  },

  /**
   * Picking an illustration for one logged item.
   *
   * Needed because the catalogue cannot be illustrated: a few hundred drawings
   * against hundreds of megabytes of imported foods, so most rows have none.
   */
  icon: {
    title: 'Pick a picture',
    /**
     * The two halves of the sheet, as a pair of tiles at the top — the same shape
     * the quick selector uses. There is no "or choose a picture" heading between
     * them any more: with the two visibly exclusive, nothing has to say so.
     */
    searchTab: 'Search',
    cameraTab: 'Camera',
    searchLabel: 'Search pictures',
    searchPlaceholder: 'nasi lemak, teh tarik, fish',
    noMatch: 'Nothing matches “{{query}}”.',
  },

  /**
   * The glasses on Today. Water came back when the diary that used to carry it
   * went — there was nowhere left to record a glass, and `useSetWater` had been
   * writing `daily_logs` for a screen nobody could reach.
   */
  water: {
    title: 'Water',
    /**
     * Filled against the goal. A slash rather than the word "of", the same way the
     * ring and the macro bars write a fraction.
     */
    count: '{{filled}} / {{goal}}',
    /**
     * One glass, to a screen reader. The row is otherwise a run of identical boxes
     * with nothing to tell a user which one they are on.
     */
    glass: 'Glass {{ordinal}} of {{total}}',
  },

  // No `diary` block. The diary screen and its calendar are gone, and this file's
  // rule is that a screen can be deleted without leaving orphans behind in here.
} as const
