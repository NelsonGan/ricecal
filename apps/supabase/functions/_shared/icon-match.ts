/**
 * A drawing for a catalogue row, worked out from its name.
 *
 * WHY NOT `guessIcon`
 *
 * The edge functions' `guessIcon` scores SHARED WORDS, which is right for what
 * it does: a model has already named the dish in ordinary words, so "char kway
 * teow" finding `char-kuey-teow` on two of three words is exactly the near-miss
 * it exists to catch.
 *
 * Imported catalogue names are not that. They are descriptors — "Beef, round,
 * bottom round, steak, separable lean and fat, trimmed to 0 inch fat" — and
 * word overlap has no idea which word is the food. Measured over the 31,262
 * undrawn rows it matched 2.8%, and some of those were wrong in the way that
 * matters: "Fried Rice with Egg and Prawn" scored `fried-egg`, because it
 * shares two words with it and nothing knows that the rice is the dish.
 *
 * SO: PHRASES, LONGEST FIRST
 *
 * The table below is ordered by specificity at match time, not in the source —
 * `PHRASES` is sorted by word count and then by length, so "fried rice" is
 * tried before "rice" and "ice cream" before "cream". First hit wins.
 *
 * Matching is on WORD BOUNDARIES (the name is padded with spaces and searched
 * for " phrase "), so "cream" does not fire inside "creamer" and "ham" does not
 * fire inside "hamburger".
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * The set has no drawing for a sandwich, a pizza, crisps, flour or salt, and
 * those are thousands of rows between them. They stay undrawn. The app's own
 * rule is that a wrong picture is worse than none (see ICON_INSTRUCTION), and
 * the empty plate is a fine answer — borrowing `bread-loaf` for a sandwich
 * would put a loaf beside every sandwich in the catalogue for ever.
 */

import { ICON_NAMES } from './icons.generated.ts'
import type { IconChoice, IconSet } from './icons.ts'

/**
 * phrase -> icon name. Set is resolved by `SET_OF` in the caller, so a name
 * here only has to exist; whether it is `dishes` or `food` is not this table's
 * business.
 *
 * A value of `null` means STOP, no drawing — the phrase is longer than the one
 * that would otherwise fire, so it wins the ordering and suppresses it. That is
 * how "salad dressing" avoids inheriting the salad's vegetables: a bottle of
 * dressing beside a plate of greens is exactly the wrong-picture case this
 * whole file is trying not to create.
 *
 * Malay, French and Spanish terms are in because the catalogue is full of them:
 * Malaysian products are often entered by European contributors ("Nouilles
 * instantanées"), and MyFCD is bilingual.
 */
