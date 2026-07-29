export const paywall = {
  hard: {
    title: 'Start logging with RiceCal Pro',
    perks: {
      unlimited: 'Unlimited meal logging',
      scanning: 'Photo and barcode scanning',
      database: 'Local hawker food database',
      sync: 'Weight and workout sync',
    },
    yearly: 'Yearly',
    yearlyBadge: 'SAVE 45%',
    yearlyPrice: 'RM99.90',
    yearlyPerMonth: 'RM8.33 a month',
    monthly: 'Monthly',
    monthlyBilling: 'Billed every month',
    monthlyPrice: 'RM14.90',
    assurance: 'No commitment, cancel any time',
    smallPrint: 'Free for 3 days, then RM99.90 a year.',
    start: 'Start free trial',
    restore: 'Restore purchase',
    notConfigured: 'Purchases are not set up in this build yet.',
    restored: 'Nothing to restore on this account',
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
    lockedEntry: '{{meal}}, locked',
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
    barcode: {
      title: 'Barcode scanning is a Pro feature',
      body: 'Scan any packet and the label reads itself.',
      perks: {
        multiItem: 'Packaged food lookup',
        portion: 'Serving size from the label',
        offline: 'Works offline for saved foods',
      },
    },
    voice: {
      title: 'Voice logging is a Pro feature',
      body: 'Say what you ate and we work out the rest.',
      perks: {
        multiItem: 'Several dishes in one sentence',
        portion: 'Portion words like "half a plate"',
        offline: 'Works offline for saved foods',
      },
    },
    whatYouGet: 'WHAT YOU GET',
    freeNote: 'You can still search and add food by hand for free.',
    start: 'Try free for 3 days',
    searchInstead: 'Search instead',
  },

  welcome: {
    title: 'You are in. Jom makan.',
    body: 'Trial active for 3 days. Everything is unlocked, nothing to set up.',
    perks: {
      log: 'Log by photo, barcode or voice',
      database: 'Full local food database',
      sync: 'Sync your watch and scale',
    },
    manageNote: 'Manage or cancel any time in Profile, Subscription.',
    start: 'Log my first meal',
  },
} as const
