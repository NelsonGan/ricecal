export const logging = {
  today: {
    title: 'Today',
    /**
     * The floating button back to today. Its visible label is the word above, so
     * this is the sentence the arrow and the position are saying.
     */
    backToTodayA11y: 'Go back to today',
    kcalLeft: 'KCAL LEFT',
    kcalOver: 'KCAL OVER',
    /**
     * The same ring, tapped: eaten so far against the day's allowance. A slash
     * rather than the word "of", matching the macro bars.
     */
    kcalOfGoal: '/{{goal}} KCAL',
    showGoals: 'Show the day’s allowance',
    showLeft: 'Show what is left',
    /** Shown when the day is over budget. Never scold. */
    overNote: 'A bit over today, tomorrow is a new count.',
    /**
     * The same, for a day reached through the week strip. "Tomorrow is a new
     * count" is a kindness about a day still running and wrong about last
     * Tuesday, whose tomorrow has been and gone.
     */
    overNoteOn: 'A bit over that day.',
    /**
     * Under the ring when a health store credited movement, so a goal higher
     * than the one in Settings is explained where it is noticed. "+360 from
     * moving" rather than "360 burned": movement adds, and the plus says so.
     */
    burnedNote: '+{{kcal}} from moving today',
    /** The same line about a day the strip went back to. */
    burnedNoteOn: '+{{kcal}} from moving that day',
    /** Everything logged today, in one list. See `EntryList` for why. */
    logHeading: 'EATEN · {{kcal}} KCAL',
    /** A snapped plate whose dish is still being worked out. */
    analysing: 'Reading your plate',
    analysingHint: 'Counting once it knows what this is',
    /**
     * The same row for a typed meal. It says "reading" too, since the cascade is
     * the same, but there is no plate on screen, so the title names the words.
     */
    describing: 'Reading what you wrote',
    describingRead: 'Reading what you wrote…',
    /**
     * The rotating status line over the scan progress bar. Stages rather than
     * facts: the client cannot see where a scan is, so these describe the
     * cascade without claiming to track it.
     */
    scanningRead: 'Reading your plate…',
    scanningMatch: 'Finding it in the catalogue…',
    scanningPortion: 'Sizing up the portion…',
    scanningCount: 'Counting the calories…',
    /** The same bar while a fix-by-typing correction is applied to a row. */
    refiningApply: 'Applying your fix…',
    refiningCount: 'Recounting the calories…',
    /**
     * The notification, posted only when the scan lands with the app in the
     * background. A plate takes half a minute to read.
     */
    scanDoneTitle: 'Your plate is counted',
    /** The same banner for a meal that was typed: there was no plate. */
    describeDoneTitle: 'Your meal is counted',
    scanDoneBody: '{{food}} · {{kcal}} kcal',
    scanDoneBodyPlain: 'Tap to see what was on it.',
    /** On the panel behind a row being swiped away, and to a screen reader. */
    deleteEntry: 'Delete',
    /**
     * The photo had nothing edible in it. Nothing was logged, so the row exists
     * to say so and be dismissed: not an apology and not an error.
     */
    noFoodTitle: 'No food in this photo',
    /** The same outcome for a typed meal: the words named nothing edible. */
    noFoodTypedTitle: 'No food in what you wrote',
    noFoodHint: 'Nothing was added to your day.',
    noFoodDismiss: 'Dismiss',
    analysisFailedTitle: 'Could not read this one',
    analysisFailedHint: 'Tap to pick the dish yourself',
    // No `emptyTitle` / `emptyBody`. A day before its first meal is where this
    // screen starts every morning, and a card announcing it pushed the ring and
    // the water tracker apart to say what the empty list already said.

    /** No `daily_goals` row yet — onboarding is what computes the first one. */
    noBudgetTitle: 'No daily budget yet',
    noBudgetBody: 'Set your target and the ring has something to fill.',
    noBudgetAction: 'Set my target',
  },

  /**
   * The week strip above the ring, all of it for a screen reader. The cell is
   * two glyphs and a dot, which is legible at a glance and says nothing aloud.
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

  /**
   * The month view: not "what did I eat" but "what have I been eating". Its own
   * block, because the two views share only their dots.
   */
  calendar: {
    /** The toggle names the view it is OFFERING, in both directions. */
    showMonth: 'Show the month',
    showDay: 'Show the day',
    previousMonth: 'The month before',
    nextMonth: 'The month after',
    legend: {
      under: 'Under goal',
      /** Never "over budget" and never a failure. The same wording as the strip. */
      over: 'Over goal',
      missed: 'Not logged',
    },
    /**
     * The card under the grid, headed by the day and nothing else. It carried
     * the meal count too, which the list directly under it already gives.
     */
    dayHeading: '{{day}}',
    dayKcal: '{{kcal}} kcal',
    /** A day with nothing on it. Not a failure, and not scolded. */
    dayEmpty: 'Nothing logged that day.',
  },

  selector: {
    title: 'Log a dish',
    remaining: '{{count}} kcal left',
    snap: 'Snap',
    describe: 'Describe',
    search: 'Search',
  },

  /**
   * The two sides of one camera. "Meal" rather than "Photo" and "Barcode" rather
   * than "Scan": the tabs name what is being pointed at, since the mechanism is
   * the same on both and naming it twice reads as two cameras.
   */
  capture: {
    tabs: 'What are you pointing at',
    meal: 'Meal',
    barcode: 'Barcode',
    /**
     * What a free account has left today, under the viewfinder. "1 scan left
     * today" is the line somebody reads before deciding whether to spend it, and
     * zero reads as none rather than a number, since by then it is about
     * tomorrow.
     */
    scansLeft_zero: 'No scans left today. They come back tomorrow.',
    scansLeft_one: '{{count}} scan left today',
    scansLeft_other: '{{count}} scans left today',
  },

  /**
   * The barcode scanner, and the page a scan lands on.
   *
   * The viewfinder says one thing: point the camera. It carried four lines while
   * the lookup happened there, and a scan now leaves the sheet as soon as a code
   * is read, so three of them belong to the page it leaves for.
   *
   * "We do not have this one yet" rather than "not found": the packet is in the
   * user's hand and our record is what is missing, which is why the next thing
   * offered is Describe rather than an apology.
   */
  barcode: {
    permissionTitle: 'Let RiceCal use the camera',
    permissionBody: 'The camera reads the barcode on the packet. Nothing is recorded or uploaded.',
    aim: 'Point the camera at the barcode on the packet.',
    noCamera: 'This device has no camera, so there is nothing to scan with here.',
    missTitle: 'New packet',
    unknown: 'We do not have this one yet. Describe it instead and we will work it out.',
    failedTitle: 'No answer',
    failed:
      'We could not reach the catalogue just now. The packet may be fine; the connection was not.',
    tryAgain: 'Scan again',
    describeInstead: 'Describe it instead',
  },

  /**
   * Typing the meal instead of photographing it. The example in the placeholder
   * is the only instruction there is: it shows that a whole meal with its sides
   * belongs in one box, which an empty field does not. A hint line under the
   * field said the same thing in the abstract and was skipped.
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
    /**
     * The label is `common:action.continue` now. Guideline 5.1.1(iv): a button in
     * front of a system permission sheet may not be worded as the ask.
     */
    /** When iOS has a refusal on record, so the dialog will never appear again. */
    permissionSettings: 'Open Settings',
    shutter: 'Take a photo',
    library: 'Choose from photos',
    flip: 'Flip camera',
    captured: 'The photo you just took',
    /** Alt text on a logged entry's photo. */
    photoOf: 'Photo of {{food}}',
  },

  added: {
    toast: 'Added, {{kcal}} kcal',
    removedToast: 'Removed from today',
  },

  search: {
    title: 'Search',
    placeholder: 'Search any dish',
    clear: 'Clear search',
    /**
     * The two lists one field searches. "All foods" rather than "Catalogue",
     * which is our word and nobody else's, and "My foods" rather than "Recent":
     * what makes the second list worth a tab is that the meals are the user's
     * own, at their own portions. Recency is how it is sorted, not what it is.
     */
    tabs: 'Which foods to search',
    tabCatalogue: 'All foods',
    tabMine: 'My foods',
    /** Nobody has logged anything yet. Not a failure, so not phrased as one. */
    mineEmptyTitle: 'Nothing logged yet',
    mineEmptyBody: 'Meals you log turn up here, ready to add again.',
    /** There is a history; nothing in it matches what was typed. */
    mineNoMatchBody: 'Nothing you have eaten matches that.',
    mineOfflineBody: 'Your diary lives on the server. This will load once you are back online.',
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
     * do not borrow the copy above.
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
    fixTitle: 'Fix it by typing',
    fixPlaceholder: 'no sambal, and it was half a plate',
    /**
     * The sparkle button in the footer, and the sheet's own submit. The same two
     * words twice, because the sheet is that button's second half rather than a
     * new question.
     */
    fixAction: 'Fix it',
    /**
     * Why a correction changed nothing. Five of them, because one apology for
     * all five made the feature feel broken: "Could not apply that. Try
     * rewording it" was shown for "extra spicy", where rewording will not help,
     * and for a model answering in the wrong shape, where the words were fine.
     * Each has to leave the reader with a different next move.
     *
     * `fixNotApplied` survives as the last resort, for an older server.
     */
    fixNotApplied: 'Could not apply that. Try rewording it',
    fixNoCalories: 'That does not change the calories, so nothing moved',
    fixNotUnderstood: 'Could not read that one. Try saying it another way',
    fixNoMatch: 'Could not work out that dish. Your meal is unchanged',
    fixNoChange: 'Nothing on the plate matched that',
    fixFailed: 'That did not go through. Try again',
    /** The plate's ingredient breakdown. */
    plateTitle: 'INGREDIENTS',
    /**
     * The same word as `plateTitle`, in the case a page title takes.
     * `plateTitle` is a section marker set in capitals; this names a screen.
     * Two keys rather than one cased at the call site, because which a language
     * wants is a translator's decision and `toUpperCase()` is wrong in several.
     */
    plateHeading: 'Ingredients',
    plateTotal: 'Total',
    /**
     * An entry nothing has broken down, which is most of them. Said rather than
     * left blank, because an INGREDIENTS card with nothing under it reads as a
     * plate whose parts went missing.
     *
     * It names the pencil, which is the only way in. Shown on the card as the
     * reason it looks empty, and in the sheet as what the one button is for.
     */
    plateNone: 'This counts as one thing. Edit to break it into ingredients.',
    /** The plus in the ingredients card's header, and the sheet it opens. */
    addPart: 'Add an ingredient',
    addPartTitle: 'Add an ingredient',
    partAdded: '{{food}} added to the plate',
    addPartFailed: 'Could not add that. Try again',
    /**
     * The one refusal worth naming. An entry whose calorie total was typed
     * cannot be broken down: the typed figure sits above the parts, so the plate
     * would gain a row and not a calorie.
     */
    addPartTyped: 'This entry uses your own calorie figure, so it cannot be broken down',
    /**
     * Every part taken off. The entry survives as whatever its own portion
     * costs, so this says what will happen rather than standing in the way.
     */
    plateEmptied: 'Nothing left on the plate. The entry goes back to counting as one serving.',
    /**
     * How many of an ingredient are on the plate. Shown at one as well, or it
     * reads as a badge on the busy rows rather than the amount every row has.
     */
    times: '× {{amount}}',
    /** What a part weighs, in brackets after its name. */
    grams: '({{grams}} g)',
    /** What a part costs, on the row in the sheet where its weight is edited. */
    partKcal: '{{kcal}} kcal',
    /** The weight in the sheet's own field, and what the number pad calls it. */
    gramsShort: '{{grams}} g',
    gramsField: 'Weight in grams',
    /** The per-ingredient portion steppers, and the one that empties a row. */
    lessOf: 'Less {{name}}',
    moreOf: 'More {{name}}',
    removeOf: 'Remove {{name}}',
    /**
     * Typing a number in by hand, for the dish the app got close but not right.
     * All four figures are edited together in `NutritionSheet`, so this labels a
     * form rather than a control; the macros need no label, because the bar
     * beside each carries its name.
     */
    editKcal: 'Calories',
    /**
     * The sheet those four figures are typed in, and the three controls that
     * open one. Each label names its card, because a screen reader hearing three
     * "Edit" buttons learns nothing from any of them.
     */
    figuresTitle: 'Your own figures',
    macrosTitle: 'Macros',
    /**
     * The three pencils, which are icon-only buttons, so these are the only
     * words they have and each has to say which card it opens.
     */
    editFigures: 'Edit the calories and macros',
    editPlate: 'Edit the ingredients',
    editDetails: 'Edit the name, day and time',
    /** On the card, when at least one figure was typed. See the reset link. */
    yourFigures: 'Your own figures, not the app’s.',
    /**
     * The two field labels in the details sheet, one word each. "What to call
     * this" and "When you ate it" were sentences where a label was wanted.
     *
     * Renaming one logged entry writes `display_label`, so it does not rename
     * the dish for anyone else who logged it.
     */
    nameField: 'Name',
    numbersReset: 'Use the app’s figures',
    /**
     * Stands in for a serving label the import left unusable: a measurement
     * ("1 medium paper (8-5/8\" dia)") or a code ("383 GRM").
     */
    servingWord: 'serving',
    /**
     * The fallback chips, for an entry the model suggested nothing for. They go
     * into the fix box as text and are read by `scan-refine` like anything else
     * typed there, so each has to be a sentence a model can act on.
     */
    quickFix: {
      halfPortion: 'Half portion',
      noSambal: 'No sambal',
      addEgg: 'Add an egg',
      extraRice: 'Extra rice',
    },
    editByHand: 'Edit the details by hand',
    /**
     * When it was eaten: the day it counts towards and the time on the row. Two
     * columns and one question (see `features/logging/when.ts`), read as one line
     * under the title, and the sheet asks once.
     */
    whenValue: '{{day}} at {{time}}',
    /**
     * The row in the details sheet that opens the picker: a value with a way in
     * rather than the five controls laid out flat that it replaced.
     */
    whenRow: 'Date',
    /** The four wheels, to a screen reader. Each is a run of near-identical rows. */
    dayTitle: 'Day',
    timeTitle: 'Time',
    hour: 'Hour',
    minute: 'Minute',
    am: 'am',
    pm: 'pm',
    /**
     * Said when the entry has left the day the user is looking at. Without it, a
     * meal moved to yesterday reads as a meal deleted.
     */
    movedTo: 'Moved to {{day}}',
    /** The footer. Short because it shares the row with "Fix it". */
    save: 'Save',
    /**
     * A write that failed. The screen stays where it is with everything filled
     * in, so this says what happened rather than what to do about it.
     */
    saveFailed: 'Could not save those changes',
    /**
     * Leaving with edits staged. Nothing is written until Save, so the back
     * chevron is a discard and has to say so.
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
     * A row holds a photo or a drawing and never both, so picking one discards
     * the other, and the photo is of the actual plate.
     */
    replacePhotoTitle: 'Replace your photo?',
    replacePhotoBody:
      'This entry keeps a photo or a picture, not both. Your photo of the real plate goes for good.',
    replacePhotoConfirm: 'Pick a picture',
    /** The first of the three controls over the photo, before the pencil and the bin. */
    shareEntry: 'Share this meal',
  },

  /**
   * Sending one logged meal out of the app as a picture. The card carries none
   * of this except the wordmark: the dish name, the figures and the macro labels
   * are the entry's own.
   */
  share: {
    /**
     * The signature under the figures, in two halves, so a translation that
     * wants the name first can put it first and neither is interpolated into the
     * other's weight.
     */
    loggedBy: 'Logged by',
    /** The name on the picture. Not translated: it is a name. */
    brand: 'RiceCal',
    /**
     * Android only. Its share intent carries a message and nothing else, so a
     * meal shared there is this sentence or nothing. iOS sends the picture
     * alone, since the card already says the dish and the calories.
     */
    text: '{{food}}, {{kcal}} kcal. Logged with RiceCal',
    /**
     * The capture came back with nothing. Not worth explaining: the only thing
     * to do about it is press the button again.
     */
    failed: 'Could not make that picture',
  },

  /**
   * Picking an illustration for one logged item. Needed because the catalogue
   * cannot be illustrated: a few hundred drawings against hundreds of megabytes
   * of imported foods, so most rows have none.
   */
  icon: {
    title: 'Pick a picture',
    /**
     * The two halves of the sheet, as a pair of tiles at the top, the same shape
     * the quick selector uses. No heading between them: with the two visibly
     * exclusive, nothing has to say so.
     */
    searchTab: 'Search',
    cameraTab: 'Camera',
    searchLabel: 'Search pictures',
    searchPlaceholder: 'nasi lemak, teh tarik, fish',
    noMatch: 'Nothing matches “{{query}}”.',
  },

  /**
   * The water card on Today: a tank that fills rather than eight boxes to tick.
   * Everything here is a volume in millilitres. See `lib/water.ts` for why the
   * glasses went and which unit belongs where.
   */
  water: {
    title: 'Water',
    /**
     * Drunk against the goal. A slash rather than "of", as the ring and the
     * macro bars write a fraction, and one unit printed once at the end, because
     * "0 ml / 2 L" reads as a fault.
     */
    count: '{{filled}} / {{goal}} ml',
    /**
     * The sheet behind Add, and what is left of the goal beside its heading.
     * "left" rather than "to go", and clamped at zero rather than swapped for a
     * congratulation, because its sibling sheet writes "1,460 kcal left" in the
     * same corner.
     */
    addTitle: 'Add water',
    left: '{{amount}} ml left',
    /**
     * A quick-add button, to a screen reader. On screen the label is the size
     * alone and the vessel is the drawing above it.
     */
    add: 'Add {{amount}} ml',
    customLabel: 'Another amount',
    /** The example in the empty field. A figure none of the three presets is. */
    customPlaceholder: '600',
    /**
     * The two buttons under it, which are icons on screen. They name the
     * direction rather than the figure, which the field above already announces.
     */
    customAdd: 'Add this amount',
    customRemove: 'Take this amount off',
    /**
     * The toast after a drink, and the way out of it. The amount is in the
     * message rather than on the button, because "Undo" is what somebody looks
     * for and the figure is what tells them whether they want it.
     */
    added: '{{amount}} ml of water',
    removed: '{{amount}} ml taken off',
    undo: 'Undo',
    /** The tank itself, to a screen reader. */
    level: '{{filled}} of {{goal}} ml drunk today',
  },

  // No `diary` block. The diary screen and its calendar are gone, and this file's
  // rule is that a screen can be deleted without leaving orphans behind in here.
} as const