export const TABLE: Record<string, string | null> = {
  // -- Malaysian and regional dishes ---------------------------------------
  'nasi lemak': 'nasi-lemak',
  'nasi goreng': 'nasi-goreng',
  'fried rice': 'nasi-goreng',
  'nasi briyani': 'nasi-briyani',
  'nasi biryani': 'nasi-briyani',
  briyani: 'nasi-briyani',
  biryani: 'nasi-briyani',
  'nasi kandar': 'nasi-kandar',
  'nasi campur': 'nasi-campur',
  'nasi kerabu': 'nasi-kerabu',
  'nasi dagang': 'nasi-dagang',
  'nasi ulam': 'nasi-ulam',
  'banana leaf rice': 'banana-leaf-rice',
  'claypot rice': 'claypot-rice',
  'chicken rice': 'chicken-rice',
  'nasi ayam': 'chicken-rice',
  'char siu': 'char-siu-rice',
  'roast duck': 'roast-duck-rice',
  'char kuey teow': 'char-kuey-teow',
  'char kway teow': 'char-kuey-teow',
  'char koay teow': 'char-kuey-teow',
  'kuey teow soup': 'kuey-teow-soup',
  'kuey teow': 'flat-rice-noodles',
  'kway teow': 'flat-rice-noodles',
  'mee goreng': 'mee-goreng',
  'mi goreng': 'mee-goreng',
  'mee rebus': 'mee-rebus',
  'mee siam': 'mee-siam',
  'mee kolok': 'mee-kolok',
  'kolo mee': 'kolo-mee',
  'curry mee': 'curry-mee',
  'hokkien mee': 'hokkien-mee',
  'wantan mee': 'wantan-mee',
  'wanton mee': 'wantan-mee',
  'pan mee': 'pan-mee',
  'lor mee': 'lor-mee',
  laksam: 'laksam',
  laksa: 'laksa',
  'roti canai': 'roti-canai',
  'roti telur': 'roti-telur',
  'roti john': 'roti-john',
  chapati: 'chapati',
  thosai: 'thosai',
  tosai: 'thosai',
  murtabak: 'murtabak',
  'satay celup': 'satay-celup',
  satay: 'satay',
  sate: 'satay',
  rendang: 'rendang',
  'ayam goreng': 'ayam-goreng',
  'ayam penyet': 'ayam-penyet',
  'ayam percik': 'ayam-percik',
  'asam pedas': 'asam-pedas',
  'bak kut teh': 'bak-kut-teh',
  'fish head curry': 'fish-head-curry',
  'masak lemak': 'masak-lemak',
  'sambal udang': 'sambal-udang',
  sambal: 'sambal-jar',
  'sup kambing': 'sup-kambing',
  'sup tulang': 'sup-tulang',
  'yong tau foo': 'yong-tau-foo',
  'chee cheong fun': 'chee-cheong-fun',
  'curry puff': 'curry-puff',
  karipap: 'curry-puff',
  'dim sum': 'dim-sum',
  'ikan bakar': 'ikan-bakar',
  'kaya toast': 'kaya-toast',
  'keropok lekor': 'keropok-lekor',
  keropok: 'crackers',
  ketupat: 'ketupat',
  lontong: 'lontong',
  'otak otak': 'otak-otak',
  popiah: 'popiah',
  'pulut panggang': 'pulut-panggang',
  pulut: 'glutinous-rice',
  'ramly burger': 'ramly-burger',
  rojak: 'rojak',
  samosa: 'samosa',
  tomyam: 'tomyam',
  'tom yam': 'tomyam',
  'tom yum': 'tomyam',
  gulai: 'gulai',
  'apam balik': 'apam-balik',
  'cucur udang': 'cucur-udang',
  'ondeh ondeh': 'ondeh-ondeh',
  cendol: 'cendol',
  'ais kacang': 'ais-kacang',
  'air batu campur': 'ais-kacang',
  'teh tarik': 'teh-tarik',
  'teh o': 'teh-o-ais-limau',
  'kopi o': 'kopi-o',
  milo: 'milo-ais',
  bandung: 'bandung',
  'gula melaka': 'gula-melaka',
  'kuih lapis': 'kuih-lapis',
  'kuih seri muka': 'kuih-seri-muka',
  'kuih salat': 'kuih-seri-muka',
  'kuih talam': 'kuih-talam',
  'kuih ketayap': 'kuih-ketayap',
  'kuih koci': 'kuih-koci',
  'kuih cara': 'kuih-cara',
  'kuih bahulu': 'kuih-bahulu',
  bahulu: 'kuih-bahulu',
  kuih: 'kuih',
  kueh: 'kuih',
  'half boiled egg': 'half-boiled-eggs',
  'love letter': 'love-letter',
  kapit: 'love-letter',
  'pineapple tart': 'pineapple-tart',
  'custard tart': 'custard-tart',
  'peanut cookie': 'peanut-cookie',
  'spring roll': 'spring-roll',
  dumpling: 'dumpling',
  dumplings: 'dumpling',
  gyoza: 'dumpling',
  'siew mai': 'dumpling',
  wanton: 'dumpling',
  pau: 'pau',
  bao: 'pau',

  // -- Meat, fish, egg -----------------------------------------------------
  'beef steak': 'beef-steak',
  'lamb chop': 'lamb-chop',
  'pork belly': 'pork-belly',
  pork: 'pork-belly',
  babi: 'pork-belly',
  bacon: 'pork-belly',
  // Poultry rather than chicken specifically, but the drawing is a plain
  // cooked bird and reads correctly for both.
  turkey: 'grilled-chicken',
  poulet: 'grilled-chicken',
  pollo: 'grilled-chicken',
  boeuf: 'beef-slices',
  poisson: 'fish',
  'chicken wing': 'chicken-wing',
  'chicken nugget': 'chicken-nugget',
  'chicken drumstick': 'chicken-drumstick',
  drumstick: 'chicken-drumstick',
  'roast chicken': 'roast-chicken',
  'roasted chicken': 'roast-chicken',
  'grilled chicken': 'grilled-chicken',
  ayam: 'grilled-chicken',
  chicken: 'grilled-chicken',
  steak: 'beef-steak',
  beef: 'beef-slices',
  daging: 'beef-slices',
  lamb: 'lamb-chop',
  mutton: 'lamb-chop',
  kambing: 'lamb-chop',
  meatball: 'meatball',
  sausage: 'sausage',
  sosej: 'sausage',
  'salted fish': 'salted-fish',
  'fish fillet': 'fish-fillet',
  'fish ball': 'fish-ball',
  'fish cake': 'fish-cake',
  'grilled fish': 'grilled-fish',
  fish: 'fish',
  ikan: 'fish',
  tuna: 'fish',
  salmon: 'fish',
  mackerel: 'fish',
  sardine: 'fish',
  anchovy: 'fish',
  anchovies: 'fish',
  prawn: 'prawn',
  shrimp: 'prawn',
  udang: 'prawn',
  crab: 'crab',
  ketam: 'crab',
  squid: 'squid-rings',
  sotong: 'squid-rings',
  cockles: 'cockles',
  kerang: 'cockles',
  'quail egg': 'quail-eggs',
  'fried egg': 'fried-egg',
  'scrambled egg': 'scrambled-egg',
  'boiled egg': 'boiled-egg',
  omelette: 'omelette',
  omelet: 'omelette',
  telur: 'boiled-egg',
  egg: 'boiled-egg',

  // -- Rice, noodles, grains ----------------------------------------------
  'glutinous rice': 'glutinous-rice',
  'brown rice': 'brown-rice',
  'rice vermicelli': 'rice-vermicelli',
  'flat rice noodles': 'flat-rice-noodles',
  'yellow noodles': 'yellow-noodles',
  'glass noodles': 'glass-noodles',
  'egg noodles': 'egg-noodles',
  'instant noodles': 'instant-noodles',
  'instant noodle': 'instant-noodles',
  'nouilles instantanees': 'instant-noodles',
  bihun: 'rice-vermicelli',
  meehoon: 'rice-vermicelli',
  vermicelli: 'rice-vermicelli',
  spaghetti: 'spaghetti',
  macaroni: 'macaroni',
  pasta: 'spaghetti',
  noodles: 'noodle-bowl',
  noodle: 'noodle-bowl',
  nouilles: 'noodle-bowl',
  mee: 'noodle-bowl',
  porridge: 'porridge',
  bubur: 'porridge',
  congee: 'porridge',
  oatmeal: 'oats',
  oats: 'oats',
  oat: 'oats',
  granola: 'cereal',
  muesli: 'cereal',
  cereales: 'cereal',
  cereals: 'cereal',
  cereal: 'cereal',
  ramen: 'noodle-bowl',
  udon: 'noodle-bowl',
  soba: 'noodle-bowl',
  pho: 'noodle-bowl',
  pancit: 'noodle-bowl',
  // A meal that happens to contain rice, against plain cooked rice. The
  // drawings are genuinely different — `plate-rice` is rice with curry and
  // vegetables on it, `rice-bowl` is a bowl of white rice — so "Sweet and sour
  // pork with rice" and "Rice, white, cooked" must not land on the same one.
  'with rice': 'plate-rice',
  'and rice': 'plate-rice',
  rice: 'rice-bowl',
  nasi: 'plate-rice',
  riz: 'rice-bowl',
  arroz: 'rice-bowl',
  // Uncooked grain, which is what `rice-grains` actually draws.
  beras: 'rice-grains',
  'rice grains': 'rice-grains',

  // -- Bread and baked -----------------------------------------------------
  'wholemeal bread': 'wholemeal-bread',
  wholemeal: 'wholemeal-bread',
  wholegrain: 'wholemeal-bread',
  'bread loaf': 'bread-loaf',
  baguette: 'baguette',
  croissant: 'bun',
  toast: 'toast',
  bread: 'bread-loaf',
  pain: 'bread-loaf',
  roti: 'roti',
  bun: 'bun',
  'swiss roll': 'swiss-roll',
  cupcake: 'cupcake',
  muffin: 'cupcake',
  brownie: 'cake-slice',
  wafer: 'biscuit-stack',
  doughnut: 'doughnut',
  donut: 'doughnut',
  waffle: 'waffle',
  pancake: 'pancakes',
  pancakes: 'pancakes',
  crepe: 'crepe',
  cake: 'cake-slice',
  biscuit: 'biscuit-stack',
  biscuits: 'biscuit-stack',
  cookie: 'biscuit-stack',
  cookies: 'biscuit-stack',
  crackers: 'crackers',
  cracker: 'crackers',

  // -- Dairy and drinks ----------------------------------------------------
  'condensed milk': 'condensed-milk',
  'coconut milk': 'coconut',
  santan: 'coconut',
  'chocolate milk': 'milk-carton',
  'soy milk': 'milk-carton',
  'milk powder': 'milk-carton',
  milk: 'milk-carton',
  lait: 'milk-carton',
  susu: 'milk-carton',
  yogurt: 'yogurt',
  yoghurt: 'yogurt',
  yaourt: 'yogurt',
  cheese: 'cheese',
  fromage: 'cheese',
  queso: 'cheese',
  'peanut butter': 'peanuts',
  butter: 'butter',
  beurre: 'butter',
  'ice cream': 'ice-cream',
  'shaved ice': 'shaved-ice',
  'orange juice': 'orange-juice',
  'lime juice': 'lime-juice',
  'sugarcane juice': 'sugarcane-juice',
  'coconut water': 'coconut-water',
  'energy drink': 'energy-drink',
  'soft drink': 'soda-bottle',
  'soda water': 'soda-bottle',
  carbonated: 'soda-bottle',
  cola: 'soda-bottle',
  soda: 'soda-bottle',
  smoothie: 'smoothie',
  coffee: 'coffee',
  cafe: 'coffee',
  kopi: 'coffee',
  // Only ever as a named drink. A bare `water` is almost never one: measured
  // over the catalogue it matched 251 rows, of which the overwhelming majority
  // were "Tuna in water", "ham and water product", "prepared with water" — and
  // because it is a longer word than `tuna` or `pork` it was WINNING those,
  // putting a glass of water on a tin of fish.
  'mineral water': 'water-bottle',
  'bottled water': 'water-bottle',
  'drinking water': 'water-bottle',
  'sparkling water': 'water-bottle',
  'whey protein': 'protein-shaker',
  'protein powder': 'protein-shaker',
  'protein shake': 'protein-shaker',
  'meal replacement': 'protein-shaker',
  whey: 'protein-shaker',
  'milk tea': 'teh-tarik',

  // -- Sweets and pantry ---------------------------------------------------
  'milk chocolate': 'chocolate-bar',
  chocolate: 'chocolate-bar',
  chocolat: 'chocolate-bar',
  coklat: 'chocolate-bar',
  candies: 'candy',
  candy: 'candy',
  bonbon: 'candy',
  curry: 'gulai',
  kari: 'gulai',
  jelly: 'jelly',
  'agar agar': 'agar-agar',
  pudding: 'pudding',
  custard: 'custard-tart',
  honey: 'honey',
  madu: 'honey',
  'soy sauce': 'soy-sauce',
  kicap: 'soy-sauce',
  'olive oil': 'cooking-oil',
  'cooking oil': 'cooking-oil',
  minyak: 'cooking-oil',
  sugar: 'sugar-cubes',
  gula: 'sugar-cubes',
  sucre: 'sugar-cubes',
  huile: 'cooking-oil',
  sago: 'sago',
  tapioca: 'tapioca',
  ubi: 'sweet-potato',

  // -- Fruit, veg, nuts, pulses -------------------------------------------
  'sweet potatoes': 'sweet-potato',
  'sweet potato': 'sweet-potato',
  'green beans': 'green-beans',
  'red beans': 'red-beans',
  'kacang merah': 'red-beans',
  chickpeas: 'chickpeas',
  lentils: 'lentils',
  'fried tofu': 'fried-tofu-puff',
  taufu: 'tofu',
  tofu: 'tofu',
  tauhu: 'tofu',
  tempeh: 'tempeh',
  tempe: 'tempeh',
  almonds: 'almonds',
  almond: 'almonds',
  cashews: 'cashews',
  cashew: 'cashews',
  peanuts: 'peanuts',
  peanut: 'peanuts',
  'kacang tanah': 'peanuts',
  avocado: 'avocado',
  banana: 'banana',
  pisang: 'banana',
  apple: 'apple',
  epal: 'apple',
  orange: 'orange',
  papaya: 'papaya',
  betik: 'papaya',
  pineapple: 'pineapple',
  nanas: 'pineapple',
  watermelon: 'watermelon',
  tembikai: 'watermelon',
  grapes: 'grapes',
  strawberry: 'strawberry',
  fraise: 'strawberry',
  berries: 'strawberry',
  berry: 'strawberry',
  pomme: 'apple',
  banane: 'banana',
  soursop: 'soursop',
  coconut: 'coconut',
  kelapa: 'coconut',
  lemon: 'lemon',
  lime: 'lime',
  limau: 'lime',
  potato: 'potato',
  kentang: 'potato',
  carrot: 'carrot',
  lobak: 'carrot',
  corn: 'corn',
  jagung: 'corn',
  onion: 'onion',
  bawang: 'onion',
  garlic: 'garlic',
  ginger: 'ginger',
  halia: 'ginger',
  mushroom: 'mushroom',
  cendawan: 'mushroom',
  tomato: 'tomato',
  chilli: 'chilli',
  chili: 'chilli',
  cili: 'chilli',
  vegetables: 'vegetables',
  vegetable: 'vegetables',
  sayur: 'vegetables',
  // A bottle of dressing is not a plate of greens. Two words, so it is tried
  // before `salad` and stops the match dead.
  'salad dressing': null,
  salad: 'vegetables',
  spinach: 'vegetables',
  bayam: 'vegetables',
  kale: 'vegetables',
  cabbage: 'vegetables',
  kubis: 'vegetables',
  broccoli: 'vegetables',
  lettuce: 'vegetables',
  cucumber: 'vegetables',
  timun: 'vegetables',
  celery: 'vegetables',
  pumpkin: 'vegetables',
  labu: 'vegetables',
  peas: 'vegetables',
  kimchi: 'vegetables',
  lentil: 'lentils',
  yam: 'yam',
  keladi: 'yam',
}

