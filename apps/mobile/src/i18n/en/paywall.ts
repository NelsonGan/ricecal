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
     * NOT "start logging" any more. A free account logs — by camera three times
     * a day, by barcode and by search without limit — so a headline telling
     * somebody they need Pro to start is a sentence the app disproves on the
     * screen behind it. What Pro removes is the ceiling, which is what this
     * says.
     */
    title: 'No limits with RiceCal Pro',
    assurance: 'No commitment, cancel any time',
    /**
     * The same reassurance for a plan with nothing to cancel.
     *
     * Shown over the lifetime small print, which says "One payment. No
     * subscription, no renewal." — so the shared line was promising the reader
     * they could cancel a thing the sentence beneath it had just told them did
     * not renew. What a one-off purchase actually offers instead is the store's
     * own refund window, which is the true version of the same comfort.
     */
    assuranceLifetime: 'One payment, refundable through the store',
    /**
     * One line per plan rather than one line with the price and the period
     * interpolated. Lifetime has no trial, so "free for 7 days, then $119.99"
     * would be false about it — and a sentence assembled from a price and a
     * period word is a sentence no translator can reorder.
     */
    smallPrintYearly: 'Free for 7 days, then {{price}} a year.',
    smallPrintMonthly: 'Free for 7 days, then {{price}} a month.',
    smallPrintLifetime: 'One payment of {{price}}. No subscription, no renewal.',
    /**
     * Shown until the store answers, so the sentence is never half a price.
     * Deliberately not "cancel any time": the assurance line directly above
     * already says that, and the two together read as the same promise made
     * twice by someone worried it was not believed.
     */
    smallPrintPending: 'Free for 7 days.',
    start: 'Start free trial',
    startLifetime: 'Buy lifetime access',
    restore: 'Restore purchase',
    /** Two outcomes, and they used to share one sentence that assumed failure. */
    nothingToRestore: 'Nothing to restore on this account',
    notConfigured: 'Purchases are not set up in this build yet.',
    restored: 'Your purchase is back',
  },

  /**
   * The comparison table.
   *
   * WRITTEN AS TWO ANSWERS PER LINE, never as one sentence with a "but" in it.
   * A cell has room for about three words, and the discipline is what keeps the
   * table honest: "3 a day" against "Unlimited" is a fact a reader can act on,
   * where "limited scanning" against "unlimited scanning" is a sales line
   * repeated twice.
   *
   * The free column is mostly ticks and that is the point of having one. What
   * is being said is "you already have a working diary, here is what it does
   * not do yet", which only reads as generous if the ticks are real.
   *
   * NO NUMBER ON THE PRO SIDE OF `snap`. There is a ceiling — fifty a day — and
   * printing it would turn the row being sold into a restriction. Fifty
   * photographed meals in a day is not a diary, so "unlimited" is what the
   * sentence means to everybody who will ever read it.
   */
  table: {
    title: 'FREE VS PRO',
    free: 'Free',
    pro: 'Pro',
    /**
     * THE NUMBERS ARE INTERPOLATED, not written into the sentences. Each of
     * them is enforced in Postgres and mirrored in `@ricecal/shared`, and a
     * table that spelled "3 a day" in prose would be the copy nobody thinks to
     * change when the ceiling moves — a paywall promising three while the
     * database allows five is a support thread, and the other way round is a
     * refusal nobody can explain.
     */
    /**
     * Every row carries `free` and `pro`, including the ones drawn as a tick or
     * a dash, where they are empty. The bundle is TYPED — `t()` is checked
     * against these keys — and the table looks a row's value up by a template
     * literal, so a row missing one half would not typecheck at the call site
     * rather than at the row. Empty is also what they mean: a tick has no words.
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
      recipes: {
        label: 'Save what you cook',
        free: '{{recipes}} recipes',
        pro: 'Unlimited',
      },
      recipeFill: {
        label: 'Fill a recipe in from a photo',
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
        pro: 'For good',
      },
    },
  },

  /**
   * The paywall at the end of onboarding.
   *
   * Distinct copy from `hard` because the moment is different: this is the
   * first thing after the two permissions, addressed to somebody who has just
   * finished setting up and has not seen the app yet. "Later" is a real option
   * and is worded as one, not as a dismissal.
   *
   * There is no note under the buttons any more. It read "You can look around
   * first. Logging a meal needs Pro." — an apology for the button above it, and
   * a second statement of the offer to somebody who has just read the whole
   * page. "Maybe later" says what it does.
   */
  intro: {
    title: 'You are all set. Ready to log?',
    /**
     * The offer as it stands at the end of onboarding, to somebody who has not
     * used the app yet. It used to say Pro was what turned a photo into a
     * logged meal, which stopped being true the day the free tier got three of
     * those a day. What is left is the honest version: the app works, and Pro
     * takes the limits off it.
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
     * The detail line on an entry the trial has put out of reach. It used to
     * name the meal — "Lunch, locked" — and an entry has no meal any more; the
     * interpolation left behind rendered as ", locked".
     */
    lockedEntry: 'Locked',
    resume: 'Continue with Pro',
    browse: 'Keep browsing free',
  },

  /**
   * What a refusal says.
   *
   * THREE MESSAGES, because there are three different things to say and they
   * used to be two. A free account that has used today's three scans has
   * somewhere to go, and the paywall opens behind this toast; a Pro account
   * that has somehow reached fifty in one day has nowhere to go, so it is asked
   * to get in touch and shown nothing to buy; and an account whose subscription
   * has lapsed mid-request is told which of the two halves failed.
   *
   * The free message names the number, unlike its predecessor, because the
   * number can now be said: it counts plates rather than requests to a model,
   * so "3 today" is a sentence somebody can hold against their own morning.
   * "Tomorrow" is the other half of it — a ceiling with no stated end reads as
   * the feature being taken away.
   */
  limit: {
    freeReached: 'That is your {{count}} scans for today. Pro scans as much as you like.',
    proReached: "You have hit today's scanning limit. Please contact admin.",
    notEntitled: 'Your subscription is not active, so this one needs Pro.',
  },

  welcome: {
    // Was "You are in. Jom makan." — "jom makan" is Malay for "let's eat", and
    // it was the one place the English copy switched language to name who the
    // app is for. The catalogue reaches across Asia and beyond, so the welcome
    // greets everybody in the language they are reading it in.
    title: "You are in. Let's eat.",
    body: 'Trial active for 7 days. Everything is unlocked, nothing to set up.',
    bodyLifetime: 'RiceCal Pro is yours for good. Everything is unlocked, nothing to set up.',
    perks: {
      // The three ways in, and they have to stay the three ways in: this is a
      // promise made to somebody at the moment they pay.
      log: 'Log by photo, by barcode or in your own words',
      database: 'The full food database',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    manageNoteLifetime: 'Paid once. There is nothing to renew or cancel.',
    start: 'Log my first meal',
  },
} as const
