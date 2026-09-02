export const onboarding = {
  /**
   * The first question, and the only one nobody can get wrong.
   *
   * Both controls open on an answer — the phone's own language, and metric — so
   * Continue is live on arrival. Every question after this one starts empty on
   * purpose; this one is a preference somebody either agrees with or does not,
   * and a screen that made them confirm a default would be a tap for nothing.
   */
  setup: {
    title: 'Before we start',
    subtitle: 'Both of these change what the next few screens say and how they measure.',
    unitsTitle: 'UNITS',
    metric: 'Metric',
    imperial: 'Imperial',
    /** Named as the fields they turn into, because the next screen is where they land. */
    metricNote: 'Centimetres and kilograms.',
    imperialNote: 'Feet, inches and pounds.',
  },

  welcome: {
    /**
     * Who it is for, said first, because that is the whole of the pitch.
     *
     * "Every dish, already counted" was a claim any tracker could make without
     * lying: they all count what is in their catalogue. What they do not have is
     * this food, which is why somebody downloads this app instead of the one they
     * already deleted.
     *
     * Asian rather than Malaysian. The catalogue was never only Malaysian (seven
     * national composition tables, the Open Food Facts slice and the researched
     * dishes make it an Asian book with a Malaysian centre) and "Made for
     * Malaysia" told everybody else in the region the app was not for them.
     */
    title: 'The calorie tracker made for Asians',
    /**
     * The proof under the claim, and it is four dish names rather than a
     * sentence about dish names.
     *
     * It used to end "Asian food, counted properly", which was the heading
     * again, and the third perk says how much is in there in numbers. Three
     * claims of one thing on one screen. What is left is the part nothing else
     * on it says: the food itself.
     */
    subtitle: 'Nasi lemak, pho, laksa, char siu rice.',
    perks: {
      track: { title: 'Track every calorie', subtitle: 'Snap a photo or search in seconds' },
      habit: { title: 'Build a healthier habit', subtitle: 'Gentle goals, streaks, no shaming' },
      /** The numbers are `food` and `product` in the D1 catalogue, rounded down. */
      local: { title: '50,000 Asian dishes', subtitle: 'And 3 million packets, read by barcode' },
    },
    start: 'Get started',
    signIn: 'I already have an account',
  },

  /**
   * The first question, and every control on it starts EMPTY.
   *
   * It used to open with a plausible body already filled in: 164 cm, 65 kg,
   * 29 years old, female. Every one of those is a real answer as far as the
   * budget is concerned, so a user who tapped Continue without reading got a
   * calorie target computed for somebody else and no sign that anything had
   * been skipped. Empty fields cannot be walked past.
   */
  about: {
    title: 'A few basics',
    height: 'HEIGHT',
    heightPlaceholder: '170',
    weight: 'WEIGHT',
    weightPlaceholder: '65',
    /**
     * The imperial height, as two boxes. Nobody knows their height in
     * inches, so the pair is the answer and `settleHeight` clamps them
     * together.
     */
    feet: 'ft',
    inches: 'in',
    feetPlaceholder: '5',
    inchesPlaceholder: '9',
    /** Over the second box. The right slot carries the symbol; this names it. */
    inchesLabel: 'INCHES',
    weightPlaceholderLb: '145',
    sex: 'SEX',
    female: 'Female',
    male: 'Male',
    age: 'AGE',
    agePlaceholder: '29',
    years: 'years',
    targetWeight: 'TARGET WEIGHT',
    /** The slider's readout before it has been touched. */
    targetWeightUnset: '—',
    targetWeightHint: 'Slide to set the weight you are aiming for.',
    /** Only appears once the weight is known, because it is measured from it. */
    targetWeightLocked: 'Enter your weight first.',
  },

  activity: {
    title: 'How active is your day?',
    sedentary: { title: 'Mostly sitting', subtitle: 'Office, driving, study' },
    light: { title: 'Lightly active', subtitle: 'Some walking, light chores' },
    onFeet: { title: 'On my feet', subtitle: 'Retail, nursing, site work' },
    veryActive: { title: 'Very active', subtitle: 'Training most days' },
  },

  source: {
    title: 'Where did you hear about us?',
    subtitle: 'It helps us know where to show up next.',
    xiaohongshu: 'XiaoHongShu',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    reddit: 'Reddit',
    facebook: 'Facebook',
    threads: 'Threads',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    friend: 'Friend or family',
    other: 'Somewhere else',
  },

  calculating: {
    title: 'Building your plan',
    /**
     * Short, because this screen is on for about two and a half seconds and the
     * three lines under it are already moving.
     *
     * It listed the answers back: "Your height, your weight, your target and
     * how you spend the day." Nobody reads twelve words while a ring fills and
     * three ticks land, and the job of the line is not the list — it is to say
     * the number about to appear was worked out for THEM, which is the whole
     * reason this beat exists.
     */
    subtitle: 'Worked out from your answers, not an average.',
    steps: {
      budget: 'Daily calorie goal',
      macros: 'Carbs, protein and fat split',
      catalogue: 'Matching your food',
    },
  },

  target: {
    title: 'Your daily budget',
    perDay: 'KCAL A DAY',
    /** The plan, as two tiles rather than a sentence. */
    goalWeight: 'GOAL WEIGHT',
    goalBy: 'ON TRACK FOR',
    maintain: 'MAINTAIN',
    maintainValue: 'Steady',
    /**
     * No `splitTitle`. The card over the three macro tiles used to be headed
     * "YOUR DAILY SPLIT", above tiles reading CARBS, PROTEIN and FAT — the
     * heading and the contents were the same sentence.
     */
    looksRight: 'This looks right',
    /** Walks back to the first question rather than opening an editor. */
    adjust: 'Change my answers',
  },

  health: {
    title: 'Let your watch do the counting',
    /** Short, and about what the user GETS. The long version listed workouts. */
    subtitle: 'What you burn is added to today’s budget.',
    /**
     * NO BUTTON LABELS HERE ANY MORE, and their absence is the point.
     *
     * The step had two — "Connect Apple Health" and "Not now" — and App Review
     * rejected both under guideline 5.1.1(iv): a message shown before a
     * permission request may not dress itself as the request, and it may not
     * offer a way past without one. The button says `common:action.continue`
     * now, and there is no second button. See `(onboarding)/health.tsx`.
     */
    /** A development build with no usable store. Says what it is, plainly. */
    demo: 'Use generated activity',
    /** After a connect that read nothing, which on iOS is the only sign of a no. */
    emptyToast: 'Nothing came back from Health. You can connect again from Activity.',
    failedToast: 'We could not connect to your health store. You can try again from Activity.',
    /**
     * Under the CTA, so the promise is where the permission is asked for.
     *
     * It used to end "You can connect later from Activity", which was an
     * invitation to postpone printed under a button that no longer allows it.
     * What is left is the part that is about the permission itself, and it is
     * literally true: `toShare` is empty in every request.
     */
    reassurance: 'Read only. We never write anything back.',
  },

  notifications: {
    title: 'A nudge at the right moment',
    subtitle: 'Three meal reminders, at your own times.',
    meals: 'Meal reminders',
    scans: 'Your plate is counted',
    /** Said out loud because every other tracker turns these on for you. */
    nothingElse: 'And nothing else',
    promise: 'Turn any of these off in Me, Reminders.',
    /**
     * NO BUTTON LABELS HERE EITHER, for the reason the health step has none.
     * "Enable notifications" and "Maybe later" were the two halves of guideline
     * 5.1.1(iv) in one footer: a button worded as the ask, and a way past the
     * request beside it. The step says `common:action.continue` now, and there
     * is nothing next to it.
     */
    /**
     * Only after a refusal. `canAskAgain` is false by then, so the dialog will
     * never appear again and the honest thing is to say where the switch is.
     */
    blocked: 'Reminders are off for RiceCal. You can turn them on in Me, Reminders.',
  },

  /**
   * THE TOUR, WHICH IS NO LONGER PART OF THE FLOW.
   *
   * So the writing changed with the placement. Each card is now a MOCK of the
   * thing it describes — the log sheet, a diary row, the correction chips, the
   * ring — because a reader who has the real screen one tap away is checking
   * whether the picture matches it, not reading an essay about grams.
   */
  tutorial: {
    appBar: 'How RiceCal works',
    skip: 'Skip',
    next: 'Next',
    done: 'Start logging',
    /** The toast on Today, offered once and never again. */
    offerTitle: 'New here?',
    offerBody: 'A 30 second tour of how logging works.',
    offerAction: 'Show me',

    log: {
      title: 'Four ways to log',
      subtitle: 'Tap the green button on Today, then pick one.',
      snap: 'Snap',
      snapBody: 'A photo of the plate',
      describe: 'Describe',
      describeBody: 'Type what you ate',
      search: 'Search',
      searchBody: 'Find it by name',
      recipes: 'Recipes',
      recipesBody: 'Something you cooked',
      /** Scanning is a tab inside the camera, not a fifth square. Say so. */
      barcode: 'Got a packet? The camera scans barcodes too.',
    },

    read: {
      title: 'It lands on your day',
      subtitle: 'We name the dish, size the portion and count it for you.',
      exampleName: 'Nasi lemak ayam',
      exampleDetail: '1 plate, 320 g',
      exampleKcal: '644',
      tip: 'Shoot straight down, with the whole plate in frame.',
    },

    fix: {
      title: 'Wrong? Just say so',
      subtitle: 'Tap the entry, then the sparkle. Plain words are enough.',
      /** The chips are real ones from `FixSheet`. */
      chipHalf: 'Half portion',
      chipNoRice: 'No rice',
      chipExtra: 'Add a drink',
      typed: 'I only ate half the rice',
      beforeLabel: 'BEFORE',
      before: '644',
      afterLabel: 'AFTER',
      after: '498',
    },

    day: {
      title: 'Watch the day fill up',
      /** Says what the card beside it actually draws: the ring, then the bars. */
      subtitle: 'The ring is what is left. The bars are carbs, protein and fat.',
      ringCaption: 'KCAL LEFT',
      carbs: 'Carbs',
      protein: 'Protein',
      fat: 'Fat',
      note: 'Movement from your watch is added on top, never taken off.',
    },
  },

  saving: {
    title: 'Saving your answers…',
    offlineTitle: 'Waiting for a connection',
    offlineBody:
      'Your answers are safe on this phone. We will save them the moment you are online.',
    failedTitle: 'We could not save your answers',
    failedBody: 'Nothing is lost. Check your connection and try again.',
  },

  account: {
    title: 'Save your progress',
    subtitle: 'Your answers are ready. An account keeps them safe if you change phone.',
    signInTitle: 'Welcome back',
    signInSubtitle: 'Sign in and your diary picks up where it left off.',
    apple: 'Continue with Apple',
    google: 'Continue with Google',
    or: 'OR',
    email: 'EMAIL',
    emailPlaceholder: 'you@email.com',
    /**
     * `sendLink`, `linkExplainer` and `linkSent` used to live here, from when
     * this screen mailed a link itself and said so. It asks for an address and
     * nothing else now: what happens to it is `(auth)/password`'s question, and
     * the copy for it is in the `auth` namespace with the rest of the
     * credentials wording.
     */
    errors: {
      email: 'That does not look like an email address.',
    },
  },
} as const
