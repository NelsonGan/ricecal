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

  goal: {
    title: 'What are you here for?',
    subtitle: 'You can change this any time.',
    /**
     * No longer promises a rate. The deficit is capped as a share of what the
     * body burns, so 0.5 kg a week is what a larger body gets and a smaller one
     * moves slower on purpose — the date on the target screen is the honest
     * answer, and it is worked out from that body.
     */
    lose: { title: 'Lose weight', subtitle: 'A gentle, steady deficit' },
    maintain: { title: 'Maintain', subtitle: 'Stay where you are' },
    gain: { title: 'Gain weight', subtitle: 'Slow, steady increase' },
    track: { title: 'Just tracking', subtitle: 'No goal, only awareness' },
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

  target: {
    perDay: 'KCAL A DAY',
    headline: 'That is about {{meals}} meals and a snack',
    carbs: 'CARBS',
    protein: 'PROTEIN',
    fat: 'FAT',
    footnote: 'Goal weight {{weight}} kg by {{date}}. We will nudge, never nag.',
    footnoteMaintain: 'Holding steady at {{weight}} kg. We will nudge, never nag.',
    logFirst: 'Log my first meal',
    explore: 'Explore first',
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
    /**
     * The "did you mean" question. It names the address it is offering rather
     * than only the domain, because the whole address is what gets tapped.
     */
    didYouMean: 'Did you mean {{email}}?',
    didYouMeanBody: 'A link sent to {{domain}} will not arrive. Send again to use it anyway.',
    useSuggestion: 'Use it',
    errors: {
      email: 'That does not look like an email address.',
      /**
       * Reserved domains, which exist so that they never resolve. Says what to
       * do rather than what is wrong: somebody types example.com to get past
       * the form, and needs telling that this form is the way back in.
       */
      emailUndeliverable: 'That domain cannot receive mail. Use an address you can open.',
    },
  },

  trial: {
    notConfigured: 'Purchases are not set up in this build yet.',
    title: 'Start logging with RiceCal Pro',
    perks: {
      unlimited: 'Unlimited meal logging',
      scanning: 'Photo scanning',
      database: 'Local hawker food database',
    },
    yearly: 'Yearly',
    yearlyBadge: 'SAVE 45%',
    yearlyPrice: 'RM99.90',
    yearlyPerMonth: 'RM8.33 a month',
    monthly: 'Monthly',
    monthlyPrice: 'RM14.90 a month',
    assurance: 'No commitment, cancel any time',
    smallPrint: 'Free for 3 days, then RM99.90 a year.',
    start: 'Start free trial',
    later: 'Look around first',
  },

  viewOnly: {
    banner: 'Preview mode, logging locked',
    explainer: 'This is your day. Start your free trial to add to it.',
    lockedTitle: 'Logging is locked',
    lockedBody: 'Start your free trial to log your own meals.',
    unlock: 'Start free trial',
  },
} as const
