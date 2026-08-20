export const paywall = {
  /**
   * No prices live here, and that is the point.
   *
   * They used to. It was wrong three ways at once: a Malaysian user read "$29.99"
   * while being charged RM119.90, Apple and Play disagreed on the lifetime figure
   * because Apple has no 119.90 price point for a one-time purchase, and every
   * repricing needed an app release before the paywall stopped lying. Every price
   * on screen now comes from `usePlanPrices`, which reads the store's own localised
   * `priceString` through RevenueCat.
   *
   * What is left here is the words around the number, and the interpolation slots
   * those numbers drop into.
   *
   * The line below is for offline, or a check that failed. Not the same as "you
   * have not paid".
   */
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
     * Shown over the lifetime small print, which says "One payment. No subscription,
     * no renewal.", so the shared line was promising the reader they could cancel a
     * thing the sentence beneath it had just told them did not renew. What a one-off
     * purchase actually offers instead is the store's own refund window.
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
   * Written as two answers per line, never as one sentence with a "but" in it. A
   * cell has room for about three words, and the discipline is what keeps the table
   * honest: "3 a day" against "Unlimited" is a fact a reader can act on, where
   * "limited scanning" against "unlimited scanning" is a sales line repeated twice.
   *
   * The free column is mostly ticks and that is the point of having one. What is
   * being said is "you already have a working diary, here is what it does not do
   * yet", which only reads as generous if the ticks are real.
   *
   * No number on the Pro side of `snap`. There is a ceiling, fifty a day, and
   * printing it would turn the row being sold into a restriction. Fifty
   * photographed meals in a day is not a diary.
   */
  table: {
    title: 'FREE VS PRO',
    free: 'Free',
    pro: 'Pro',
    /**
     * The numbers are interpolated rather than written into the sentences. Each is
     * enforced in Postgres and mirrored in `@ricecal/shared`, and a table that spelled
     * "3 a day" in prose would be the copy nobody thinks to change when the ceiling
     * moves: a paywall promising three while the database allows five is a support
     * thread, and the other way round is a refusal nobody can explain.
     *
     * Every row carries `free` and `pro`, including the ones drawn as a tick or a
     * dash, where they are empty. The bundle is typed and the table looks a row's
     * value up by a template literal, so a row missing one half would not typecheck.
     * Empty is also what they mean: a tick has no words.
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
        // "Unlimited" rather than "For good", which is the word the two rows
        // above it use for the same answer. A table read down a column is read
        // for where it CHANGES, and three ways of writing "no ceiling" make a
        // reader stop and work out whether they mean different things.
        pro: 'Unlimited',
      },
    },
  },

  /**
   * The paywall at the end of onboarding.
   *
   * Distinct copy from `hard` because the moment is different: this is the first
   * thing after the two permissions, addressed to somebody who has just finished
   * setting up and has not seen the app yet. "Later" is a real option and is worded
   * as one.
   *
   * There is no note under the buttons any more. It read "You can look around
   * first. Logging a meal needs Pro.", which was an apology for the button above it
   * and a second statement of the offer.
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
   * A refusal names what it refused, and it used to name nothing. There was one line
   * for every Pro-only button in the app, argued for on the grounds that the
   * difference between "describing a meal needs Pro" and "asking what to eat needs
   * Pro" is writing rather than information. That is true of the paywall, which is
   * why there is still only one of those, and false of the toast: the toast is the
   * only thing on screen that can say which of the buttons under a thumb declined
   * to work.
   *
   * Beyond that there are three messages about the allowance rather than about a
   * feature. A free account that has used today's three scans has somewhere to go,
   * and the paywall opens behind this toast; a Pro account that has somehow reached
   * fifty in one day has nowhere to go, so it is asked to get in touch; and an
   * account whose subscription lapsed mid-request is told which half failed.
   *
   * The free message names the number, unlike its predecessor, because the number
   * can now be said: it counts plates rather than requests to a model.
   */
  limit: {
    freeReached: 'That is your {{count}} scans for today. Pro scans as much as you like.',
    proReached: "You have hit today's scanning limit. Please contact admin.",
    /**
     * The lapsed case, as the second line under the feature sentence.
     *
     * It was the whole message ("Your subscription is not active, so this one needs
     * Pro.") which led with our bookkeeping and never said what had been refused.
     * Which button was pressed is the part the user needs; why the server said no is
     * the footnote.
     */
    notEntitledDetail: 'Your subscription is not active.',
    /**
     * The store says this account has paid and our own copy of that has not caught up
     * yet, which is the few seconds between a purchase settling and the webhook
     * writing the row.
     *
     * A separate sentence because the alternative is the worst thing this app can do
     * with a refusal: show a paywall to somebody who has just bought it. What they
     * need to hear is that the purchase is fine and the app is a moment behind.
     */
    confirming: 'Your purchase is going through. Give it a moment and try again.',
    /**
     * One line per gated thing, keyed by the same `ProFeature` the funnel is broken
     * down by, so a sentence and the event that goes with it cannot name two
     * different features.
     *
     * Written as the thing that was just attempted rather than as the feature's name
     * in a table: "Fixing a meal by describing it" rather than "Fix". The reader has
     * a finger on the button, and a sentence that repeats what they did is what makes
     * the price list behind it read as an answer.
     *
     * Kept to one short sentence each. A toast is on screen for four seconds and the
     * paywall arrives underneath it.
     *
     * `camera` is here for completeness rather than for the common case: a fourth
     * photographed plate is an allowance, and `freeReached` above is what says so.
     * This is the line for a camera scan refused because the subscription lapsed.
     */
    feature: {
      camera: 'Scanning another plate today needs RiceCal Pro.',
      describe: 'Saying what you ate in words needs RiceCal Pro.',
      refine: 'Fixing a meal by describing it needs RiceCal Pro.',
      read_recipe: 'Filling a recipe in from a photo needs RiceCal Pro.',
      new_recipe: 'Keeping more than {{recipes}} recipes needs RiceCal Pro.',
      suggest: 'Asking what to eat next needs RiceCal Pro.',
      trend_range: 'Looking back further than a week needs RiceCal Pro.',
      review: 'Reading an older review needs RiceCal Pro.',
      /**
       * The standing offer, which no button refused. See `useProNudge`: nothing
       * was declined here, so the sentence is an offer rather than a refusal.
       */
      nudge: 'RiceCal Pro takes the limits off.',
    },
  },

  /**
   * The gate was tapped before the answer to "has this account paid" arrived.
   *
   * Almost always a fraction of a second, and it used to be silent: the button
   * simply did nothing, which is indistinguishable from a broken control. It says
   * what is happening instead, and it does not open the paywall, because nobody has
   * been refused anything yet.
   */
  checking: 'Just a moment, we are checking your plan.',

  welcome: {
    // Was "You are in. Jom makan." — "jom makan" is Malay for "let's eat", and
    // it was the one place the English copy switched language to name who the
    // app is for. The catalogue reaches across Asia and beyond, so the welcome
    // greets everybody in the language they are reading it in.
    title: "You are in. Let's eat.",
    /**
     * One short line, and every one of these used to be two.
     *
     * "Everything is unlocked, nothing to set up" is the same fact twice: there is
     * nothing to set up because everything is unlocked. A receipt is read in a second
     * and left, and what somebody wants off it is confirmation that the thing they
     * paid for is theirs.
     *
     * Said at all only when the store actually started a trial. It was said to
     * everybody who was not buying lifetime, and the app has no business promising a
     * trial the store did not give: an introductory offer is once per account per
     * subscription group, so anybody resubscribing was charged immediately and told
     * they had a week free. `usePlanSummary` reads the period type off the purchase
     * rather than off the button that was pressed.
     */
    body: 'Your 7 free days start now. Everything is unlocked.',
    /** Paid straight away: a resubscriber, or an account with no offer left. */
    bodyActive: 'Everything is unlocked.',
    bodyLifetime: 'RiceCal Pro is yours for good. Everything is unlocked.',
    /**
     * Three or four words each, because they are captions under a glyph rather than
     * lines of a list. See `PERKS` in `app/paywall/welcome.tsx`.
     *
     * The three ways in have to stay one of them: this is a promise made to somebody
     * at the moment they pay. What is new is the third, which is the newest thing Pro
     * does and was missing from a screen that went on describing a two-feature
     * product.
     */
    perks: {
      log: 'Snap, scan or say it',
      database: 'Every dish and packet',
      suggest: 'Ask what to eat',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    manageNoteLifetime: 'Paid once. There is nothing to renew or cancel.',
    // NOT "Log my first meal", which is what it said while this button also
    // raised the log sheet. That sheet opens on the camera, so the words and the
    // action agreed with each other and both were wrong: a purchase should hand
    // somebody their app back, not point them at one feature of it.
    start: 'Go to my diary',
  },
} as const
