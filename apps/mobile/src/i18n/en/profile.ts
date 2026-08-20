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
     * THE PLAN IS INTERPOLATED, and it was written into the sentence.
     *
     * "Yearly plan, active" was printed to every subscriber there is: a monthly
     * one, somebody who bought LIFETIME, and every account holding a
     * promotional grant. The name comes from `paywall:plans` now, which is the
     * same list the paywall sells them under, so the two cannot disagree.
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
     * Beside the health-sync row when nothing is connected.
     *
     * The connected case reuses `activity:provider.*`, which already names each
     * store — this is only the absence, and "Not connected" is the one thing
     * that row has to be able to say without being opened.
     */
    healthOff: 'Not connected',
    units: 'Units and appearance',
    /** The four-card tour, which is offered once on Today and lives here after. */
    tutorial: 'How RiceCal works',
    help: 'Help centre',
    signOut: 'Sign out',
  },

  /**
   * The sheet behind the help row.
   *
   * It is all one destination, so the copy names it rather than hiding it: a
   * button that says "Get help" and opens Discord is a surprise, and somebody
   * who does not want a Discord account should be able to tell before they tap.
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
   * THE REWARD IS NAMED FIRST AND THE THRESHOLD SECOND, on every rung. "1 month
   * of Pro" with "30+ likes" beside it reads as an offer with a condition;
   * written the other way round the card is a list of numbers with prizes
   * attached, and the thing somebody is deciding about is the prize.
   *
   * NOTHING HERE PROMISES A DATE. Rewards are granted by hand, from a Discord
   * thread, so the copy says what happens rather than when — "we will send you
   * a code" is a promise we keep, and "within 24 hours" is one we would break
   * the first weekend somebody claimed on a Saturday night.
   *
   * "Likes" is the unit on every platform in the list, including the two that
   * call it something else. It is the word everybody uses for the number under
   * a post, and inventing a neutral one ("reactions") would be precise and
   * unreadable.
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
    recommended: 'RECOMMENDED {{value}}',
    macroTargets: 'MACRO TARGETS',
    macroValue: '{{grams}} g · {{percent}}%',
    goal: 'GOAL',
    currentWeight: 'Current weight',
    targetWeight: 'Target weight',
    weeklyPace: 'Weekly pace',
    /**
     * Signed in words rather than with a minus, and without a period: the label
     * beside these already says "Weekly pace", so "0.25 kg / week" under it
     * would say week twice.
     *
     * The direction used to be a Lose / Maintain / Gain control above the
     * slider; it is the gap between the two weights now, and this line is where
     * that gap is read back. "-0.50 kg" states the same thing and makes the
     * reader do the arithmetic to find out which way they are going.
     *
     * The UNIT is interpolated rather than written in, because this screen is
     * read in whichever one the account asked for and the figure beside it is
     * converted. Spelt "kg" here it contradicted the pounds above it.
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
    title: 'Units and appearance',
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
