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
     * The same, for a day reached through the week strip. "Tomorrow is a new
     * count" is a kindness about a day that is still running; said about last
     * Tuesday it is just wrong, and the tomorrow it promises has been and gone.
     */
    overNoteOn: 'A bit over that day.',
    /**
     * Under the ring when a health store credited movement.
     *
     * Present so the goal reading higher than the one in Settings is explained
     * where it is noticed. "+360 from moving" and not "360 burned": the plus
     * sign is the whole message, and this feature's one invariant is that
     * movement adds.
     */
    burnedNote: '+{{kcal}} from moving today',
    /** The same line about a day the strip went back to. */
    burnedNoteOn: '+{{kcal}} from moving that day',
    /**
     * Everything logged today, in one list. It was a heading per meal, and the
     * meals are not headings any more — see `EntryList` for why.
     */
    logHeading: 'EATEN · {{kcal}} KCAL',
    /** A snapped plate whose dish is still being worked out. */
    analysing: 'Reading your plate',
    analysingHint: 'Counting once it knows what this is',
    /**
     * The same row for a meal that was TYPED rather than photographed. It says
     * "reading" too, because the same cascade is doing the same work — but
     * there is no plate on screen to read, so the words are what the row shows
     * while it waits, and the title has to name that instead.
     */
    describing: 'Reading what you wrote',
    describingRead: 'Reading what you wrote…',
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
    /** The same banner for a meal that was typed: there was no plate. */
    describeDoneTitle: 'Your meal is counted',
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
    /** The same outcome for a typed meal: the words named nothing edible. */
    noFoodTypedTitle: 'No food in what you wrote',
    noFoodHint: 'Nothing was added to your day.',
    noFoodDismiss: 'Dismiss',
    analysisFailedTitle: 'Could not read this one',
    analysisFailedHint: 'Tap to pick the dish yourself',
    // No `emptyTitle` / `emptyBody`. A day before its first meal is the state
    // this screen is in every morning, and a card announcing it pushed the ring
    // and the water tracker apart to say what the empty list already said.

    /** No `daily_goals` row yet — onboarding is what computes the first one. */
    noBudgetTitle: 'No daily budget yet',
    noBudgetBody: 'Set your target and the ring has something to fill.',
    noBudgetAction: 'Set my target',
  },

  /**
   * The week strip above the ring.
   *
   * All of it is for a screen reader. The cell itself is two glyphs and a dot,
   * which is legible at a glance and says nothing at all read aloud — "M 21"
   * is not a date and a coloured circle is not a word.
   */
  week: {
    a11y: {
      plain: '{{day}}',
      /** A day that has not happened. It cannot be selected, and says why. */
      ahead: '{{day}}, still to come',
      under: '{{day}}, under goal',
      /** Never "over budget" and never a failure — the ring below is kinder than that. */
      over: '{{day}}, over goal',
      missed: '{{day}}, nothing logged',
    },
  },

  selector: {
    title: 'Log a dish',
    remaining: '{{count}} left',
    snap: 'Snap',
    describe: 'Describe',
    search: 'Search',
    /**
     * The last few dishes logged at this meal, newest first. No empty-state copy
     * for this or for the repeat button: each block is simply absent when it has
     * nothing in it, rather than saying so.
     */
    recent: 'LAST LOGGED',
    repeatYesterday: 'Repeat yesterday',
  },

  /**
   * Typing the meal instead of photographing it. The example in the placeholder
   * is doing real work, and it is the only instruction there is: it tells the
   * user that a whole meal with its sides belongs in ONE box, which is not
   * obvious from an empty field. A hint line under the field used to say the
   * same thing in the abstract, which is the shape of copy people skip.
   */
  describe: {
    placeholder: 'Nasi lemak with fried chicken and a teh tarik',
    send: 'Log this meal',
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
    toast: 'Added, {{kcal}} kcal',
    removedToast: 'Removed from today',
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
     * The sparkle button in the footer, and the sheet's own submit. The same
     * two words twice on purpose: the sheet is that button's second half, not a
     * new question, and "Send this correction" invited the user to wonder what
     * else they might have been sending.
     */
    fixAction: 'Fix it',
    fixNotApplied: 'Could not apply that. Try rewording it',
    /** The scanned plate's ingredient breakdown. */
    plateTitle: 'INGREDIENTS',
    plateTotal: 'Total',
    /**
     * How many of an ingredient are on the plate. Shown at one as well: a
     * count that appears only above one reads as a badge on the busy rows
     * rather than as the amount every row has.
     */
    times: '× {{amount}}',
    /**
     * The same count with the weight the scan gave it: "× 6 · 150 g".
     *
     * The count alone says how many, which is only half an amount — six of a
     * thing whose size nobody stated. The weight is the half a person can check
     * against the plate in front of them, and it is what the stepper beside it
     * is actually moving.
     */
    timesWeight: '× {{amount}} · {{grams}} g',
    /** The per-ingredient portion steppers, and the one that empties a row. */
    lessOf: 'Less {{name}}',
    moreOf: 'More {{name}}',
    removeOf: 'Remove {{name}}',
    /**
     * Typing a number in by hand, for the dish the app got close but not right
     * — off a packet, off a recipe, off the kitchen scale.
     *
     * Each figure is edited where it is read: the number becomes a field in
     * place, so this labels a control rather than heading a form. The three
     * macros need no label of their own — the bar beside each one already
     * carries its name.
     */
    editKcal: 'Edit the calories',
    /** Renaming one logged entry, which does not rename the dish. */
    nameField: 'What to call this',
    numbersReset: 'Use the app’s figures',
    /**
     * Stands in for a serving label the catalogue import left unusable — a
     * measurement ("1 medium paper (8-5/8\" dia)") or a code ("383 GRM").
     */
    servingWord: 'serving',
    /**
     * The fallback chips, for an entry the model suggested nothing for. They go
     * into the fix box as text and are read by `scan-refine` like anything else
     * typed there, so each one has to be a sentence a model can act on rather
     * than a label the client understands.
     */
    quickFix: {
      halfPortion: 'Half portion',
      noSambal: 'No sambal',
      addEgg: 'Add an egg',
      extraRice: 'Extra rice',
    },
    editByHand: 'Edit the details by hand',
    /**
     * The footer. Short because it shares the row with "Fix it" — "Save
     * changes" and a sparkle button do not both fit on a small phone.
     */
    save: 'Save',
    /**
     * A write that failed. The screen stays where it is with everything still
     * filled in, so this says what happened rather than what to do about it.
     */
    saveFailed: 'Could not save those changes',
    /**
     * Leaving with edits staged. Nothing on this screen is written until Save,
     * so the back chevron is a discard and has to say so.
     */
    discardTitle: 'Leave without saving?',
    discardBody: 'What you changed here is dropped and the entry stays as it was.',
    /** Short: it shares a row with "Keep", and the title has said what goes. */
    discardConfirm: 'Discard',
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
