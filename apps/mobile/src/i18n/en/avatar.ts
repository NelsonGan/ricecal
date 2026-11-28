/**
 * The avatar on Today and its wardrobe (README: The avatar on Today).
 *
 * `item` names every piece the customise screen offers. They are read out by a
 * screen reader rather than printed under each drawing, so they say what the
 * thing is, briefly. The Malaysian names (teh tarik, songkok, kain pelikat,
 * kain batik, selipar) stay as they are in every language, as dish names do.
 *
 * `mood` is how the avatar is described to a screen reader. Very full is said
 * kindly: going over the budget is never framed as something to feel bad about.
 */
export const avatar = {
  title: 'Your avatar',
  kcalLeft: 'kcal left',
  kcalOver: 'kcal over',
  openHint: 'Opens your avatar',
  biteHint: 'Takes a bite',
  toggle: {
    stats: 'Show stats',
    avatar: 'Show avatar',
  },
  mood: {
    hungry: 'Hungry',
    onTrack: 'On track',
    close: 'Nearly there',
    satisfied: 'Satisfied',
    over: 'Very full',
    stuffed: 'Stuffed',
  },
  base: {
    label: 'Body',
    guy: 'Guy',
    girl: 'Girl',
  },
  slot: {
    hair: 'Hair',
    top: 'Top',
    bottom: 'Bottom',
    shoes: 'Shoes',
    headwear: 'Hat',
    accessory: 'Extras',
    held: 'Hold',
  },
  none: 'None',
  pro: 'Pro',
  save: 'Save',
  saved: 'Avatar saved',
  saveFailed: 'Couldn’t save. Try again.',
  item: {
    hair: {
      bedhead: 'Bedhead',
      'side-part': 'Side part',
      buzz: 'Buzz cut',
      curtain: 'Curtain fringe',
      curly: 'Curls',
      spiky: 'Spiky',
      'chopstick-bun': 'Chopstick bun',
      long: 'Long',
      bob: 'Bob',
      braids: 'Braids',
      ponytail: 'Ponytail',
      wavy: 'Waves',
    },
    top: {
      tee: 'Pandan tee',
      batik: 'Batik shirt',
      hibiscus: 'Hibiscus shirt',
      stripe: 'Striped tee',
      overshirt: 'Open shirt',
      raglan: 'Raglan tee',
      jersey: 'Football jersey',
      gingham: 'Gingham shirt',
      puff: 'Puff-sleeve blouse',
    },
    bottom: {
      shorts: 'Shorts',
      denim: 'Denim shorts',
      track: 'Track shorts',
      chinos: 'Chinos',
      sarong: 'Kain pelikat',
      'kain-batik': 'Kain batik',
      skirt: 'Pleated skirt',
    },
    shoes: {
      sneakers: 'White sneakers',
      green: 'Green sneakers',
      yellow: 'Yellow sneakers',
      selipar: 'Selipar',
      sandals: 'Sandals',
    },
    headwear: {
      cap: 'Cap',
      'back-cap': 'Backwards cap',
      bucket: 'Bucket hat',
      'flower-bucket': 'Hibiscus bucket hat',
      songkok: 'Songkok',
      straw: 'Straw hat',
      tudung: 'Tudung',
    },
    accessory: {
      glasses: 'Glasses',
      shades: 'Sunglasses',
      flower: 'Hibiscus flower',
    },
    held: {
      'teh-tarik': 'Teh tarik',
      'ice-bag': 'Iced drink in a bag',
      satay: 'Satay',
      'ais-krim': 'Ais krim potong',
    },
  },
} as const
