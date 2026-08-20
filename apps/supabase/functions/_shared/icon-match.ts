/**
 * A drawing for a catalogue row, worked out from its name.
 *
 * Why not `guessIcon`: that one scores shared words, which is right for what it
 * does, since a model has already named the dish in ordinary words and "char kway
 * teow" finding `char-kuey-teow` on two of three words is exactly the near-miss it
 * exists to catch.
 *
 * Imported catalogue names are not that. They are descriptors ("Beef, round,
 * bottom round, steak, separable lean and fat, trimmed to 0 inch fat") and word
 * overlap has no idea which word is the food. Measured over the 31,262 undrawn
 * rows it matched 2.8%, and some of those were wrong in the way that matters:
 * "Fried Rice with Egg and Prawn" scored `fried-egg`, because it shares two words
 * with it and nothing knows that the rice is the dish.
 *
 * So: phrases, longest first. The table below is ordered by specificity at match
 * time rather than in the source. `PHRASES` is sorted by word count and then by
 * length, so "fried rice" is tried before "rice" and "ice cream" before "cream".
 * First hit wins.
 *
 * Matching is on word boundaries (the name is padded with spaces and searched for
 * " phrase "), so "cream" does not fire inside "creamer".
 *
 * What is deliberately absent: the set has no drawing for a sandwich, a pizza,
 * crisps, flour or salt, and those are thousands of rows between them. They stay
 * undrawn. A wrong picture is worse than none, and borrowing `bread-loaf` for a
 * sandwich would put a loaf beside every sandwich in the catalogue for ever.
 */

import { ICON_NAMES } from './icons.generated.ts'
import type { IconChoice, IconSet } from './icons.ts'

