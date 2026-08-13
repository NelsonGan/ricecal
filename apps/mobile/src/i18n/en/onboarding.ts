export const onboarding = {
  welcome: {
    title: 'Every dish, already counted',
    subtitle: 'Nasi lemak, roti canai, cendol. Every local dish already in the book.',
    perks: {
      track: { title: 'Track every calorie', subtitle: 'Snap a photo or search in seconds' },
      habit: { title: 'Build a healthier habit', subtitle: 'Gentle goals, streaks, no shaming' },
      local: { title: 'Made for Malaysia', subtitle: 'Mamak, kopitiam and hawker dishes' },
    },
    start: 'Get started',
    signIn: 'I already have an account',
  },

  about: {
    title: 'A few basics',
    subtitle: 'Used only to work out your daily budget.',
    height: 'HEIGHT',
    weight: 'WEIGHT',
    sex: 'SEX',
    female: 'Female',
    male: 'Male',
    age: 'AGE',
    ageValue_one: '{{count}} year',
    ageValue_other: '{{count}} years',
    targetWeight: 'TARGET WEIGHT',
  },

  activity: {
    title: 'How active is your day?',
    subtitle: 'Desk job or on your feet, both are fine.',
    sedentary: { title: 'Mostly sitting', subtitle: 'Office, driving, study' },
    light: { title: 'Lightly active', subtitle: 'Some walking, light chores' },
    onFeet: { title: 'On my feet', subtitle: 'Retail, nursing, site work' },
    veryActive: { title: 'Very active', subtitle: 'Training most days' },
    note: 'A rough answer is fine. You can change it any time.',
  },

  foodStyle: {
    title: 'How do you usually makan?',
    subtitle: 'Helps us rank search results near you.',
    tags: {
      halal: 'Halal',
      mamak: 'Mamak',
      kopitiam: 'Kopitiam',
      hawker: 'Hawker',
      homeCooked: 'Home cooked',
      vegetarian: 'Vegetarian',
      noBeef: 'No beef',
      lessSugar: 'Less sugar',
      nasiCampur: 'Nasi campur',
    },
  },

  source: {
    title: 'Where did you hear about us?',
    subtitle: 'Helps us know which kampung to visit next.',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    friend: 'Friend or family',
    appStore: 'App Store',
    youtube: 'YouTube',
    other: 'Somewhere else',
  },

  calculating: {
    title: 'Building your plan',
    subtitle: 'Weighing your height, your weight, the target you set and how active your day is.',
    steps: {
      budget: 'Daily calorie goal',
      macros: 'Carbs, protein and fat split',
      catalogue: 'Local food matches',
    },
  },

  target: {
    perDay: 'KCAL A DAY',
    headline: 'That is about {{meals}} meals and a snack',
    carbs: 'CARBS',
    protein: 'PROTEIN',
    fat: 'FAT',
    footnote: 'Goal weight {{weight}} kg by {{date}}. We will nudge, never nag.',
    footnoteMaintain: 'Holding steady at {{weight}} kg. We will nudge, never nag.',
    looksRight: 'This looks right',
    /** Walks back to the first question rather than opening an editor. */
    adjust: 'Change my answers',
  },

  health: {
    title: 'Let your watch do the counting',
    subtitle:
      'Every walk, run and badminton game adds back to today’s budget. Nothing you eat is ever taken away.',
    connectApple: 'Connect Apple Health',
    connectAndroid: 'Connect Health Connect',
    /** A development build with no usable store. Says what it is, plainly. */
    demo: 'Use generated activity',
    later: 'Not now',
    /** After a connect that read nothing, which on iOS is the only sign of a no. */
    emptyToast: 'Nothing came back from Health. You can connect again from Activity.',
    failedToast: 'We could not connect to your health store. You can try again from Activity.',
    /** Under the CTA, so the promise is where the permission is asked for. */
    reassurance: 'You can connect later from the Activity tab. Nothing here is one-way.',
    /**
     * Paused rather than failed: react-query holds an online-only mutation until
     * a connection returns, so there is no error to report and nothing to retry.
     */
    offline: 'Waiting for a connection. You can skip this and connect later.',
  },

  notifications: {
    title: 'A nudge at the right moment',
    subtitle: 'A reminder when a meal goes unlogged, and word when a photo finishes counting.',
    sendTitle: 'WHAT WE WILL SEND',
    meals: 'Meal reminders',
    mealsBody: 'Breakfast, lunch and dinner, at your own times',
    scans: 'Your plate is counted',
    scansBody: 'When a photo finishes while you are elsewhere',
    /** Said out loud because every other tracker turns these on for you. */
    nothingElse: 'And nothing else',
    nothingElseBody: 'Water and weigh-in nudges stay off until you ask',
    promise: 'Turn any of these off later in Me, Reminders. Never a scold.',
    enable: 'Enable notifications',
    later: 'Maybe later',
    /**
     * Only after a refusal. `canAskAgain` is false by then, so the dialog will
     * never appear again and the honest thing is to say where the switch is.
     */
    blocked: 'Reminders are off for RiceCal. You can turn them on in Me, Reminders.',
  },

  /**
   * The four cards after the permissions, in the order they are shown.
   *
   * Deliberately about what this app actually does — snap, describe, search, and
   * correct — rather than about a confidence score or a recipe builder. A tour
   * that promises a feature is a tour that has to be rewritten when somebody
   * looks for it.
   */
  tutorial: {
    skip: 'Skip the tour',

    ways: {
      title: 'How RiceCal reads a meal',
      subtitle: 'Three ways in, one number out. Whichever you use, the plate lands on your day.',
      snap: 'Snap it',
      snapBody: 'A photo of the plate, straight down',
      describe: 'Describe it',
      describeBody: '“nasi lemak with fried chicken”',
      search: 'Search it',
      searchBody: 'The catalogue, by name and portion',
      next: 'What happens next?',
    },

    match: {
      title: 'We match it, then weigh it',
      subtitle:
        'Your plate goes against a catalogue of Malaysian dishes and hundreds of thousands of foods worldwide.',
      exampleName: 'Nasi lemak ayam',
      exampleDetail: '1 plate, 320 g',
      exampleKcal: '644',
      weightTitle: 'The portion is a weight first',
      weightBody:
        'Grams are the one thing a photograph really carries, and unlike a calorie figure they can be checked against the catalogue. That is what keeps four satay sticks from being logged as a meal.',
      next: 'How to snap a good one',
    },

    photo: {
      title: 'Sharpen a photo',
      subtitle: 'The portion is the part we read from the picture, so it is worth a glance.',
      angle: 'Shoot straight down',
      angleBody: 'The whole plate in frame, nothing cropped',
      scale: 'Leave something for scale',
      scaleBody: 'A spoon, a hand, the edge of the table',
      single: 'One dish per shot',
      singleBody: 'A full table is harder than a single plate',
      next: 'One more thing',
    },

    adjust: {
      title: 'Nothing is locked in',
      subtitle: 'Tap any entry afterwards. Change the portion by hand, or just say what was wrong.',
      beforeLabel: 'FROM A PHOTO',
      beforeName: 'Char kuey teow',
      beforeDetail: 'portion read as 250 g',
      afterLabel: 'AFTER YOU SAY SO',
      afterName: 'Char kuey teow',
      afterDetail: '300 g, and every part re-priced',
      closing:
        'Snap first, fix later. A rough log beats a skipped one, and a week of rough logs still shows the trend.',
      logFirst: 'Log my first meal',
      explore: 'Explore first',
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
    sendLink: 'Email me a link',
    /** There is no password to type, so the screen has to say what will happen. */
    linkExplainer: 'No password to remember. We will send a link that signs you in.',
    linkSent: 'Link sent to {{email}}. Open it on this phone to carry on.',
    errors: {
      email: 'That does not look like an email address.',
    },
  },
} as const
