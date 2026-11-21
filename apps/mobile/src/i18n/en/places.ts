/**
 * Meal locations: the Locations switches, the "Where did you eat?" picker, the
 * entry page's place card, the food map and the one-time offer (README: Meal
 * locations).
 *
 * A place's own name is data, not copy: "Village Park Restaurant" comes from
 * Apple Maps or the phone's geocoder and is never translated. "Locations" is
 * the switch's name everywhere it is mentioned, so a body that says where to
 * find it uses the same word.
 */
export const places = {
  /** A spot neither the phone nor Apple could name, saved with this instead. */
  pinned: 'Pinned location',

  // Settings > Personalisation
  /** The card's title. */
  title: 'Locations',
  enable: 'Save meal locations',
  enableHint: 'Tag meals with where you ate them. Only you can see them.',
  autoTag: 'Tag new meals automatically',
  autoTagHint: 'Meals logged for today get the place you are at.',
  accessOff: 'Location access is off',
  /** The row's button while the system can still ask. */
  allow: 'Allow',
  /** The row's button once only the Settings app can change it. */
  openSettings: 'Open Settings',

  // The picker
  pickerTitle: 'Where did you eat?',
  searchPlaceholder: 'Search restaurants and places',
  current: 'Current location',
  noResults: 'No places found',
  searchError: "Couldn't search. Check your connection.",
  searchLimit: 'Daily search limit reached. Try again tomorrow.',
  searchBusy: 'Search is busy. Try again shortly.',
  searchUnavailable: "Place search isn't available right now.",
  remove: 'Remove location',
  nearby: 'Nearby',
  results: 'Results',
  useSpot: 'Use this spot',

  // The entry page
  /** The card's title, over the place's name. */
  where: 'Where',
  add: 'Add location',

  // The food map
  mapTitle: 'Food map',
  week: 'Week',
  month: 'Month',
  all: 'All time',
  previous: 'Earlier',
  next: 'Later',
  placesCount_one: '{{count}} place',
  placesCount_other: '{{count}} places',
  weekShort: 'Week',
  monthShort: 'Month',
  allShort: 'All',
  meals_one: '{{count}} meal',
  meals_other: '{{count}} meals',
  /** A bubble that cannot split further, listing what is under it. */
  placesHere_one: '{{count}} place here',
  placesHere_other: '{{count}} places here',
  showAll: 'Show all places',
  emptyTitle: 'No places yet',
  emptyBody: 'Meals you tag with a place show up here.',
  /** Shown instead of the map on a build without the map module. */
  mapUnavailable: 'The map needs the latest version of RiceCal.',

  // The one-time offer
  offerTitle: 'Remember where you eat?',
  offerBody: 'Tag meals with the place and see them on your food map.',
  offerAccept: 'Turn on Locations',
  offerDecline: 'Not now',
} as const