/**
 * phrase to icon name. The set is resolved by `SET_OF` in the caller, so a name
 * here only has to exist.
 *
 * A value of `null` means stop, no drawing: the phrase is longer than the one
 * that would otherwise fire, so it wins the ordering and suppresses it. Nothing
 * uses it today, and it stays because the next wrong-picture case will want it,
 * and because `matchIcon` has to keep treating null as an answer rather than as a
 * miss.
 *
 * Malay, French and Spanish terms are in because the catalogue is full of them:
 * Malaysian products are often entered by European contributors, and MyFCD is
 * bilingual.
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
  'pisang goreng': 'pisang-goreng',
  'goreng pisang': 'pisang-goreng',
  'banana fritter': 'pisang-goreng',
  'roti jala': 'roti-jala',
  'bak chang': 'bak-chang',
  zongzi: 'bak-chang',
  'loh bak': 'loh-bak',
  'ngoh hiang': 'loh-bak',
  'masak merah': 'ayam-masak-merah',
  'tauhu bakar': 'tauhu-bakar',
  'tahu goreng': 'tauhu-bakar',
  'mee hoon goreng': 'mee-hoon-goreng',
  'bihun goreng': 'mee-hoon-goreng',
  'nasi tomato': 'nasi-tomato',
  'nasi minyak': 'nasi-tomato',
  soto: 'soto',
  kerabu: 'kerabu',
  'bubur cha cha': 'bubur-cha-cha',
  pengat: 'bubur-cha-cha',
  'kek lapis': 'kuih-lapis-sarawak',
  'lapis sarawak': 'kuih-lapis-sarawak',
  'mata kucing': 'air-mata-kucing',
  'sirap limau': 'sirap-limau',
  'air sirap': 'sirap-limau',
  'pad thai': 'pad-thai',
  'pad see ew': 'pad-thai',
  bibimbap: 'bibimbap',
  'banh mi': 'banh-mi',
  'moo ping': 'moo-ping',
  'gai yang': 'moo-ping',
  'fried chicken': 'fried-chicken-bucket',
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
  cucur: 'cucur',
  jemput: 'cucur',
  'ais kacang': 'ais-kacang',
  'air batu campur': 'ais-kacang',
  'teh tarik': 'teh-tarik',
  'teh o': 'teh-o-ais-limau',
  tea: 'tea-cup',
  teh: 'tea-cup',
  matcha: 'tea-cup',
  chai: 'tea-cup',
  oolong: 'tea-cup',
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
  'pau daging': 'pau-daging',
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
  ham: 'ham-slices',
  jambon: 'ham-slices',
  pepperoni: 'ham-slices',
  salami: 'ham-slices',
  bologna: 'ham-slices',
  mortadella: 'ham-slices',
  luncheon: 'ham-slices',
  duck: 'duck',
  itik: 'duck',
  canard: 'duck',
  // Veal and game are USDA American cuts nobody here logs. The beef drawing is
  // an honest stand-in and beats leaving 176 rows blank.
  veal: 'beef-slices',
  'game meat': 'beef-slices',
  venison: 'beef-slices',
  'smoked fish': 'smoked-fish',
  kippers: 'smoked-fish',
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
  sardines: 'fish',
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
  'crab stick': 'crab-stick',
  surimi: 'crab-stick',
  oyster: 'oyster',
  oysters: 'oyster',
  tiram: 'oyster',
  mussel: 'mussels',
  mussels: 'mussels',
  clam: 'mussels',
  clams: 'mussels',
  mollusks: 'mussels',
  scallop: 'mussels',
  kerang: 'cockles',
  'quail egg': 'quail-eggs',
  'fried egg': 'fried-egg',
  'scrambled egg': 'scrambled-egg',
  'boiled egg': 'boiled-egg',
  omelette: 'omelette',
  omelet: 'omelette',
  tamagoyaki: 'omelette-roll',
  telur: 'boiled-egg',
  eggs: 'boiled-egg',
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
  quinoa: 'quinoa',
  couscous: 'quinoa',
  buckwheat: 'quinoa',
  muesli: 'cereal',
  cereales: 'cereal',
  cereals: 'cereal',
  cereal: 'cereal',
  ramen: 'noodle-bowl',
  udon: 'noodle-bowl',
  soba: 'noodle-bowl',
  pho: 'noodle-bowl',
  pancit: 'noodle-bowl',
  sushi: 'sushi-roll',
  maki: 'sushi-roll',
  onigiri: 'sushi-roll',
  lasagna: 'pasta-bake',
  lasagne: 'pasta-bake',
  bolognese: 'pasta-bake',
  carbonara: 'pasta-bake',
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
  'whole wheat': 'wholemeal-bread',
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
  wafer: 'wafer-roll',
  wafers: 'wafer-roll',
  pretzel: 'pretzel',
  pretzels: 'pretzel',
  breadstick: 'pretzel',
  pie: 'pie-slice',
  pastry: 'pie-slice',
  quiche: 'pie-slice',
  cheesecake: 'cheesecake',
  // A sandwich biscuit is a biscuit. `sandwich` and `biscuits` are the same
  // length, so without these the insertion order decided it.
  'sandwich bread': 'bread-loaf',
  'sandwich loaf': 'bread-loaf',
  'sandwich biscuit': 'biscuit-stack',
  'sandwich biscuits': 'biscuit-stack',
  'sandwich cookie': 'biscuit-stack',
  'sandwich cookies': 'biscuit-stack',
  'cracker sandwich': 'crackers',
  'sandwich cracker': 'crackers',
  sandwich: 'sandwich',
  sandwiches: 'sandwich',
  toastie: 'sandwich',
  burger: 'burger',
  burgers: 'burger',
  hamburger: 'burger',
  cheeseburger: 'burger',
  pizza: 'pizza-slice',
  taco: 'taco-wrap',
  tacos: 'taco-wrap',
  burrito: 'taco-wrap',
  tortilla: 'taco-wrap',
  empanada: 'taco-wrap',
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
  'milk powder': 'milk-carton',
  milk: 'milk-carton',
  lait: 'milk-carton',
  susu: 'milk-carton',
  skyr: 'yogurt',
  yogurt: 'yogurt',
  yoghurt: 'yogurt',
  yaourt: 'yogurt',
  cream: 'cream-tub',
  creme: 'cream-tub',
  krim: 'cream-tub',
  margarine: 'margarine',
  shortening: 'margarine',
  formula: 'infant-formula',
  infant: 'infant-formula',
  toddler: 'infant-formula',
  babyfood: 'infant-formula',
  'baby food': 'infant-formula',
  similac: 'infant-formula',
  yakult: 'yogurt-drink',
  'cultured milk': 'yogurt-drink',
  lassi: 'yogurt-drink',
  soya: 'soy-beans',
  soja: 'soy-beans',
  soybean: 'soy-beans',
  soybeans: 'soy-beans',
  'soy milk': 'soy-milk',
  soymilk: 'soy-milk',
  cheddar: 'cheese',
  mozzarella: 'cheese',
  parmesan: 'cheese',
  cheese: 'cheese',
  fromage: 'cheese',
  queso: 'cheese',
  'peanut butter': 'peanuts',
  'beurre de cacahuete': 'peanuts',
  'beurre de cacao': 'chocolate-bar',
  'petit beurre': 'biscuit-stack',
  'pate brisee': 'pie-slice',
  butter: 'butter',
  beurre: 'butter',
  'ice cream': 'ice-cream',
  'shaved ice': 'shaved-ice',
  'orange juice': 'orange-juice',
  'lime juice': 'lime-juice',
  'sugarcane juice': 'sugarcane-juice',
  'coconut water': 'coconut-water',
  'energy drink': 'energy-drink',
  'sports drink': 'energy-drink',
  'soft drink': 'soda-bottle',
  'soda water': 'soda-bottle',
  carbonated: 'soda-bottle',
  cola: 'soda-bottle',
  soda: 'soda-bottle',
  smoothie: 'smoothie',
  juice: 'fruit-juice',
  jus: 'fruit-juice',
  cordial: 'fruit-juice',
  nectar: 'fruit-juice',
  lemonade: 'fruit-juice',
  wine: 'wine-glass',
  vodka: 'wine-glass',
  whisky: 'wine-glass',
  liqueur: 'wine-glass',
  alcoholic: 'wine-glass',
  cocktail: 'wine-glass',
  beer: 'beer-mug',
  lager: 'beer-mug',
  stout: 'beer-mug',
  cider: 'beer-mug',
  coffee: 'coffee',
  cafe: 'coffee',
  kopi: 'coffee',
  latte: 'coffee',
  cappuccino: 'coffee',
  espresso: 'coffee',
  mocha: 'coffee',
  americano: 'coffee',
  nescafe: 'coffee',
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
  // A chocolate chip is not a crisp, and `chips` is the longer word.
  'chocolate chips': 'chocolate-bar',
  'choc chips': 'chocolate-bar',
  chips: 'potato-chips',
  crisps: 'potato-chips',
  popcorn: 'popcorn',
  bar: 'energy-bar',
  bars: 'energy-bar',
  marshmallow: 'marshmallow',
  gummy: 'marshmallow',
  gummies: 'marshmallow',
  nougat: 'marshmallow',
  gum: 'chewing-gum',
  caramel: 'caramel',
  toffee: 'caramel',
  butterscotch: 'caramel',
  fudge: 'caramel',
  mousse: 'pudding-cup',
  dessert: 'pudding-cup',
  fries: 'french-fries',
  'french fries': 'french-fries',
  chocolate: 'chocolate-bar',
  choco: 'chocolate-bar',
  sapi: 'beef-slices',
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
  'oyster sauce': 'sauce-bottle',
  'fish sauce': 'sauce-bottle',
  sauce: 'sauce-bottle',
  pesto: 'sauce-bottle',
  ketchup: 'ketchup',
  'tomato sauce': 'ketchup',
  mayonnaise: 'mayonnaise',
  mayo: 'mayonnaise',
  aioli: 'mayonnaise',
  dressing: 'salad-dressing',
  vinaigrette: 'salad-dressing',
  mustard: 'mustard',
  moutarde: 'mustard',
  vinegar: 'vinegar',
  cuka: 'vinegar',
  jam: 'jam-jar',
  marmalade: 'jam-jar',
  confiture: 'jam-jar',
  'pate a tartiner': 'chocolate-spread',
  nutella: 'chocolate-spread',
  'chocolate spread': 'chocolate-spread',
  syrup: 'syrup-bottle',
  sirap: 'syrup-bottle',
  molasses: 'syrup-bottle',
  flour: 'flour',
  tepung: 'flour',
  semolina: 'flour',
  cocoa: 'cocoa-powder',
  cacao: 'cocoa-powder',
  spice: 'spices',
  spices: 'spices',
  rempah: 'spices',
  cinnamon: 'spices',
  turmeric: 'spices',
  basil: 'herbs',
  parsley: 'herbs',
  coriander: 'herbs',
  thyme: 'herbs',
  herbs: 'herbs',
  'stock cube': 'stock-cube',
  'bouillon cube': 'stock-cube',
  seasoning: 'stock-cube',
  soup: 'soup-bowl',
  sup: 'soup-bowl',
  broth: 'soup-bowl',
  bouillon: 'soup-bowl',
  chowder: 'soup-bowl',
  kicap: 'soy-sauce',
  // USDA writes "cooked with oil" on greens and vegetables, where the oil is
  // how it was cooked rather than what it is. Three words, so it wins the
  // ordering and stops the bottle being drawn on a plate of collards.
  'cooked with oil': null,
  'olive oil': 'cooking-oil',
  'cooking oil': 'cooking-oil',
  minyak: 'cooking-oil',
  oil: 'cooking-oil',
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
  taro: 'taro',
  taufu: 'tofu',
  tofu: 'tofu',
  tauhu: 'tofu',
  tempeh: 'tempeh',
  tempe: 'tempeh',
  kacang: 'beans',
  // Indonesian spellings of words the Malay side already has, plus the ones
  // TKPI writes differently: `kue` is `kuih`, `kerupuk` is `keropok`.
  kue: 'kuih',
  kerupuk: 'crackers',
  keripik: 'crackers',
  tahu: 'tofu',
  dendeng: 'beef-slices',
  mie: 'egg-noodles',
  cumi: 'squid-rings',
  singkong: 'tapioca',

  beans: 'beans',
  bean: 'beans',
  'mature seeds': 'beans',
  'immature seeds': 'beans',
  pinto: 'beans',
  nuts: 'mixed-nuts',
  nut: 'mixed-nuts',
  hazelnut: 'mixed-nuts',
  pistachio: 'mixed-nuts',
  walnut: 'mixed-nuts',
  pecan: 'mixed-nuts',
  sunflower: 'sunflower-seeds',
  seeds: 'sunflower-seeds',
  chia: 'sunflower-seeds',
  kuaci: 'sunflower-seeds',
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
  apples: 'apple',
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
  mango: 'mango',
  mangga: 'mango',
  peach: 'peach',
  apricot: 'peach',
  nectarine: 'peach',
  pear: 'pear',
  pears: 'pear',
  poire: 'pear',
  plum: 'plum',
  prune: 'plum',
  cherry: 'cherries',
  cherries: 'cherries',
  cerise: 'cherries',
  melon: 'melon',
  honeydew: 'melon',
  cantaloupe: 'melon',
  grapefruit: 'grapefruit',
  pomelo: 'grapefruit',
  durian: 'durian',
  lychee: 'lychee',
  litchi: 'lychee',
  longan: 'lychee',
  rambutan: 'lychee',
  guava: 'guava',
  jambu: 'guava',
  blueberry: 'blueberries',
  blueberries: 'blueberries',
  cranberry: 'blueberries',
  raspberry: 'blueberries',
  dates: 'dates',
  kurma: 'dates',
  raisin: 'dates',
  sultana: 'dates',
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
  potatoes: 'potato',
  potato: 'potato',
  kentang: 'potato',
  carrots: 'carrot',
  carrot: 'carrot',
  lobak: 'carrot',
  corn: 'corn',
  jagung: 'corn',
  onions: 'onion',
  onion: 'onion',
  bawang: 'onion',
  garlic: 'garlic',
  ginger: 'ginger',
  halia: 'ginger',
  mushrooms: 'mushroom',
  mushroom: 'mushroom',
  cendawan: 'mushroom',
  tomatoes: 'tomato',
  tomate: 'tomato',
  tomato: 'tomato',
  chilli: 'chilli',
  chili: 'chilli',
  cili: 'chilli',
  'vegetable soup': 'soup-bowl',
  'beef soup': 'soup-bowl',
  'chicken soup': 'soup-bowl',
  'tomato soup': 'soup-bowl',
  'mushroom soup': 'soup-bowl',
  'onion soup': 'soup-bowl',
  'fish soup': 'soup-bowl',
  'corn soup': 'soup-bowl',
  'yoghurt drink': 'yogurt-drink',
  'yogurt drink': 'yogurt-drink',
  vegetables: 'vegetables',
  vegetable: 'vegetables',
  sayur: 'vegetables',
  // Indian composition-table shapes. `leaves` is the biggest single cluster in
  // that source — agathi, basella, fenugreek, gogu, tamarind — and `tea leaves`
  // is here to win before it, or every bancha in the catalogue becomes a salad.
  'tea leaves': 'tea-cup',
  leaves: 'leafy-greens',
  daun: 'leafy-greens',
  gourd: 'vegetables',
  // `gram` is deliberately absent even though the pulses are written "Bengal
  // gram": it is also the unit of mass on a few thousand packets, and `dal`
  // already catches the rows that matter.
  dal: 'lentils',
  rajmah: 'red-beans',
  millet: 'rice-grains',

  squash: 'vegetables',
  salad: 'vegetables',
  spinach: 'leafy-greens',
  bayam: 'vegetables',
  kale: 'leafy-greens',
  watercress: 'leafy-greens',
  kangkung: 'leafy-greens',
  greens: 'leafy-greens',
  cabbage: 'vegetables',
  kubis: 'vegetables',
  broccoli: 'cauliflower',
  cauliflower: 'cauliflower',
  lettuce: 'vegetables',
  cucumber: 'vegetables',
  timun: 'vegetables',
  celery: 'vegetables',
  pumpkin: 'vegetables',
  asparagus: 'asparagus',
  aubergine: 'aubergine',
  eggplant: 'aubergine',
  terung: 'aubergine',
  brinjal: 'aubergine',
  okra: 'okra',
  bendi: 'okra',
  'bell pepper': 'bell-pepper',
  'bell peppers': 'bell-pepper',
  peppers: 'bell-pepper',
  capsicum: 'bell-pepper',
  sprouts: 'bean-sprouts',
  sprouted: 'bean-sprouts',
  taugeh: 'bean-sprouts',
  pickle: 'pickles',
  pickles: 'pickles',
  pickled: 'pickles',
  acar: 'pickles',
  olives: 'olives',
  olive: 'olives',
  seaweed: 'seaweed',
  nori: 'seaweed',
  rumpai: 'seaweed',
  labu: 'vegetables',
  peas: 'green-peas',
  kimchi: 'pickles',
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
 * catalogue. The icon should be the food, and the flavour is what is written on
 * the front of it.
 *
 * A weak phrase still wins when nothing else matches, which is the case they are
 * here for: "Dark Chocolate 70%" is a bar of chocolate and nothing else.
 */
