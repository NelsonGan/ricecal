export const logging = {
  today: {
    title: 'Today',
    kcalLeft: 'KCAL LEFT',
    kcalOver: 'KCAL OVER',
    /** Shown when the day is over budget. Never scold. */
    overNote: 'A bit over today, tomorrow is a new count.',
    mealHeading: '{{meal}} · {{kcal}} KCAL',
    mealHeadingEmpty: '{{meal}}',
    addMeal: 'Add {{meal}}',
    justAdded: 'Just added, tap to edit',
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
    say: 'Say',
    search: 'Search',
    usual: 'USUAL AT THIS TIME',
    repeatYesterday: 'Repeat yesterday',
    nothingYesterday: 'Nothing logged yesterday',
  },

  camera: {
    title: 'Snap your plate',
    detected: 'Plate detected, hold steady',
    aiming: 'Point at your plate',
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
  },

  detail: {
    servings: 'Servings',
    total: 'KCAL TOTAL',
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
  },
} as const
