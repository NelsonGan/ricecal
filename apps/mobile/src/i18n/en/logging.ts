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
    mealHeading: '{{meal}} · {{kcal}} KCAL',
    mealHeadingEmpty: '{{meal}}',
    addMeal: 'Add {{meal}}',
    /** A snapped plate whose dish is still being worked out. */
    analysing: 'Reading your plate',
    analysingHint: 'Counting once it knows what this is',
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
    fixSend: 'Apply correction',
    fixApplied: 'Updated from your note',
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
    /** The camera, offered above the grid as the other way to answer this. */
    takePhoto: 'Take a photo',
    orChoose: 'OR CHOOSE A PICTURE',
    searchLabel: 'Search pictures',
    searchPlaceholder: 'nasi lemak, teh tarik, fish',
    noMatch: 'Nothing matches “{{query}}”.',
  },

  diary: {
    title: 'Diary',
    eaten: 'EATEN',
    left: 'LEFT',
    over: 'OVER',
    water: 'WATER · {{done}} OF {{total}} GLASSES',
    glassOf: 'Glass {{ordinal}} of {{total}}',
    addGlass: 'Add a glass of water',
    removeGlass: 'Remove a glass of water',
    emptyDay: 'Nothing logged on this day.',
    /** The month and year steppers on the calendar levels. */
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    previousYear: 'Previous year',
    nextYear: 'Next year',
  },
} as const