const WEAK = new Set([
  'chocolate',
  'choco',
  // Indonesian packets are named for their flavour: "Rasa Sapi Panggang" is a
  // crisp, and "Mie ... sumsum sapi" is a noodle. Beef is what it tastes of.
  'sapi',
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
  // Added with the second sheet of drawings. Each of these is far more often
  // the flavour written on a packet than the food in it: "chocolate cereal" is
  // cereal, "caramel latte" is coffee, "mango yogurt" is yogurt.
  'cocoa',
  'cacao',
  'caramel',
  'toffee',
  'butterscotch',
  'fudge',
  'mango',
  'peach',
  'plum',
  'cherry',
  'cherries',
  'blueberry',
  'blueberries',
  'cranberry',
  'raspberry',
  'lychee',
  'guava',
  'melon',
  'honeydew',
  'grapefruit',
  'pomelo',
  'cucumber',
  'timun',
  'matcha',
  'vegetable',
  'vegetables',
  'sayur',
  'salad',
  'nuts',
  'nut',
  'hazelnut',
  'pistachio',
  'walnut',
  'pecan',
  'bar',
  'bars',
  // "UHT Full Cream Milk" drew a tub of cream, because `cream` is a longer word
  // than `milk`. It is a qualifier at least as often as it is the food.
  'cream',
  'creme',
  'krim',
])

