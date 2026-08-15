export const profile = {
  home: {
    title: 'Me',
    memberSince: 'Member since {{month}}',
    streak: 'STREAK',
    weight: 'KG',
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
    proActive: 'Yearly plan, active',
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
    units: 'Units and language',
    unitsValue: '{{units}}, {{language}}',
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
     */
    paceLosing: 'Losing {{value}} kg',
    paceGaining: 'Gaining {{value}} kg',
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
      waterBody: 'How many glasses so far today?',
      weighInTitle: 'Morning weigh in',
      weighInBody: 'First thing gives the steadiest reading.',
      weeklyTitle: 'Your week in food',
      weeklyBody: 'Seven days of logging, in one screen.',
      monthlyTitle: 'Your month in food',
      monthlyBody: 'Four weeks, and what they came to.',
    },
  },

  preferences: {
    title: 'Units and language',
    language: 'LANGUAGE',
    english: 'English',
    bahasa: 'Bahasa',
    languageNote: 'Food names keep their local spelling in both languages.',
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
    freeBody: 'Search and browse are free. Logging a meal needs Pro.',
    whatYouGet: 'WHAT YOU GET WITH PRO',
    yourPlan: 'YOUR PLAN',
    plan: 'Plan',
    perMonth: 'Per month',
    payment: 'Payment',
    paymentUnknown: 'Managed by the store',
    paymentValue: 'Card ending {{last4}}',
    included: 'INCLUDED',
    perks: {
      unlimited: 'Unlimited logging',
      scanning: 'Photo scanning',
      database: 'Local food database',
    },
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
