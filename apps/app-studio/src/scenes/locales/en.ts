import type { LocaleModule } from './types';

/**
 * English is the canonical source. Every other locale translates this module
 * while keeping the brief's rating and user count unchanged.
 */
const en: LocaleModule = {
  meta: { code: 'en', flag: '🇬🇧', label: 'English' },

  phone: {
    today: {
      h: 'Every meal,\ncounted',
      hl: 'counted',
      sub: 'One ring for what is left. Macros and water right beside it.',
    },
    workout: {
      h: 'Log every set,\nbeat your best',
      hl: 'beat your best',
      sub: 'Last session beside every set. A trophy when you beat it.',
    },
    dish: {
      h: 'Set the portion,\nsee the count',
      hl: 'see the count',
      sub: 'Bowls, plates and pieces. Change the serving, the numbers follow.',
    },
    trends: {
      h: 'See where\nthe week went',
      hl: 'the week went',
      sub: 'Seven days, thirty days or a year. Calories, water and weight.',
    },
    feed: {
      h: 'Share your plate,\nfind your people',
      hl: 'find your people',
      sub: 'Follow friends and share the food you love.',
    },
    recipes: {
      h: 'Cook it once,\nlog it in a tap',
      hl: 'log it in a tap',
      sub: 'Enter what went in and how many it feeds. After that, one tap.',
    },
    panel: {
      title: "Five ways to\nlog Asian food",
      sub: "Hawker stalls, home cooking, packets from the shop.",
      stats: { usersChoice: '2K users’ choice' },
      metrics: { calories: 'Calories', water: 'Water', weight: 'Weight' },
      snap:     { t: 'Snap a plate',        b: 'Every dish on it named, sized and counted.' },
      describe: { t: 'Say what you ate',    b: '"Nasi lemak with fried chicken and a teh tarik."' },
      scan:     { t: 'Scan a packet',       b: 'Read straight off the label, in a second.' },
      search:   { t: 'Search the database', b: 'Hawker dishes, chains and home cooking.' },
      recipes:  { t: 'Save what you cook',  b: 'Enter it once, then log it in a tap.' },
    },
  },

  feature: {
    titleA: 'Snap your plate.',
    titleB: { pre: 'Get the ', hl: 'calories', post: ' back.' },
    sub: 'Asian food, counted properly',
  },

  landing: {
    title: 'A calorie diary that knows nasi lemak.',
    highlight: 'nasi lemak',
    subtitle: 'Snap it, say it or scan it. RiceCal counts the rest.',
  },
};

export default en;