/**
 * The same idea again, for names that are not written in Latin letters.
 *
 * `normaliseName` drops everything outside `[a-z0-9]`, which is correct for the
 * Latin table and total for a script it does not cover. A Thai name normalises to
 * the empty string, and `matchIcon` used to return null on the first line.
 * Measured against the catalogue that was 4,573 undrawn rows, a third of all of
 * them, and it read as a missing vocabulary when it was really a missing
 * alphabet.
 *
 * Two things make this a separate table. Thai does not put spaces between words,
 * so the boundary test cannot work here and the match has to be a plain
 * substring. And with no boundaries the ordering does all of the safety work, so
 * the entries have to be chosen against the corpus rather than from a dictionary:
 * `มันฝรั่ง` (potato) and `หมากฝรั่ง` (chewing gum) both contain `ฝรั่ง` (guava),
 * and `คาปูชิโน` (cappuccino) contains `ปู` (crab). Each longer phrase is here to
 * win before the short one can.
 */
const SCRIPT_TABLE: Record<string, string | null> = {
  // Japanese. The 45x and 49x shelves are 34,736 packets, the largest in Asia here,
  // and they were at 30% because kana and kanji were as invisible to the matcher as
  // Thai. Same rules: no spaces, so the compounds have to outrank the single
  // characters. 牛乳 (milk) contains 牛 (beef), and 豆腐 (tofu), 納豆 (natto) and
  // 豆乳 (soy milk) all contain 豆 (bean).
  ミルクチョコレート: 'chocolate-bar',
  アイスコーヒー: 'coffee',
  アイスティー: 'tea-cup',
  アイスクリーム: 'ice-cream',
  アイス: 'ice-cream',
  ポテトチップス: 'potato-chips',
  ハンバーガー: 'burger',
  サンドイッチ: 'sandwich',
  スパゲッティ: 'spaghetti',
  ヨーグルト: 'yogurt',
  ドーナツ: 'doughnut',
  キャンディ: 'candy',
  ビスケット: 'biscuit-stack',
  クッキー: 'biscuit-stack',
  せんべい: 'crackers',
  煎餅: 'crackers',
  ラーメン: 'noodle-bowl',
  焼きそば: 'noodle-bowl',
  うどん: 'noodle-bowl',
  蕎麦: 'noodle-bowl',
  そば: 'noodle-bowl',
  パスタ: 'spaghetti',
  おにぎり: 'rice-bowl',
  ごはん: 'rice-bowl',
  ご飯: 'rice-bowl',
  玄米: 'brown-rice',
  食パン: 'bread-loaf',
  パン: 'bread-loaf',
  ケーキ: 'cake-slice',
  プリン: 'pudding',
  ゼリー: 'jelly',
  チーズ: 'cheese',
  バター: 'butter',
  牛乳: 'milk-carton',
  ミルク: 'milk-carton',
  豆乳: 'soy-milk',
  豆腐: 'tofu',
  納豆: 'soy-beans',
  醤油: 'soy-sauce',
  ソース: 'sauce-bottle',
  ジュース: 'fruit-juice',
  果汁: 'fruit-juice',
  ビール: 'beer-mug',
  カレー: 'gulai',
  スープ: 'soup-bowl',
  味噌汁: 'soup-bowl',
  野菜: 'vegetables',
  餃子: 'dumpling',
  寿司: 'sushi-roll',
  ピザ: 'pizza-slice',
  ジャム: 'jam-jar',
  はちみつ: 'honey',
  チキン: 'grilled-chicken',
  ポーク: 'pork-belly',
  ビーフ: 'beef-slices',
  鶏卵: 'boiled-egg',
  たまご: 'boiled-egg',
  卵: 'boiled-egg',
  えび: 'prawn',
  エビ: 'prawn',
  鶏: 'grilled-chicken',
  豚: 'pork-belly',
  牛: 'beef-slices',
  魚: 'fish',
  米: 'rice-bowl',
  豆: 'beans',

  // -- Thai: rice and noodles ----------------------------------------------
  ข้าวเหนียว: 'glutinous-rice',
  ข้าวกล้อง: 'brown-rice',
  ข้าวโอ๊ต: 'oats',
  ข้าวโพด: 'corn',
  ข้าวผัด: 'nasi-goreng',
  ข้าวต้ม: 'porridge',
  ข้าวเกรียบ: 'crackers',
  ข้าวตัง: 'crackers',
  ข้าวโพดคั่ว: 'popcorn',
  ข้าวมันไก่: 'chicken-rice',
  ข้าวหมูแดง: 'char-siu-rice',
  ข้าวขาหมู: 'pork-belly',
  ข้าวหอมมะลิ: 'rice-grains',
  ข้าว: 'rice-bowl',
  ก๋วยเตี๋ยว: 'noodle-bowl',
  บะหมี่กึ่งสำเร็จรูป: 'instant-noodles',
  มาม่า: 'instant-noodles',
  ราเมน: 'noodle-bowl',
  ก๋วยจั๊บ: 'noodle-bowl',
  ผัดกะเพรา: 'plate-rice',
  บะหมี่: 'egg-noodles',
  เส้นหมี่: 'rice-vermicelli',
  ขนมจีน: 'rice-vermicelli',
  วุ้นเส้น: 'glass-noodles',
  สปาเก็ตตี้: 'spaghetti',
  มักกะโรนี: 'macaroni',
  ผัดไทย: 'pad-thai',

  // Thai: the bread words, which is most of what `ขนม` turned out to be. 287 rows
  // contain it and almost none are a generic sweet: they are `ขนมปัง` (bread),
  // `ขนมปังกรอบ` (a cracker), `ขนมขาไก่` (a stick snack). Bare `ขนม` is
  // deliberately absent, because it covers everything from a rusk to a peanut
  // brittle and no drawing is right for all of them.
  ขนมปังกรอบ: 'crackers',
  ขนมปัง: 'bread-loaf',
  // `ขนม` is the trap that made the null value earn its keep. It means a snack
  // or a sweet, it covers everything from a rusk to a peanut brittle, and it
  // CONTAINS `นม` (milk) — so without a stop here every `ขนมขาไก่` and
  // `ขนมถั่วตัด` in the catalogue drew a carton of milk. Longer than `นม`, so
  // it wins the ordering and suppresses it; shorter than `ขนมปัง`, so bread
  // still answers first.
  ขนม: null,

  // -- Thai: meat, fish, egg ------------------------------------------------
  นักเก็ต: 'chicken-nugget',
  ไก่ทอด: 'ayam-goreng',
  ไก่ย่าง: 'grilled-chicken',
  ไก่: 'grilled-chicken',
  หมูปิ้ง: 'moo-ping',
  หมูกรอบ: 'pork-belly',
  หมู: 'pork-belly',
  // `เนื้อ` alone is flesh of any kind, so the compounds have to come first:
  // `เนื้อปลาบดปรุงรส` is minced FISH and drew a plate of beef.
  เนื้อปลา: 'fish',
  เนื้อไก่: 'grilled-chicken',
  เนื้อหมู: 'pork-belly',
  เนื้อ: 'beef-slices',
  เป็ด: 'duck',
  ปลาหมึก: 'squid-rings',
  ปลา: 'fish',
  กุ้ง: 'prawn',
  // `ปูอัด` is the crab stick and it is most of the `ปู` rows; `คาปูชิโน` is a
  // cappuccino and contains the same two letters.
  ปูอัด: 'crab-stick',
  คาปูชิโน: 'coffee',
  หอย: 'mussels',
  ไข่ไก่: 'boiled-egg',
  ไข่: 'boiled-egg',
  ลูกชิ้น: 'meatball',
  ไส้กรอก: 'sausage',
  แหนม: 'sausage',

  // -- Thai: drinks ---------------------------------------------------------
  นมถั่วเหลือง: 'soy-milk',
  นมข้น: 'condensed-milk',
  // Strong, and only safe because `ขนม` above stops first: milk is two
  // characters and loses to every flavour word otherwise, and "chocolate milk"
  // is a carton of milk.
  นม: 'milk-carton',
  ชานม: 'teh-tarik',
  กาแฟ: 'coffee',
  โกโก้: 'cocoa-powder',
  น้ำผลไม้: 'fruit-juice',
  น้ำมะพร้าว: 'coconut-water',
  น้ำอ้อย: 'sugarcane-juice',
  น้ำอัดลม: 'soda-bottle',
  น้ำส้ม: 'orange-juice',
  น้ำมันมะพร้าว: 'cooking-oil',
  น้ำมัน: 'cooking-oil',
  น้ำตาลมะพร้าว: 'gula-melaka',
  นมเปรี้ยว: 'yogurt-drink',
  น้ำเปล่า: 'water-bottle',
  โซดา: 'soda-bottle',
  ธัญพืช: 'cereal',
  ไส้อั่ว: 'sausage',
  เกี๊ยวซ่า: 'dumpling',
  น้ำปลา: 'sauce-bottle',
  น้ำพริก: 'sambal-jar',
  น้ำสลัด: 'salad-dressing',
  น้ำจิ้ม: 'sauce-bottle',
  เบียร์: 'beer-mug',
  ไวน์: 'wine-glass',

  // -- Thai: dairy, sweets, snacks -----------------------------------------
  โยเกิร์ต: 'yogurt',
  ชีส: 'cheese',
  เนย: 'butter',
  ไอศกรีม: 'ice-cream',
  ไอศ: 'ice-cream',
  เค้ก: 'cake-slice',
  แพนเค้ก: 'pancakes',
  คุกกี้: 'biscuit-stack',
  บิสกิต: 'biscuit-stack',
  แครกเกอร์: 'crackers',
  เวเฟอร์: 'wafer-roll',
  ทองม้วน: 'wafer-roll',
  ท้องม้วน: 'wafer-roll',
  ลูกอม: 'candy',
  หมากฝรั่ง: 'chewing-gum',
  เยลลี่: 'jelly',
  เฉาก๊วย: 'jelly',
  พุดดิ้ง: 'pudding',
  โดนัท: 'doughnut',
  วาฟเฟิล: 'waffle',
  ป๊อปคอร์น: 'popcorn',
  สาคู: 'sago',

  // -- Thai: vegetables, pulses, fruit -------------------------------------
  มันฝรั่งทอด: 'potato-chips',
  มันฝรั่ง: 'potato',
  มันเทศ: 'sweet-potato',
  เผือก: 'taro',
  ถั่วลันเตา: 'green-peas',
  ถั่วลิสง: 'peanuts',
  ถั่วเหลือง: 'soy-beans',
  ถั่ว: 'beans',
  เต้าหู้: 'tofu',
  เห็ด: 'mushroom',
  สาหร่าย: 'seaweed',
  ผัก: 'vegetables',
  อัลมอนด์: 'almonds',
  เม็ดมะม่วงหิมพานต์: 'cashews',
  // `ส้มตำ` is the papaya salad, not an orange.
  ส้มตำ: 'kerabu',
  มะม่วง: 'mango',
  มะละกอ: 'papaya',
  มะพร้าว: 'coconut',
  มะนาว: 'lime',
  กล้วย: 'banana',
  แอปเปิ้ล: 'apple',
  สับปะรด: 'pineapple',
  แตงโม: 'watermelon',
  องุ่น: 'grapes',
  ทุเรียน: 'durian',

  // -- Thai: dishes and pantry ---------------------------------------------
  ต้มยำ: 'tomyam',
  แกง: 'gulai',
  ซุป: 'soup-bowl',
  โจ๊ก: 'porridge',
  เกี๊ยว: 'dumpling',
  ปอเปี๊ยะ: 'spring-roll',
  ซูชิ: 'sushi-roll',
  พิซซ่า: 'pizza-slice',
  เบอร์เกอร์: 'burger',
  แซนด์วิช: 'sandwich',
  เฟรนช์ฟราย: 'french-fries',
  ซีเรียล: 'cereal',
  ซีอิ๊ว: 'soy-sauce',
  ซอส: 'sauce-bottle',
  แยม: 'jam-jar',
  แป้ง: 'flour',
}

