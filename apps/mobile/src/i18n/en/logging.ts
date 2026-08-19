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
    remaining: '{{count}} kcal left',
    snap: 'Snap',
    describe: 'Describe',
    search: 'Search',
  },

  /**
   * The two sides of one camera.
   *
   * "Meal" rather than "Photo" and "Barcode" rather than "Scan": the tabs name
   * WHAT IS BEING POINTED AT, not the mechanism, because the mechanism is the
   * same on both and naming it twice would make them read as two cameras.
   */
  capture: {
    tabs: 'What are you pointing at',
    meal: 'Meal',
    barcode: 'Barcode',
    /**
     * What a free account has left today, under the viewfinder.
     *
     * Plural because the last one is the one that matters: "1 scan left today"
     * is the line somebody reads before deciding whether to spend it, and "1
     * scans" would undermine the only sentence on this screen that is asking
     * for a decision. Zero reads as none rather than as a number, since by then
     * the sentence is about tomorrow.
     */
    scansLeft_zero: 'No scans left today. They come back tomorrow.',
    scansLeft_one: '{{count}} scan left today',
    scansLeft_other: '{{count}} scans left today',
  },

  /**
   * The barcode scanner, and the page a scan lands on.
   *
   * The viewfinder itself now says one thing and only one: point the camera. It
   * used to carry four lines under the window — aiming, looking up, we do not
   * know this packet, something went wrong — because the lookup happened there
   * and the user watched it. A scan leaves the sheet the moment a code is read,
   * so three of those four belong to the page it leaves for.
   *
   * "We do not have this one yet" rather than "not found": the packet exists,
   * it is in the user's hand, and OUR RECORD of it is what is missing. The
   * difference matters because the next thing offered is Describe rather than
   * an apology.
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
     * Every part taken off. The entry survives as whatever its own portion costs,
     * so this says what will happen rather than standing in the way.
     */
    plateEmptied: 'Nothing left on the plate. The entry goes back to counting as one serving.',
    /**
     * How many of an ingredient are on the plate. Shown at one as well: a
     * count that appears only above one reads as a badge on the busy rows
     * rather than as the amount every row has.
     */
    times: '× {{amount}}',
    /**
     * WHAT A PART WEIGHS, in brackets after its name.
     *
     * The weight is the one thing about a part somebody can check against the
     * plate in front of them, and it used to sit on a second line behind a
     * multiplier — "× 0.75 · 165 g" — which put the number nobody can act on
     * first. The multiplier is an implementation detail of how the row stores an
     * amount; 165 g is the amount.
     */
    grams: '({{grams}} g)',
    /** The same for a part nobody weighed, where the count is all there is. */
    count: '(× {{amount}})',
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
     * Typing a number in by hand, for the dish the app got close but not right
     * — off a packet, off a recipe, off the kitchen scale.
     *
     * Each figure is edited where it is read: the number becomes a field in
     * place, so this labels a control rather than heading a form. The three
     * macros need no label of their own — the bar beside each one already
     * carries its name.
     */
    editKcal: 'Calories',
    /**
     * The sheet those four figures are typed in, and the three "Edit" controls
     * that open one. Each label names the card rather than repeating the word,
     * because a screen reader hearing three "Edit" buttons on one screen learns
     * nothing from any of them.
     */
    figuresTitle: 'Your own figures',
    macrosTitle: 'Macros',
    /**
     * The three pencils, and they are the only words those controls have: the
     * button itself is the icon alone, so a screen reader hearing three of them
     * on one screen needs each to say WHICH card it opens.
     */
    editFigures: 'Edit the calories and macros',
    editPlate: 'Edit the ingredients',
    editDetails: 'Edit the name, day and time',
    /** On the card, when at least one figure was typed. See the reset link. */
    yourFigures: 'Your own figures, not the app’s.',
    /**
     * The two field labels in the details sheet, and they are ONE WORD each.
     * "What to call this" and "When you ate it" were sentences where a label was
     * wanted: a field with a value in it and a heading over it does not need the
     * heading to also explain the field.
     *
     * Renaming one logged entry writes `display_label`, so it does not rename the
     * dish for anyone else who logged it.
     */
    nameField: 'Name',
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
     * WHEN it was eaten: the day it counts towards and the time on the row.
     *
     * Two columns and one question — see `features/logging/when.ts`. It reads as
     * one line under the title, the same pair of facts the diary row prints under
     * a dish name, and the sheet asks once.
     */
    whenValue: '{{day}} at {{time}}',
    /**
     * The row in the details sheet that opens the picker. A value with a way in
     * rather than the controls themselves — five of those laid out flat is what
     * the picker replaced.
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
     * Said when the entry has left the day the user is looking at. Without it
     * the diary they land back on has one fewer row and a meal moved to
     * yesterday reads as a meal deleted.
     */
    movedTo: 'Moved to {{day}}',
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
    /** The first of the three controls over the photo, before the pencil and the bin. */
    shareEntry: 'Share this meal',
  },

  /**
   * Sending one logged meal out of the app as a picture.
   *
   * The card itself carries none of this except the wordmark: the dish name,
   * the figures and the macro labels are all the entry's own, read from where
   * the screen reads them.
   */
  share: {
    /**
     * The signature under the figures, in two halves. "Logged by" is the small
     * half and the name is the half being said, so they are separate strings: a
     * translation that wanted the name first can put it first, and neither can
     * be interpolated into the other's weight.
     */
    loggedBy: 'Logged by',
    /** The name on the picture. Not translated: it is a name. */
    brand: 'RiceCal',
    /**
     * ANDROID ONLY, now. The share intent there carries a message and nothing
     * else, so a meal shared on Android is this sentence or it is nothing. iOS
     * sends the picture ALONE — the card already says the dish and the calories,
     * and a sentence repeating them beside it is the same facts twice.
     */
    text: '{{food}}, {{kcal}} kcal. Logged with RiceCal',
    /**
     * The capture came back with nothing. Rare and not worth explaining: the
     * only thing the user can do about it is press the button again.
     */
    failed: 'Could not make that picture',
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
   * The water card on Today, which is a tank that fills rather than eight boxes
   * you tick. Everything here is a VOLUME, and in MILLILITRES: see
   * `lib/water.ts` for why the glasses went and which unit belongs where.
   */
  water: {
    title: 'Water',
    /**
     * Drunk against the goal. A slash rather than the word "of", the same way
     * the ring and the macro bars write a fraction — and ONE unit, printed
     * once at the end, because "0 ml / 2 L" is a fraction whose halves are in
     * different units and reads as a fault.
     */
    count: '{{filled}} / {{goal}} ml',
    /**
     * The sheet behind Add, and what is left of the goal beside its heading.
     *
     * "left" rather than "to go", and clamped at zero rather than swapped for a
     * congratulation, because the sheet this one is a sibling of writes
     * "1,460 kcal left" in the same corner. Two ways of saying the same thing
     * in two sheets opened by two buttons on one screen is one too many.
     */
    addTitle: 'Add water',
    left: '{{amount}} ml left',
    /**
     * A quick-add button, to a screen reader. The label on screen is the size
     * alone, and the vessel is the drawing above it — a button reading "Glass
     * 250 ml" says the same thing twice in a space with room for one.
     */
    add: 'Add {{amount}} ml',
    customLabel: 'Another amount',
    /** The example in the empty field. A figure none of the three presets is. */
    customPlaceholder: '600',
    /**
     * The two buttons under it, which are icons on screen — so these are what a
     * screen reader has to go on, and they name the DIRECTION rather than the
     * figure, which is in the field above and already announced.
     */
    customAdd: 'Add this amount',
    customRemove: 'Take this amount off',
    /**
     * The toast after a drink, and the way back out of it. The amount is in the
     * message rather than on the button, because "Undo" is what somebody is
     * looking for and the figure is what tells them whether they want it.
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