/**
 * Flavours and sweeteners, which describe a food without being one.
 *
 * These are tried only after everything else has failed, and that ordering is
 * load-bearing rather than tidy. Length alone gets it backwards: `chocolate` is
 * nine characters and `milk` is four, so "Chocolate Milk" drew a bar of
 * chocolate, and `strawberry` beat `yogurt` on every fruit yogurt in the
 * catalogue. The icon should be the FOOD — a carton, a tub, a slice of cake —
 * and the flavour is what is written on the front of it.
 *
 * A weak phrase still wins when nothing else matches, which is the case they
 * are here for: "Dark Chocolate 70%" is a bar of chocolate and nothing else.
 */
const WEAK = new Set([
  'chocolate',
  'chocolat',
  'coklat',
  'milk chocolate',
  'strawberry',
  'fraise',
  'berry',
  'berries',
  'sugar',
  'gula',
  'sucre',
  'honey',
  'madu',
  'almonds',
  'almond',
  'peanuts',
  'peanut',
  'cashews',
  'cashew',
])

/**
 * Longest first, so "fried rice" beats "rice" and "ice cream" beats "cream".
 * Word count is the primary key because it is the better proxy for specificity:
 * "tom yam" is two words and eight characters, "instant" is one and seven.
 */
const bySpecificity = (a: string, b: string): number => {
  const words = b.split(' ').length - a.split(' ').length
  return words !== 0 ? words : b.length - a.length
}