/**
 * The script phrases that describe a flavour or a liquid rather than a food, held
 * back for the same reason the Latin `WEAK` set is: `ช็อกโกแลต` is nine
 * characters and `นม` is two, so "chocolate milk" would draw a bar rather than a
 * carton. `น้ำ` is the broadest of them, since it prefixes oil, sugar, fish sauce
 * and juice alike, and every one of those is spelled out above.
 */
const SCRIPT_WEAK = new Set([
  'ช็อกโกแลต',
  'สตรอเบอร์รี่',
  'น้ำตาล',
  'น้ำผึ้ง',
  'น้ำ',
  'ส้ม',
  'ปู',
  'ฝรั่ง',
  // Tea is a flavour at least as often as it is the drink: `มัทฉะคุกกี้
  // (คุกกี้รสชาเขียว)` is a cookie, and green tea beat it on length.
  'ชาเขียว',
  'ชา',
  // The same in Japanese: `チョコ` is a flavour on half the shelf, and a
  // green-tea Kit Kat is a chocolate bar.
  'チョコレート',
  'チョコ',
  '緑茶',
  '紅茶',
  '麦茶',
  'お茶',
  '茶',
])
for (const [phrase, icon] of Object.entries({
  ชาเขียว: 'tea-cup',
  ชา: 'tea-cup',
  チョコレート: 'chocolate-bar',
  チョコ: 'chocolate-bar',
  緑茶: 'tea-cup',
  紅茶: 'tea-cup',
  麦茶: 'tea-cup',
  お茶: 'tea-cup',
  茶: 'tea-cup',
  ช็อกโกแลต: 'chocolate-bar',
  สตรอเบอร์รี่: 'strawberry',
  น้ำตาล: 'sugar-cubes',
  น้ำผึ้ง: 'honey',
  น้ำ: 'water-glass',
  ส้ม: 'orange',
  ปู: 'crab',
  ฝรั่ง: 'guava',
})) {
  SCRIPT_TABLE[phrase] = icon
}

