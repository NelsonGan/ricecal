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
  /** Offline, or the check itself failed. Not the same as "you have not paid". */
  couldNotCheck: 'We could not check your subscription. Try again in a moment.',

  plans: {
    yearly: 'Yearly',
    /**
     * The yearly price divided over twelve months, which is the comparison
     * somebody makes against the monthly plan. The store hands back a
     * formatted figure and nothing else, so the unit is added here — without
     * it the card read "$2.49" under "$29.90" with no clue that the two are
     * not the same kind of number.
     */
    perMonth: '{{price}} a month',
    /** The percentage is computed from the two live prices, never assumed. */
    yearlyBadge: 'SAVE {{percent}}%',
    monthly: 'Monthly',
    monthlyBilling: 'Billed every month',
    lifetime: 'Lifetime',
    lifetimeBadge: 'PAY ONCE',
    lifetimeDetail: 'One payment, yours for good',
  },

  hard: {
    /** The bar on the pushed page. The screen's own headline is `title`. */
    appBar: 'RiceCal Pro',
    title: 'Start logging with RiceCal Pro',
    /**
     * Says outright that there is no free tier, because the alternative is
     * somebody hunting the screen for the catch. Everything the app does is
     * listed below it, so the claim is checkable rather than a boast.
     */
    subtitle: 'One plan, everything in it. There is no limited free version to compare against.',
    everything: 'EVERYTHING YOU GET',
    /**
     * All of it, in the order somebody meets it: the four ways a meal gets in,
     * then what the app does with it, then what it does over time.
     *
     * Each line is what the feature IS, not what it is called. "Recipes" tells
     * a reader nothing they could not guess; "enter what went in and how many
     * it feeds, once" tells them why it is worth having.
     */
    features: {
      snap: {
        title: 'Snap a plate',
        body: 'Every dish on it named, sized and priced.',
      },
      describe: {
        title: 'Or just say what you ate',
        body: '"Nasi lemak with fried chicken and a teh tarik."',
      },
      barcode: {
        title: 'Scan a packet',
        body: 'Three million barcoded products, read off the label.',
      },
      search: {
        title: 'Search the food database',
        body: 'Hawker dishes, chains and home cooking from across Asia.',
      },
      recipes: {
        title: 'Save what you cook',
        body: 'Enter what went in and how many it feeds, once. Then one tap.',
      },
      budget: {
        title: 'A calorie budget that fits you',
        body: 'Worked out from your body and your goal, and kept up to date.',
      },
      health: {
        title: 'Apple Health and Health Connect',
        body: 'What you burn is added to what you can eat, never taken off it.',
      },
      trends: {
        title: 'Trends and weight',
        body: 'Where the week went, and whether it is moving.',
      },
      reviews: {
        title: 'Weekly and monthly reviews',
        body: 'A finished week, read as a few cards you can share.',
      },
      reminders: {
        title: 'Meal reminders',
        body: 'At your own mealtimes, in your own timezone.',
      },
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
