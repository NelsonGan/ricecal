export const paywall = {
  /**
   * Prices are written out here rather than read off the store.
   *
   * They are the USD list prices, and every store shows the buyer their own
   * currency at the moment of purchase, so what a Malaysian user is charged is
   * a RM figure this file never sees. That is a known gap rather than an
   * oversight: RevenueCat hands back a localised price string per package, and
   * the screens should read it once the SDK is switched on. Until then these
   * are the reference prices the products were created with, in one place, so
   * there is a single line to change per plan.
   */
  plans: {
    yearly: 'Yearly',
    yearlyBadge: 'SAVE 50%',
    yearlyPrice: '$29.99',
    yearlyPerMonth: '$2.50 a month',
    monthly: 'Monthly',
    monthlyBilling: 'Billed every month',
    monthlyPrice: '$4.99',
    lifetime: 'Lifetime',
    lifetimeBadge: 'PAY ONCE',
    lifetimePrice: '$119.99',
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
    smallPrintYearly: 'Free for 7 days, then $29.99 a year. Cancel any time.',
    smallPrintMonthly: 'Free for 7 days, then $4.99 a month. Cancel any time.',
    smallPrintLifetime: 'One payment of $119.99. No subscription, no renewal.',
    start: 'Start free trial',
    startLifetime: 'Buy lifetime access',
    restore: 'Restore purchase',
    notConfigured: 'Purchases are not set up in this build yet.',
    restored: 'Nothing to restore on this account',
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
    perks: {
      // The three ways in, and they have to stay the three ways in: this is a
      // promise made to somebody at the moment they pay.
      log: 'Log by photo, by barcode or in your own words',
      database: 'Full local food database',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    start: 'Log my first meal',
  },
} as const