/**
 * Phrases too short to be safe loose in a Thai string.
 *
 * `นม` (milk) is two characters, and Thai runs its words together: it turned up
 * inside `กลิ่นมะลิ` (jasmine scent) and drew a carton of milk on a green tea.
 * These must start the name or follow something that is not itself a Thai letter,
 * which is what a word boundary means in a script that has none.
 */
const SCRIPT_ANCHORED = new Set(['นม', 'ชา', 'ปู', 'ส้ม', '茶', '豆', '米', '牛', '鶏', '豚', '魚'])

/** Is the phrase at a position no Thai letter runs into? */
function anchoredHit(raw: string, phrase: string): boolean {
  let at = raw.indexOf(phrase)
  while (at !== -1) {
    const before = at === 0 ? '' : raw[at - 1]
    if (!before || before.charCodeAt(0) <= 127) return true
    at = raw.indexOf(phrase, at + 1)
  }
  return false
}

/** No word boundaries to sort by, so length is the only proxy for specificity. */
const byLength = (a: string, b: string): number => b.length - a.length
const SCRIPT_PHRASES = [
  ...Object.keys(SCRIPT_TABLE)
    .filter((p) => !SCRIPT_WEAK.has(p))
    .sort(byLength),
  ...Object.keys(SCRIPT_TABLE)
    .filter((p) => SCRIPT_WEAK.has(p))
    .sort(byLength),
]

