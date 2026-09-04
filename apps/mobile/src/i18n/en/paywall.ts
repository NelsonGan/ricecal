export const paywall = {
  /**
   * No prices live here. They used to, and it was wrong three ways: a Malaysian
   * user read "$29.99" while being charged RM119.90, Apple and Play disagreed on
   * the lifetime figure, and every repricing needed an app release before the
   * paywall stopped lying. Prices come from `usePlanPrices` now, which reads the
   * store's own localised `priceString`.
   *
   * What is left is the words around the number and the slots it drops into.
   *
   * The line below is for offline, or a check that failed, which is not the same
   * as "you have not paid".
   */
  couldNotCheck: 'We could not check your subscription. Try again in a moment.',

  plans: {
    yearly: 'Yearly',
    /**
     * The yearly price over twelve months, which is the comparison somebody
     * makes against the monthly plan. The store hands back a formatted figure
     * and nothing else, so the unit is added here, or the card reads "$2.49"
     * under "$29.90" with no clue that they are different kinds of number.
     */
    perMonth: '{{price}} a month',
    /** The percentage is computed from the two live prices, never assumed. */
    yearlyBadge: 'SAVE {{percent}}%',
    yearlyBilling: 'Billed every year',
    monthly: 'Monthly',
    monthlyBilling: 'Billed every month',
    lifetime: 'Lifetime',
    lifetimeDetail: 'One payment, yours for good',
  },

  hard: {
    /** The bar on the pushed page. The screen's own headline is `title`. */
    appBar: 'RiceCal Pro',
    /**
     * Not "start logging". A free account logs, by camera three times a day and
     * by barcode and search without limit, so a headline saying they need Pro to
     * start is disproved by the screen behind it. Pro removes the ceiling.
     */
    title: 'No limits with RiceCal Pro',
    assurance: 'No commitment, cancel any time',
    /**
     * The same reassurance for a plan with nothing to cancel. The shared line sat
     * over "One payment. No subscription, no renewal.", promising the reader they
     * could cancel a thing the sentence beneath said did not renew. What a
     * one-off purchase offers is the store's own refund window.
     */
    assuranceLifetime: 'One payment, refundable through the store',
    /**
     * One line per plan rather than one with the price and period interpolated.
     * Lifetime has no trial, so "free for 7 days, then $119.99" would be false
     * about it, and an assembled sentence is one no translator can reorder.
     */
    smallPrintYearly: 'Free for 7 days, then {{price}} a year.',
    smallPrintMonthly: 'Free for 7 days, then {{price}} a month.',
    smallPrintLifetime: 'One payment of {{price}}. No subscription, no renewal.',
    /**
     * Shown until the store answers, so the sentence is never half a price. Not
     * "cancel any time": the assurance line above says that, and twice reads as a
     * promise made by somebody worried it was not believed.
     */
    smallPrintPending: 'Free for 7 days.',
    start: 'Start free trial',
    startLifetime: 'Buy lifetime access',
    restore: 'Restore purchase',
    /**
     * The two links guideline 3.1.2 requires beside a subscription price. Short,
     * because they sit side by side under the small print.
     */
    terms: 'Terms',
    privacy: 'Privacy',
    /** Two outcomes, and they used to share one sentence that assumed failure. */
    nothingToRestore: 'Nothing to restore on this account',
    notConfigured: 'Purchases are not set up in this build yet.',
    restored: 'Your purchase is back',
  },

  /**
   * The comparison table, written as two answers per line rather than one
   * sentence with a "but" in it. A cell has room for about three words, and the
   * discipline keeps it honest: "3 a day" against "Unlimited" is a fact a reader
   * can act on, where "limited scanning" against "unlimited scanning" is a sales
   * line repeated twice.
   *
   * The free column is mostly ticks, which is the point of having one: "you
   * already have a working diary, here is what it does not do yet" only reads as
   * generous if the ticks are real.
   *
   * No number on the Pro side of `snap`. The ceiling is fifty a day, and printing
   * it would turn the row being sold into a restriction.
   */
  table: {
    title: 'FREE VS PRO',
    free: 'Free',
    pro: 'Pro',
    /**
     * The numbers are interpolated rather than written into the sentences. Each is
     * enforced in Postgres and mirrored in `@ricecal/shared`, and prose would be
     * the copy nobody thinks to change when the ceiling moves.
     *
     * Every row carries `free` and `pro`, empty on the ones drawn as a tick or a
     * dash: the bundle is typed and the table looks a value up by template
     * literal, so a missing half would not typecheck.
     */
    rows: {
      snap: {
        label: 'Snap a plate',
        // "3/day" rather than "3 a day": this is a VALUE in a narrow column
        // beside "Unlimited", not a sentence, and the slashed form is how a
        // rate is written when it has to sit in a table cell.
        free: '{{scans}}/day',
        pro: 'Unlimited',
      },
      describe: {
        label: 'Say what you ate, in words',
        free: '',
        pro: '',
      },
      barcode: {
        label: 'Scan a packet',
        free: '',
        pro: '',
      },
      search: {
        label: 'Search the food database',
        free: '',
        pro: '',
      },
      fix: {
        label: 'Fix a meal by describing it',
        free: '',
        pro: '',
      },
      suggest: {
        label: 'Ask what to eat next',
        free: '',
        pro: '',
      },
      recipes: {
        label: 'Save what you cook',
        free: '{{recipes}} foods',
        pro: 'Unlimited',
      },
      recipeFill: {
        label: 'Fill a food in from a photo',
        free: '',
        pro: '',
      },
      budget: {
        label: 'A calorie budget that fits you',
        free: '',
        pro: '',
      },
      health: {
        label: 'Apple Health and Health Connect',
        free: '',
        pro: '',
      },
      reminders: {
        label: 'Meal reminders',
        free: '',
        pro: '',
      },
      trends: {
        label: 'Trends',
        free: '7 days',
        pro: 'Up to a year',
      },
      reviews: {
        label: 'Weekly and monthly reviews',
        free: 'Latest week',
        pro: 'Every one',
      },
      photos: {
        label: 'Your meal photos',
        // "Kept 30 days" wrapped to two lines in a column sized for
        // "Unlimited"; the row's own label already supplies the verb.
        free: '{{days}} days',
        // "Unlimited" rather than "For good", which the two rows above use for
        // the same answer. A column is read for where it changes, and three ways
        // of writing "no ceiling" make a reader stop and compare them.
        pro: 'Unlimited',
      },
    },
  },

  /**
   * The paywall at the end of onboarding. Distinct from `hard` because the moment
   * is: this is the first thing after the two permissions, addressed to somebody
   * who has not seen the app yet, and "Later" is a real option worded as one.
   *
   * No note under the buttons. It read "You can look around first. Logging a meal
   * needs Pro.", which was an apology for the button above it.
   */
  intro: {
    title: 'You are all set. Ready to log?',
    /**
     * The offer at the end of onboarding, to somebody who has not used the app.
     * It used to say Pro was what turned a photo into a logged meal, which
     * stopped being true the day the free tier got three a day.
     */
    body: 'Everything works without it. Pro takes the limits off.',
    later: 'Maybe later',
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
     * The detail line on an entry the trial has put out of reach. It used to name
     * the meal, and an entry has no meal any more, so the leftover interpolation
     * rendered as ", locked".
     */
    lockedEntry: 'Locked',
    resume: 'Continue with Pro',
    /**
     * What "Continue with Pro" charges for, said on the screen that charges. This
     * sells one plan with one tap, and for a while said nothing about price,
     * period or renewal, all three of which guideline 3.1.2 requires beside the
     * button.
     *
     * Not `hard.smallPrintYearly`, which reads "Free for 7 days, then...":
     * everybody who sees this screen has just finished that trial.
     */
    terms: '{{price}} a year, renewing until you cancel.',
    /** Until the store answers, so the sentence is never half a price. */
    termsPending: 'Renews yearly until you cancel.',
    browse: 'Keep browsing free',
  },

  /**
   * What a refusal says.
   *
   * A refusal names what it refused. One line served every Pro-only button once,
   * on the grounds that the difference is writing rather than information. That
   * is true of the paywall, which is why there is still only one, and false of
   * the toast: the toast is the only thing that can say which button declined.
   *
   * Three of these are about the allowance rather than a feature. A free account
   * out of scans has somewhere to go, and the paywall opens behind the toast; a
   * Pro account at fifty in one day is asked to get in touch; and an account
   * whose subscription lapsed mid-request is told which half failed.
   *
   * The free message names the number, because it counts plates rather than
   * requests to a model.
   */
  limit: {
    freeReached: 'That is your {{count}} scans for today. Pro scans as much as you like.',
    proReached: "You have hit today's scanning limit. Please contact admin.",
    /**
     * The lapsed case, as the second line under the feature sentence.
     */
    notEntitledDetail: 'Your subscription is not active.',
    /**
     * The store says this account has paid and our copy has not caught up, which
     * is the few seconds between a purchase settling and the webhook writing the
     * row. A separate sentence, because the alternative is showing a paywall to
     * somebody who has just bought it.
     */
    confirming: 'Your purchase is going through. Give it a moment and try again.',
    /**
     * One line per gated thing, keyed by the same `ProFeature` the funnel breaks
     * down by, so a sentence and its event cannot name different features.
     *
     * Written as the thing just attempted rather than the feature's name:
     * "Fixing a meal by describing it" rather than "Fix". One short sentence
     * each, since a toast is on screen for four seconds with the paywall arriving
     * underneath.
     *
     * `camera` is for the uncommon case: a fourth photographed plate is an
     * allowance and `freeReached` says so, where this is a camera scan refused
     * because the subscription lapsed.
     */
    feature: {
      camera: 'Scanning another plate today needs RiceCal Pro.',
      describe: 'Saying what you ate in words needs RiceCal Pro.',
      refine: 'Fixing a meal by describing it needs RiceCal Pro.',
      read_recipe: 'Filling a food in from a photo needs RiceCal Pro.',
      new_recipe: 'Keeping more than {{recipes}} foods of your own needs RiceCal Pro.',
      suggest: 'Asking what to eat next needs RiceCal Pro.',
      trend_range: 'Looking back further than a week needs RiceCal Pro.',
      review: 'Reading an older review needs RiceCal Pro.',
      /**
       * The standing offer, which no button refused, so the sentence is an offer
       * rather than a refusal. See `useProNudge`.
       */
      nudge: 'RiceCal Pro takes the limits off.',
    },
  },

  /**
   * The gate was tapped before the answer to "has this account paid" arrived.
   * Almost always a fraction of a second, and it used to be silent, which is
   * indistinguishable from a broken control. No paywall, because nobody has been
   * refused anything yet.
   */
  checking: 'Just a moment, we are checking your plan.',

  welcome: {
    // Was "You are in. Jom makan.", the one place the English copy switched
    // language to name who the app is for. The catalogue reaches across Asia and
    // beyond, so the welcome greets everybody in the language they are reading.
    title: "You are in. Let's eat.",
    /**
     * One short line, where each of these used to be two. "Everything is
     * unlocked, nothing to set up" is the same fact twice, and a receipt is read
     * in a second and left.
     *
     * Said only when the store actually started a trial. It was said to everybody
     * not buying lifetime, and an introductory offer is once per account per
     * subscription group, so anybody resubscribing was charged immediately and
     * told they had a week free. `usePlanSummary` reads the period type off the
     * purchase rather than the button that was pressed.
     */
    body: 'Your 7 free days start now. Everything is unlocked.',
    /** Paid straight away: a resubscriber, or an account with no offer left. */
    bodyActive: 'Everything is unlocked.',
    bodyLifetime: 'RiceCal Pro is yours for good. Everything is unlocked.',
    /**
     * Three or four words each, because they are captions under a glyph rather
     * than lines of a list. See `PERKS` in `app/paywall/welcome.tsx`.
     */
    perks: {
      log: 'Snap, scan or say it',
      database: 'Every dish and packet',
      suggest: 'Ask what to eat',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    manageNoteLifetime: 'Paid once. There is nothing to renew or cancel.',
    // Not "Log my first meal", which it said while this button also raised the
    // log sheet: a purchase should hand somebody their app back rather than
    // pointing them at one feature of it.
    start: 'Go to my diary',
  },
} as const
