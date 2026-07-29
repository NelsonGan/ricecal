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
    emptyTitle: 'Nothing logged yet',
    emptyBody: 'Tap the green button to snap or search your first dish.',
  },

  selector: {
    title: 'Add to {{meal}}',
    remaining: '{{count}} left',
    snap: 'Snap',
    scan: 'Scan',
    say: 'Say',
    search: 'Search',
    usual: 'USUAL AT THIS TIME',
    repeatYesterday: 'Repeat yesterday',
    nothingYesterday: 'Nothing logged yesterday',
  },

  camera: {
    title: 'Snap your plate',
    barcodeTitle: 'Scan a barcode',
    detected: 'Plate detected, hold steady',
    aiming: 'Point at your plate',
    barcodeAiming: 'Line the barcode up in the frame',
    analysing: 'Working out what is on the plate',
    permissionTitle: 'Camera access needed',
    permissionBody: 'RiceCal uses the camera to read your plate. Nothing leaves your phone.',
    permissionGrant: 'Allow camera',
    shutter: 'Take a photo',
    library: 'Choose from photos',
    flip: 'Flip camera',
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
    filters: {
      all: 'All',
      mamak: 'Mamak',
      kopitiam: 'Kopitiam',
      packaged: 'Packaged',
    },
    match: '{{percent}}%',
    /** Where a dish is usually eaten. Shown under its name in a result. */
    place: {
      mamak: 'Mamak',
      kopitiam: 'Kopitiam',
      hawker: 'Hawker',
      packaged: 'Packaged',
      home: 'Home cooked',
    },
    customFood: 'Cannot find it? Add a custom food',
    emptyTitle: 'No dish by that name',
    emptyBody: 'Try a shorter word, or add it as a custom food.',
  },

  detail: {
    servings: 'Servings',
    total: 'KCAL TOTAL',
    fixTitle: 'Fix it by typing',
    fixPlaceholder: 'no sambal, and it was half a plate',
    fixSend: 'Apply correction',
    fixApplied: 'Updated from your note',
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
    addGlass: 'Add a glass of water',
    removeGlass: 'Remove a glass of water',
    emptyDay: 'Nothing logged on this day.',
  },
} as const