const STRONG_PHRASES = Object.keys(TABLE)
  .filter((p) => !WEAK.has(p))
  .sort(bySpecificity)
const WEAK_PHRASES = Object.keys(TABLE)
  .filter((p) => WEAK.has(p))
  .sort(bySpecificity)
const PHRASES = [...STRONG_PHRASES, ...WEAK_PHRASES]

/** Lowercased, non-alphanumerics to single spaces, padded for boundary tests. */
export function normaliseName(name: unknown): string {
  return ` ${String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/**
 * The icon name for a food name, or null.
 *
 * Null is the common answer and a correct one. Roughly two thirds of the
 * catalogue is packaged goods whose names describe a brand and a flavour, and
 * there is no drawing of a brand.
 */
export function matchIcon(name: unknown): string | null {
  const text = normaliseName(name)
  if (text.trim().length === 0) return null
  for (const phrase of PHRASES) {
    // A null value returns here rather than continuing, which is the whole
    // point of it: the longer phrase has already decided there is no drawing,
    // and falling through would let the shorter one answer anyway.
    if (text.includes(` ${phrase} `)) return TABLE[phrase]
  }
  return null
}

export const PHRASE_COUNT = PHRASES.length

/**
 * The same answer as `matchIcon`, resolved to the set the drawing lives in.
 *
 * `SET_OF` is rebuilt here rather than imported from `icons.ts` because that
 * one drops everything on its NOT_A_MEAL list, and this table is allowed to
 * name things that list excludes — `crackers` for keropok, say. What matters is
 * that a name resolves to a real file, which is what this checks.
 */
const SET_OF = new Map<string, IconSet>()
for (const set of Object.keys(ICON_NAMES) as IconSet[]) {
  for (const name of ICON_NAMES[set]) if (!SET_OF.has(name)) SET_OF.set(name, set)
}

export function iconFor(name: unknown): IconChoice | null {
  const icon = matchIcon(name)
  if (!icon) return null
  const set = SET_OF.get(icon)
  return set ? { set, name: icon } : null
}
