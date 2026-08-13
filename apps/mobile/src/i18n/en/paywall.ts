export const paywall = {
  /**
   * NO PRICES LIVE HERE, and that is the point.
   *
   * They used to. It was wrong three ways at once: a Malaysian user read
   * "$29.99" while being charged RM119.90, Apple and Play disagreed on the
   * lifetime figure because Apple has no 119.90 price point for a one-time
   * purchase, and every repricing needed an app release before the paywall
   * stopped lying. Every price on screen now comes from `usePlanPrices`, which
   * reads the store's own localised `priceString` through RevenueCat.
   *
   * What is left here is the words around the number, and the interpolation
   * slots those numbers drop into.
   */
  plans: {
    yearly: 'Yearly',
    /** The percentage is computed from the two live prices, never assumed. */
    yearlyBadge: 'SAVE {{percent}}%',
    monthly: 'Monthly',
    monthlyBilling: 'Billed every month',
    lifetime: 'Lifetime',
    lifetimeBadge: 'PAY ONCE',
    lifetimeDetail: 'One payment, yours for good',
  },

  hard: {
    title: 'Start logging with RiceCal Pro',
    perks: {
      unlimited: 'Unlimited meal logging',
      scanning: 'Photo scanning',
      database: 'Local hawker food database',
    },
    assurance: 'No commitment, cancel any time',
    /**
     * One line per plan rather than one line with the price and the period
     * interpolated. Lifetime has no trial, so "free for 7 days, then $119.99"
     * would be false about it — and a sentence assembled from a price and a
     * period word is a sentence no translator can reorder.
     */
    smallPrintYearly: 'Free for 7 days, then {{price}} a year. Cancel any time.',
    smallPrintMonthly: 'Free for 7 days, then {{price}} a month. Cancel any time.',
    smallPrintLifetime: 'One payment of {{price}}. No subscription, no renewal.',
    /** Shown until the store answers, so the sentence is never half a price. */
    smallPrintPending: 'Cancel any time.',
    start: 'Start free trial',
    startLifetime: 'Buy lifetime access',
    restore: 'Restore purchase',
    /** Two outcomes, and they used to share one sentence that assumed failure. */
    nothingToRestore: 'Nothing to restore on this account',
    notConfigured: 'Purchases are not set up in this build yet.',
    restored: 'Your purchase is back',
  },

  /**
   * The paywall at the end of onboarding.
   *
   * Distinct copy from `hard` because the moment is different: this is the
   * first thing after the tour, addressed to somebody who has just finished
   * setting up and has not seen the app yet. "Later" is a real option and is
   * worded as one, not as a dismissal.
   */
  intro: {
    title: 'You are all set. Ready to log?',
    body: 'Pro is what turns a photo of your plate into a logged meal.',
    later: 'Maybe later',
    laterNote: 'You can look around first. Logging a meal needs Pro.',
  },

  reminder: {
    title_one: '{{count}} day left in your trial',
    title_other: '{{count}} days left in your trial',
    body: 'You have logged {{days}} days in a row and dropped {{kg}} kg. Keep the run going.',
    daysLogged: 'DAYS LOGGED',
    meals: 'MEALS',
    kgDown: 'KG DOWN',
    starts: 'Your plan starts {{date}} at {{price}} a year.',
    keep: 'Keep my plan',
    manage: 'Manage subscription',
  },

  ended: {
    heading: 'Today',
    previewMode: 'Preview mode',
    title: 'Your trial has ended',
    body: 'Your {{days}} days of history are safe and still readable.',
    dataWaiting: 'YOUR DATA IS WAITING',
    days: 'DAYS',
    meals: 'MEALS',
    kgDown: 'KG DOWN',
    /**
     * The detail line on an entry the trial has put out of reach. It used to
     * name the meal — "Lunch, locked" — and an entry has no meal any more; the
     * interpolation left behind rendered as ", locked".
     */
    lockedEntry: 'Locked',
    resume: 'Continue with Pro',
    browse: 'Keep browsing free',
  },

  gate: {
    photo: {
      title: 'Photo logging is a Pro feature',
      body: 'Point at your plate and we name every item on it.',
      perks: {
        multiItem: 'Multi item plate detection',
        portion: 'Portion size estimates',
        offline: 'Works offline for saved foods',
      },
    },
    /**
     * The perks are about what the model does with a sentence rather than how
     * the sentence arrived, which is why none of them mentions typing.
     */
    describe: {
      title: 'Describing a meal is a Pro feature',
      body: 'Write down what you ate and we work out the rest.',
      perks: {
        multiItem: 'Several dishes in one sentence',
        portion: 'Portion words like "half a plate"',
        offline: 'Works offline for saved foods',
      },
    },
    /**
     * The plainest of the three, and the one reached most often: searching,
     * scanning a barcode and opening a dish are all free, so this is the wall
     * at the very last tap. It does not oversell, because the user has already
     * seen the dish and the calories and picked their portion.
     */
    log: {
      title: 'Logging a meal is a Pro feature',
      body: 'Search, scan and browse as much as you like. Saving it to your diary needs Pro.',
      perks: {
        multiItem: 'Every way in: photo, words, barcode, search',
        portion: 'Your whole diary, trends and weekly reviews',
        offline: 'Recipes you cook at home, logged in one tap',
      },
    },
    whatYouGet: 'WHAT YOU GET',
    freeNote: 'You can still search and browse the food database for free.',
    start: 'Try free for 7 days',
    searchInstead: 'Search instead',
    /** The way out of the `log` gate, which has no better offer to make. */
    notNow: 'Not now',
    /** Offline, or the check itself failed. Not the same as "you have not paid". */
    couldNotCheck: 'We could not check your subscription. Try again in a moment.',
  },

  /**
   * The monthly ceiling on model requests.
   *
   * Deliberately does NOT name the number. It is a fair-use limit somebody
   * reaches by scanning a hundred meals a day, and printing "3,000" invites
   * the reply that they have only logged forty things this week, which counts
   * requests rather than meals and is a conversation the toast cannot win.
   * The settings screen shows the figure, where there is room to explain it.
   */
  limit: {
    reached: 'You have reached your monthly scanning limit. Please contact admin.',
    notEntitled: 'Your subscription is not active. Photo and describe need Pro.',
    /** The settings card, where the count belongs. */
    title: 'AI USAGE',
    used: 'This month',
    usage: '{{used}} of {{limit}}',
    note: 'Photo scans, described meals and corrections each use one or more requests. The count resets on the first of the month.',
  },

  welcome: {
    title: 'You are in. Jom makan.',
    body: 'Trial active for 7 days. Everything is unlocked, nothing to set up.',
    bodyLifetime: 'RiceCal Pro is yours for good. Everything is unlocked, nothing to set up.',
    perks: {
      // The three ways in, and they have to stay the three ways in: this is a
      // promise made to somebody at the moment they pay.
      log: 'Log by photo, by barcode or in your own words',
      database: 'Full local food database',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    manageNoteLifetime: 'Paid once. There is nothing to renew or cancel.',
    start: 'Log my first meal',
  },
} as const