/** Exported so the loader can check these name real drawings too. */
export { SCRIPT_TABLE }

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

/** Exported so a test can assert each one is a real key. */
export { WEAK_PHRASES }

/**
 * Lowercased, non-alphanumerics to single spaces, padded for boundary tests.
 *
 * Phrases that describe the shape of the food rather than an ingredient in it.
 * Only these are allowed to win from a name's first segment. A bowl of soup is a
 * bowl of soup whatever is floating in it, and a sandwich cookie is a cookie, but
 * "Beef, ..., steak" is a steak, so `beef` is deliberately not here.
 */
const FORM_HEADS = new Set([
  'soup',
  'sup',
  'broth',
  'bouillon',
  'chowder',
  'cookie',
  'cookies',
  'biscuit',
  'biscuits',
  'crackers',
  'cracker',
  'pastry',
  'pie',
  'cake',
  'sandwich',
  'pizza',
  'bread',
  'bun',
  'toast',
  'cereal',
  'cereals',
  'candy',
  'candies',
  'juice',
  'beverages',
  'porridge',
  'salad',
  'pudding',
  'jam',
  'sauce',
  'dressing',
  'syrup',
  'yogurt',
  'yoghurt',
  'cheese',
  'butter',
  'margarine',
  'flour',
  'oats',
  'noodles',
  'noodle',
  'pasta',
  'spaghetti',
  'macaroni',
  'dumpling',
  'dumplings',
])

