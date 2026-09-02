export const profile = {
  home: {
    title: 'Me',
    memberSince: 'Member since {{month}}',
    streak: 'STREAK',
    // No `weight` key: that tile's label is the unit symbol itself, and it
    // comes from `common:unit.*` so it can follow the account's setting.
    goal: 'GOAL',
    pro: 'RiceCal Pro',
    proTrial: 'Trial ends {{when}}',
    proTrialTomorrow: 'tomorrow',
    proTrialOn: 'on {{date}}',
    noName: 'Your account',
    signOutTitle: 'Sign out?',
    signOutBody: 'Your log stays safe. Sign back in on any phone to pick it up.',
    proTrialIn_one: 'in {{count}} day',
    proTrialIn_other: 'in {{count}} days',
    /**
     * The plan is interpolated. "Yearly plan, active" was printed to every
     * subscriber there is, including lifetime buyers and promotional grants. The
     * name comes from `paywall:plans`, the list the paywall sells them under.
     */
    proActive: '{{plan}} plan, active',
    /**
     * For an entitlement whose plan we cannot name — a promotional grant, or a
     * store product this build has never heard of. `subscriptions.plan` is null
     * there by design (see `planOf`), and guessing one is how the screen came
     * to claim a yearly subscription for somebody who had been given a month.
     */
    proActivePlain: 'Pro, active',
    proNone: 'Free plan',
    metric: 'Metric',
    imperial: 'Imperial',
    settings: 'SETTINGS',
    personalisation: 'Personalisation',
    goals: 'Goals and targets',
    goalsValue: '{{kcal}} kcal',
    reminders: 'Reminders',
    remindersValue: '{{count}} on',
    /**
     * Beside the health-sync row when nothing is connected. The connected case
     * reuses `activity:provider.*`, which names each store.
     */
    healthOff: 'Not connected',
    /**
     * Short, and it has to be: this row carries a value and a chevron, and the
     * screen it opens puts the same words in an `AppBar`. Both truncate past
     * about twenty characters, so "Language, units and appearance" rendered as
     * "Language, units and a…".
     *
     * The name gives up the third card rather than the first two: appearance is
     * one segmented control found the moment the screen opens.
     */
    units: 'Language and units',
    /** The four-card tour, which is offered once on Today and lives here after. */
    tutorial: 'How RiceCal works',
    help: 'Help centre',
    /**
     * The permanent way to the rating sheet, for the same reason the tour has
     * one: the automatic ask is gated to roughly once a release, so somebody who
     * dismissed it and then changed their mind has no other route back.
     */
    rate: 'Rate RiceCal',
    /** The row that leads to deletion. See the `account` block below. */
    account: 'Account',
    signOut: 'Sign out',
  },

  /**
   * The account screen, which exists so deleting an account is something a
   * person can do rather than ask for.
   *
   * App Review guideline 5.1.1(v) shapes the copy more than it looks: no form,
   * no reason to give, nobody to write to, and no wording that reads as a plea
   * to stay.
   *
   * It says what goes, in four lines, which is the whole defence against a
   * mis-tap: "this cannot be undone" is a sentence everybody scrolls past, where
   * "every meal, every weigh-in, every photograph" is the same fact in terms of
   * what the person would miss.
   *
   * The subscription line is not a warning about us. Billing lives with Apple and
   * Google, so a deleted account with a renewing subscription goes on being
   * charged, and it is only shown to somebody who has one.
   */
  account: {
    title: 'Account',
    signedInAs: 'SIGNED IN AS',

    /** Card title, so caps, like the ones around it. */
    legalTitle: 'THE SMALL PRINT',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',

    /** A card title, so caps, like `home.settings` and `connect.readTitle`. */
    deleteTitle: 'DELETE YOUR ACCOUNT',
    deleteBody: 'Everything below is erased the moment you confirm.',
    goesDiary: 'Every meal, weigh-in, water and note',
    goesPhotos: 'Every photograph you took',
    goesRecipes: 'Your recipes, published ones included',
    goesProfile: 'Your profile, settings and sign-in',
    /** Only where a renewing subscription exists. */
    cancelFirst: 'Cancel your subscription in the store first, or it keeps being charged.',
    action: 'Delete my account',

    confirmTitle: 'Delete your account?',
    confirmBody:
      'This cannot be undone. Your diary cannot be recovered afterwards, by you or by us.',
    /**
     * No `confirmAction`: the sheet's confirm button says `common:action.delete`,
     * the word every other destructive confirmation uses. "Delete for ever" broke
     * across two lines at `ConfirmSheet`'s equal button widths, and the finality
     * is already in the sentence above it.
     */

    done: 'Your account has been deleted.',
    failed: 'We could not delete your account. Please try again.',
  },

  /**
   * The question the app asks before the store does, and it is a question rather
   * than a request: "rate us five stars" is the copy that earns one star. Both
   * answers are wanted, so "I like it" and "Not really" are the same size and
   * neither is dressed as the correct one.
   *
   * One line under the question. A second line explaining that a yes opens the
   * store's own dialog was true and still wrong: it explained a mechanism to
   * somebody who had been asked an opinion.
   */
  rate: {
    title: 'Enjoying RiceCal?',
    body: 'Your answer decides what we build next.',
    yes: 'I like it',
    no: 'Not really',
    later: 'Maybe later',

    /**
     * The second screen, after "Not really". It does not apologise twice and does
     * not argue: what it offers is the same Discord the help row opens, because
     * there is no support inbox behind this.
     */
    feedbackTitle: 'What would fix it?',
    feedbackBody: 'Tell us on Discord. Most of what is in the app got there that way.',
    feedbackOpen: 'Open Discord',
    feedbackSkip: 'Not now',
  },

  /**
   * The sheet behind the help row. One destination, so the copy names it: a
   * button saying "Get help" that opens Discord is a surprise, and somebody who
   * does not want an account there should be able to tell before they tap.
   */
  help: {
    title: 'Come and talk to us',
    body: 'Our Discord server is where we answer questions and decide what to build next.',
    logo: 'Discord',
    bug: 'Report something broken',
    idea: 'Suggest a feature',
    ask: 'Ask us anything about RiceCal',
    action: 'Open Discord',
    failed: 'We could not open Discord',
  },

  /**
   * Share & Earn Pro.
   *
   * The reward is named first and the threshold second on every rung: "1 month of
   * Pro" with "30+ likes" beside it reads as an offer with a condition, where the
   * other way round is a list of numbers with prizes attached.
   *
   * Nothing promises a date. Rewards are granted by hand from a Discord thread,
   * so the copy says what happens rather than when.
   *
   * "Likes" is the unit on every platform in the list, including the two that
   * call it something else, because it is the word everybody uses.
   */
  shareEarn: {
    /** The row in Me, and the page's own bar. */
    row: 'Share and earn Pro',
    title: 'Share and earn Pro',
    heroTitle: 'Post about RiceCal, get Pro free',
    heroBody:
      'Show people a plate you logged. The more your post is liked, the longer the Pro we send you.',

    platforms: 'POST IT ON',

    rewards: 'WHAT IT IS WORTH',
    postReward: '1 month of Pro',
    postBadge: '30+ likes',
    postBody: 'Any public post about the app, on any of these.',
    likedReward: '1 year of Pro',
    likedBadge: '100+ likes',
    likedBody: 'Your post found the people it was for.',
    viralReward: 'Pro for good',
    viralBadge: '500+ likes',
    viralBody: 'You went viral. It is yours, no renewals, nothing to cancel.',

    how: 'HOW IT WORKS',
    step1:
      'Post about RiceCal anywhere public. A screenshot of your diary, or a plate you scanned, works best.',
    step2: 'Give it a few days to gather likes.',
    step3: 'Bring the link to our Discord and we send you a Pro code.',

    claim: 'ALREADY POSTED?',
    claimBody: 'Drop the link in our Discord and we will check it and send your code.',
    claimAction: 'Open Discord',

    finePrint:
      'One reward per person. We check the post is public and count the likes when you claim, so give it time before you do.',
    openFailed: 'We could not open that app',
  },

  goals: {
    title: 'Goals and targets',
    dailyCalories: 'DAILY CALORIES',
    /**
     * The calorie field's PLACEHOLDER, which is where the recommendation is
     * named now. It was a caption under the box as well, saying the same figure
     * the box already held on every budget nobody had touched.
     */
    recommended: 'Recommended {{value}}',
    macroTargets: 'MACRO TARGETS',
    /**
     * What the three grams cost, said only when they stop agreeing with the
     * calorie figure above them. They are allowed to: the four targets are
     * edited independently, and this reports the difference rather than
     * silently correcting one of the numbers the user just typed.
     */
    macrosAddUpTo: 'Macros add up to {{value}} kcal',
    /** Puts all four figures back under the formula. */
    useRecommended: 'Use recommended',
    goal: 'GOAL',
    currentWeight: 'Current weight',
    targetWeight: 'Target weight',
    weeklyPace: 'Weekly pace',
    /**
     * Signed in words rather than with a minus, and without a period: the label
     * beside these already says "Weekly pace".
     *
     * The unit is interpolated, because this screen is read in whichever one the
     * account asked for. Spelt "kg" here it contradicted the pounds above it.
     */
    paceLosing: 'Losing {{value}} {{unit}}',
    paceGaining: 'Gaining {{value}} {{unit}}',
    /**
     * The pace when the plan is not moving — the target sitting where the user
     * already is, which is also how they say they have no goal. "0.00 kg / week"
     * is the same fact and reads like a broken calculation.
     */
    paceHolding: 'Holding steady',
    other: 'OTHER',
    waterGoal: 'Water goal',
    saved: 'Targets saved',
  },

  /**
   * Settings / personalisation. Meal times live here rather than on the
   * reminders screen because they are a fact about the person — when they eat
   * — that the reminders happen to read.
   */
  personalisation: {
    title: 'Personalisation',
    mealsTitle: 'MEAL TIMES',
    /**
     * What these times are for, now that they are only for one thing. They
     * used to decide what the app assumed you were logging as well — that
     * went with the `meal` column on an entry.
     */
    mealsNote: 'These are the times your reminders go off.',
    editMeal: 'Change when {{meal}} is',
    hour: 'Hour',
    minute: 'Minute',
    preview: 'Reminds at {{time}}',
  },

  reminders: {
    title: 'Reminders',
    meals: 'MEALS',
    mealAt: '{{meal}} · {{time}}',
    habits: 'HABITS',
    water: 'Water every 2 hours',
    weighIn: 'Weigh in on Monday',
    weeklyReport: 'Weekly report',
    monthlyReport: 'Monthly report',
    denied: 'Reminders need notification permission.',
    blockedTitle: 'Notifications are off',
    blockedBody: 'Turn them on in Settings and these switches will work.',
    openSettings: 'Open Settings',
    /** Copy for the notifications themselves, not for the screen. */
    push: {
      mealTitle: 'Time for {{meal}}',
      mealBody: 'Log it while you remember. It takes ten seconds.',
      waterTitle: 'Water check',
      waterBody: 'How much water so far today?',
      weighInTitle: 'Morning weigh in',
      weighInBody: 'First thing gives the steadiest reading.',
      weeklyTitle: 'Your week in food',
      weeklyBody: 'Seven days of logging, in one screen.',
      monthlyTitle: 'Your month in food',
      monthlyBody: 'Four weeks, and what they came to.',
    },
  },

  preferences: {
    /** Kept identical to `home.units` above, which is where the length limit is
     * explained. A row and the bar of the screen it opens should not disagree
     * about what the screen is called. */
    title: 'Language and units',
    /**
     * The card heading, and the name of the control inside it. `languageLabel` is
     * no longer drawn, since one card holding one picker said "LANGUAGE" and then
     * "App language" under it. It is still the control's name for a screen reader
     * and the title of the sheet that lists the languages.
     */
    language: 'LANGUAGE',
    languageLabel: 'App language',
    units: 'UNITS',
    weight: 'Weight',
    kg: 'kg',
    lb: 'lb',
    energy: 'Energy',
    kcal: 'kcal',
    kj: 'kJ',
    appearance: 'APPEARANCE',
    light: 'Light',
    dark: 'Dark',
    auto: 'Auto',
  },

  subscription: {
    title: 'Subscription',
    pro: 'RiceCal Pro',
    trialLeft_one: 'Free trial, {{count}} day left',
    trialLeft_other: 'Free trial, {{count}} days left',
    renews: 'Renews at {{price}}.',
    /** Lifetime does not renew, and saying it does would be the app lying. */
    neverRenews: 'Paid once. Nothing renews.',
    /** The same card for somebody who has never subscribed. */
    freeBody: '{{scans}} scans a day, {{recipes}} recipes, and the last week of trends.',
    whatYouGet: 'WHAT YOU GET WITH PRO',
    /** A heading only. What is under it comes from `paywall:table.rows`. */
    included: 'INCLUDED',
    cancel: 'Cancel subscription',
    cancelTitle: 'Cancel your subscription?',
    cancelBody: 'You keep Pro until the end of the period. Your log stays readable either way.',
    cancelConfirm: 'Cancel plan',
    switchMonthly: 'Switch to monthly',
    switchYearly: 'Switch to yearly',
    /** There is nothing to switch a one-off purchase to. */
    manage: 'Manage in the store',
    switched: 'Plan updated',
  },
} as const