function normaliseName(name: unknown): string {
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
  const raw = String(name ?? '')
  const text = normaliseName(name)
  // A name written entirely in another script normalises to nothing. That is
  // not a miss, it is a different alphabet — see `SCRIPT_TABLE`.
  if (text.trim().length === 0) return matchScript(raw)

  // A form declared first wins.
  //
  // Composition tables write "Head, qualifier, qualifier": "Soup, vegetable
  // chicken, canned", "Cookie, vanilla sandwich". Scanning the whole string lets a
  // qualifier win on length alone, and those two were drawn as a chicken and a
  // sandwich.
  //
  // Restricted to FORM_HEADS, and that restriction is the whole subtlety. A head
  // noun does not always outrank what follows it: "Beef, round, bottom round,
  // steak" is a steak, and preferring the head there turned 401 steaks into slices.
  // A soup or a cookie is a shape the drawing is about, where "beef" is an
  // ingredient the rest of the name goes on to refine.
  //
  // The first phrase to match the head decides whether this pass applies at all.
  // Skipping straight to the form words lets a shorter one reach past a longer
  // phrase that was meant to block it: "Salad dressing, caesar" has `salad
  // dressing` mapped to nothing on purpose, and scanning only for form words found
  // `salad` behind it and drew a plate of greens on 60 bottles of dressing.
  const comma = String(name).indexOf(',')
  if (comma > 0) {
    const head = normaliseName(String(name).slice(0, comma))
    for (const phrase of PHRASES) {
      if (!head.includes(` ${phrase} `)) continue
      return FORM_HEADS.has(phrase) ? TABLE[phrase] : matchBody(text)
    }
  }

  // Latin first, and the script table only for what it could not answer, so a
  // mixed name keeps whatever drawing it has today.
  return matchBody(text) ?? matchScript(raw)
}

/**
 * The non-Latin scan: a plain substring, longest phrase first.
 *
 * Runs only after the Latin pass has found nothing, which keeps it strictly
 * additive. It also means a mixed name is read in Latin first, which is the right
 * way round: "KitKat Gold (Japan)" is a Latin name that happens to sit beside
 * Thai ones.
 */
function matchScript(raw: string): string | null {
  // Nothing to do for a name that is entirely ASCII, which is most of them.
  if (![...raw].some((c) => c.charCodeAt(0) > 127)) return null
  for (const phrase of SCRIPT_PHRASES) {
    const hit = SCRIPT_ANCHORED.has(phrase) ? anchoredHit(raw, phrase) : raw.includes(phrase)
    if (hit) return SCRIPT_TABLE[phrase]
  }
  return null
}

/** The ordinary scan: longest phrase first, anywhere in the name. */
function matchBody(text: string): string | null {
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
 * `SET_OF` is rebuilt here rather than imported from `icons.ts` because that one
 * drops everything on its NOT_A_MEAL list, and this table is allowed to name
 * things that list excludes. What matters is that a name resolves to a real file.
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
