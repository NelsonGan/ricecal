/**
 * A drawing for a line in a recipe's ingredient list, worked out from its name.
 *
 * Not `iconFor` on its own, which is tuned for what a catalogue row or a meal
 * is called. A recipe line names one raw thing ("2 tbsp oyster sauce", "chicken
 * thighs, boneless") and reads differently: `rice` in a pot is the uncooked
 * grain, not a bowl of it, `turkey` is a turkey rather than the grilled chicken
 * that stands in for it on a plate, and `pepper` is the peppercorn. So the
 * phrases here are laid over `TABLE` for this one question and nowhere else.
 * The scan cascade, the barcode reader and the retention sweep keep `iconFor`
 * exactly as it was.
 *
 * The app imports this file directly (`features/recipes/ingredientIcon.ts`),
 * as the jobs Worker imports `icon-match.ts`, so there is one table rather than
 * a copy per side. Nothing here may use Deno.
 */

import { iconFor, normaliseName, TABLE, WEAK_PHRASES } from './icon-match.ts'
import { ICON_NAMES } from './icons.generated.ts'
import type { IconChoice, IconSet } from './icons.ts'

/**
 * The drawings made for recipes in November 2026, each with the phrases that
 * name it. English first, then the Malay, Indonesian and other names a cook
 * here writes.
 *
 * Every key is in `food`. `icons.ts` leaves these out of the list a model picks
 * a meal's drawing from: a pinch of star anise is never a meal, and the list is
 * paid for on every typed meal.
 */
export const INGREDIENT_DRAWINGS: Record<string, readonly string[]> = {
  // -- Aromatics and fresh herbs -------------------------------------------
  shallots: ['shallot', 'shallots', 'eschalot', 'eschalots', 'bawang merah', 'bawang kecil'],
  'spring-onion': [
    'spring onion',
    'spring onions',
    'green onion',
    'green onions',
    'scallion',
    'scallions',
    'daun bawang',
  ],
  leek: ['leek', 'leeks'],
  lemongrass: ['lemongrass', 'lemon grass', 'serai', 'sereh'],
  galangal: ['galangal', 'lengkuas', 'blue ginger'],
  'turmeric-root': ['turmeric', 'turmeric root', 'fresh turmeric', 'kunyit', 'kunyit hidup'],
  'kaffir-lime-leaves': [
    'kaffir lime leaves',
    'kaffir lime leaf',
    'makrut lime leaves',
    'lime leaves',
    'lime leaf',
    'daun limau purut',
  ],
  'curry-leaves': ['curry leaves', 'curry leaf', 'daun kari'],
  'pandan-leaves': ['pandan', 'pandan leaves', 'pandan leaf', 'screwpine', 'daun pandan'],
  'coriander-leaves': [
    'coriander',
    'coriander leaves',
    'fresh coriander',
    'cilantro',
    'daun ketumbar',
  ],
  basil: ['basil', 'sweet basil', 'basil leaves'],
  'thai-basil': ['thai basil', 'holy basil', 'daun selasih', 'daun kemangi', 'kemangi'],
  mint: ['mint', 'mint leaves', 'pudina', 'daun pudina'],
  parsley: ['parsley'],
  dill: ['dill'],
  rosemary: ['rosemary'],
  thyme: ['thyme'],
  oregano: ['oregano', 'dried oregano'],
  'bay-leaves': ['bay leaf', 'bay leaves', 'daun salam', 'daun bay'],
  chives: ['chives', 'chive', 'garlic chives', 'kucai'],
  celery: ['celery', 'daun sup', 'saderi'],
  'torch-ginger-flower': ['torch ginger', 'torch ginger flower', 'bunga kantan', 'kantan'],
  'laksa-leaves': ['laksa leaves', 'laksa leaf', 'daun kesum', 'vietnamese coriander', 'kesum'],
  'banana-leaf': ['banana leaf', 'banana leaves', 'daun pisang'],
  'fennel-bulb': ['fennel', 'fennel bulb'],

  // -- Chillies and whole spices -------------------------------------------
  'bird-eye-chilli': [
    'bird eye chilli',
    'bird eye chillies',
    'birds eye chilli',
    'birds eye chillies',
    'bird s eye chilli',
    'bird s eye chillies',
    'thai chilli',
    'thai chillies',
    'chilli padi',
    'cili padi',
    'cabai rawit',
  ],
  'green-chilli': ['green chilli', 'green chillies', 'green chili', 'green chilies', 'cili hijau'],
  'dried-chilli': [
    'dried chilli',
    'dried chillies',
    'dried chili',
    'dried chilies',
    'dried red chillies',
    'cili kering',
    'cabai kering',
  ],
  'chilli-flakes': [
    'chilli flakes',
    'chili flakes',
    'red pepper flakes',
    'crushed red pepper',
    'crushed chilli',
    'gochugaru',
  ],
  jalapeno: ['jalapeno', 'jalapenos'],
  'star-anise': ['star anise', 'bunga lawang'],
  'cinnamon-stick': ['cinnamon', 'cinnamon stick', 'cinnamon sticks', 'kayu manis'],
  cloves: ['clove', 'cloves', 'bunga cengkih', 'cengkih', 'cengkeh'],
  cardamom: ['cardamom', 'cardamom pods', 'buah pelaga', 'pelaga'],
  'cumin-seeds': ['cumin', 'cumin seeds', 'ground cumin', 'jintan putih'],
  'coriander-seeds': [
    'coriander seeds',
    'coriander seed',
    'ground coriander',
    'coriander powder',
    'ketumbar',
    'serbuk ketumbar',
  ],
  'fennel-seeds': ['fennel seeds', 'fennel seed', 'jintan manis'],
  'black-peppercorns': [
    'pepper',
    'black pepper',
    'ground pepper',
    'ground black pepper',
    'peppercorns',
    'black peppercorns',
    'lada hitam',
    'lada',
  ],
  'white-pepper': ['white pepper', 'ground white pepper', 'serbuk lada putih', 'lada putih'],
  'sichuan-peppercorns': [
    'sichuan pepper',
    'sichuan peppercorns',
    'szechuan pepper',
    'szechuan peppercorns',
  ],
  nutmeg: ['nutmeg', 'mace', 'buah pala'],
  'mustard-seeds': ['mustard seeds', 'mustard seed', 'biji sawi'],
  'fenugreek-seeds': ['fenugreek', 'fenugreek seeds', 'halba'],
  'sesame-seeds': ['sesame', 'sesame seeds', 'sesame seed', 'bijan', 'toasted sesame'],
  saffron: ['saffron', 'kunyit kesumba'],
  'vanilla-pod': ['vanilla pod', 'vanilla bean', 'vanilla beans'],
  candlenuts: ['candlenut', 'candlenuts', 'buah keras', 'kemiri'],
  tamarind: ['tamarind', 'tamarind paste', 'tamarind pulp', 'asam jawa', 'assam jawa'],
  'asam-keping': ['asam keping', 'assam keping', 'asam gelugor', 'dried tamarind slices'],
  'garlic-powder': ['garlic powder', 'granulated garlic'],

  // -- Ground spices and sauces --------------------------------------------
  'turmeric-powder': ['turmeric powder', 'ground turmeric', 'serbuk kunyit'],
  'chilli-powder': [
    'chilli powder',
    'chili powder',
    'cayenne',
    'cayenne pepper',
    'kashmiri chilli',
    'serbuk cili',
  ],
  paprika: ['paprika', 'smoked paprika'],
  'curry-powder': ['curry powder', 'meat curry powder', 'fish curry powder', 'serbuk kari'],
  'garam-masala': ['garam masala', 'masala'],
  'five-spice-powder': ['five spice', 'five spice powder', '5 spice', 'serbuk lima rempah'],
  'oyster-sauce': ['oyster sauce', 'sos tiram'],
  'fish-sauce': ['fish sauce', 'nam pla', 'budu'],
  'dark-soy-sauce': ['dark soy', 'dark soy sauce', 'thick soy sauce', 'kicap pekat'],
  'kecap-manis': ['kecap manis', 'sweet soy sauce', 'kicap manis'],
  'hoisin-sauce': ['hoisin', 'hoisin sauce'],
  'chilli-sauce': ['chilli sauce', 'chili sauce', 'sos cili'],
  'sweet-chilli-sauce': ['sweet chilli sauce', 'sweet chili sauce', 'thai sweet chilli sauce'],
  'hot-sauce': ['hot sauce', 'sriracha', 'tabasco'],
  'chilli-oil': ['chilli oil', 'chili oil', 'chili crisp', 'chilli crisp', 'la yu'],
  'sesame-oil': ['sesame oil', 'minyak bijan'],
  'olive-oil': ['olive oil', 'extra virgin olive oil', 'minyak zaitun'],
  'coconut-oil': ['coconut oil', 'minyak kelapa'],
  ghee: ['ghee', 'minyak sapi'],
  'shaoxing-wine': [
    'shaoxing',
    'shaoxing wine',
    'shao hsing',
    'chinese cooking wine',
    'cooking wine',
    'rice wine',
    'hua tiao',
    'sake',
  ],
  mirin: ['mirin'],
  'worcestershire-sauce': ['worcestershire', 'worcestershire sauce', 'lea perrins'],
  'bbq-sauce': ['bbq sauce', 'barbecue sauce', 'barbeque sauce'],
  'balsamic-vinegar': ['balsamic', 'balsamic vinegar'],
  'broth-carton': [
    'stock',
    'broth',
    'chicken stock',
    'chicken broth',
    'beef stock',
    'beef broth',
    'vegetable stock',
    'vegetable broth',
    'fish stock',
    'bone broth',
    'pork stock',
    'dashi',
    'air rebusan',
  ],

  // -- Pastes, ferments and spreads ----------------------------------------
  'coconut-milk': ['coconut milk', 'santan', 'santan pekat', 'thick coconut milk'],
  'evaporated-milk': ['evaporated milk', 'susu cair', 'susu sejat'],
  'tomato-paste': ['tomato paste', 'tomato puree', 'puri tomato'],
  'canned-tomatoes': [
    'canned tomatoes',
    'tinned tomatoes',
    'chopped tomatoes',
    'crushed tomatoes',
    'diced tomatoes',
    'peeled tomatoes',
    'passata',
  ],
  'curry-paste': [
    'curry paste',
    'red curry paste',
    'green curry paste',
    'yellow curry paste',
    'tom yum paste',
    'tom yam paste',
    'laksa paste',
    'masala paste',
    'tikka masala paste',
    'rendang paste',
    'rempah',
  ],
  'chilli-paste': [
    'chilli paste',
    'chili paste',
    'cili boh',
    'chilli boh',
    'cili kisar',
    'blended chilli',
    'ground chilli',
    'sambal oelek',
  ],
  belacan: ['belacan', 'blacan', 'shrimp paste', 'terasi', 'trassi', 'prawn paste', 'hae ko'],
  'miso-paste': ['miso', 'miso paste', 'white miso', 'red miso'],
  gochujang: ['gochujang', 'korean chilli paste', 'korean chili paste'],
  doubanjiang: [
    'doubanjiang',
    'chilli bean paste',
    'chili bean paste',
    'bean paste',
    'taucu',
    'tauchu',
    'tau cheo',
    'fermented soybean paste',
    'soybean paste',
    'yellow bean sauce',
  ],
  'fermented-black-beans': ['fermented black beans', 'black bean sauce', 'douchi', 'tau si'],
  'peanut-butter': ['peanut butter', 'mentega kacang'],
  tahini: ['tahini', 'tahina', 'sesame paste'],
  kaya: ['kaya', 'kaya jam', 'coconut jam', 'srikaya'],
  'red-bean-paste': ['red bean paste', 'sweet bean paste', 'adzuki bean paste', 'tau sa', 'tausa'],
  pesto: ['pesto', 'basil pesto'],
  salsa: ['salsa', 'pico de gallo'],
  hummus: ['hummus', 'houmous'],
  kimchi: ['kimchi', 'kimchee'],
  wasabi: ['wasabi'],
  konjac: ['konjac', 'konnyaku', 'shirataki', 'shirataki noodles', 'konjac noodles'],
  'nata-de-coco': ['nata de coco', 'coconut gel'],
  'grass-jelly': ['grass jelly', 'cincau', 'leong fun'],
  'basil-seeds': ['basil seeds', 'biji selasih', 'selasih', 'sabja'],
  'fried-shallots': [
    'fried shallots',
    'crispy shallots',
    'fried onions',
    'crispy fried onions',
    'bawang goreng',
  ],

  // -- Baking and pantry ----------------------------------------------------
  'white-sugar': [
    'sugar',
    'white sugar',
    'caster sugar',
    'castor sugar',
    'granulated sugar',
    'fine sugar',
    'gula pasir',
    'gula halus',
    'gula',
  ],
  'brown-sugar': [
    'brown sugar',
    'light brown sugar',
    'dark brown sugar',
    'muscovado',
    'gula perang',
  ],
  'icing-sugar': [
    'icing sugar',
    'powdered sugar',
    'confectioners sugar',
    'confectioner s sugar',
    'gula aising',
  ],
  'rock-sugar': ['rock sugar', 'gula batu', 'yellow rock sugar'],
  'maple-syrup': ['maple syrup', 'maple'],
  cornstarch: [
    'cornstarch',
    'corn starch',
    'cornflour',
    'corn flour',
    'tepung jagung',
    'potato starch',
    'tapioca starch',
    'tapioca flour',
    'tepung ubi',
    'starch',
  ],
  'baking-powder': ['baking powder', 'serbuk penaik'],
  'baking-soda': ['baking soda', 'bicarbonate of soda', 'bicarb', 'soda bikarbonat'],
  yeast: ['yeast', 'instant yeast', 'dry yeast', 'active dry yeast', 'yis'],
  gelatin: ['gelatin', 'gelatine', 'gelatin sheets'],
  'rice-flour': ['rice flour', 'tepung beras'],
  'glutinous-rice-flour': [
    'glutinous rice flour',
    'sweet rice flour',
    'mochiko',
    'tepung pulut',
    'tepung beras pulut',
  ],
  breadcrumbs: ['breadcrumbs', 'bread crumbs', 'panko', 'serbuk roti'],
  semolina: ['semolina', 'suji', 'sooji'],
  'custard-powder': ['custard powder', 'serbuk kastard'],
  'milk-powder': ['milk powder', 'powdered milk', 'susu tepung', 'full cream milk powder'],
  'coconut-flakes': [
    'desiccated coconut',
    'shredded coconut',
    'coconut flakes',
    'grated coconut',
    'kerisik',
    'kelapa parut',
  ],
  'chocolate-chips': ['chocolate chips', 'choc chips', 'chocolate chunks', 'dark chocolate chips'],
  sprinkles: ['sprinkles', 'hundreds and thousands', 'rainbow sprinkles', 'meises'],
  'matcha-powder': ['matcha', 'matcha powder', 'green tea powder'],
  'tea-leaves': ['tea leaves', 'loose leaf tea', 'tea bag', 'tea bags', 'black tea leaves'],
  'tapioca-pearls': ['tapioca pearls', 'boba', 'boba pearls', 'sago pearls', 'mutiara'],
  'puff-pastry': [
    'puff pastry',
    'pastry sheets',
    'shortcrust pastry',
    'pie crust',
    'filo',
    'phyllo',
  ],
  'whipped-cream': ['whipped cream', 'whipped topping'],
  'vanilla-extract': ['vanilla', 'vanilla extract', 'vanilla essence', 'esen vanila'],

  // -- Dairy and eggs --------------------------------------------------------
  eggs: ['egg', 'eggs', 'large egg', 'large eggs', 'whole egg', 'telur', 'telur ayam'],
  'salted-egg': ['salted egg', 'salted eggs', 'salted egg yolk', 'salted duck egg', 'telur masin'],
  'century-egg': ['century egg', 'century eggs', 'preserved egg', 'pidan', 'telur pidan'],
  parmesan: ['parmesan', 'parmigiano', 'grana padano', 'pecorino'],
  mozzarella: ['mozzarella', 'burrata'],
  'cheese-slice': ['cheese slice', 'cheese slices', 'sliced cheese', 'processed cheese'],
  'cream-cheese': ['cream cheese', 'philadelphia'],
  feta: ['feta', 'feta cheese'],
  paneer: ['paneer'],
  'almond-milk': ['almond milk'],
  'oat-milk': ['oat milk'],
  'heavy-cream': [
    'heavy cream',
    'whipping cream',
    'double cream',
    'single cream',
    'thickened cream',
    'cooking cream',
    'light cream',
    'krim putar',
  ],
  'sour-cream': ['sour cream', 'creme fraiche'],
  'greek-yogurt': ['greek yogurt', 'greek yoghurt', 'plain yogurt', 'natural yogurt', 'dadih'],
  'egg-white': ['egg white', 'egg whites', 'putih telur'],
  'egg-yolk': ['egg yolk', 'egg yolks', 'kuning telur'],
  quail: ['quail', 'burung puyuh'],
  lard: ['lard', 'pork lard', 'minyak babi', 'shortening'],
  cheddar: ['cheddar', 'cheddar cheese', 'grated cheese', 'shredded cheese'],
  ricotta: ['ricotta', 'cottage cheese'],
  mascarpone: ['mascarpone'],
  'coconut-cream': ['coconut cream', 'santan kotak', 'pati santan'],

  // -- Meat and poultry -------------------------------------------------------
  'chicken-breast': [
    'chicken breast',
    'chicken breasts',
    'chicken fillet',
    'chicken fillets',
    'dada ayam',
    'isi ayam',
  ],
  'whole-chicken': [
    'whole chicken',
    'chicken',
    'ayam',
    'ayam kampung',
    'spring chicken',
    'poussin',
  ],
  'chicken-thigh': [
    'chicken thigh',
    'chicken thighs',
    'chicken leg',
    'chicken legs',
    'chicken quarter',
    'peha ayam',
  ],
  'minced-meat': [
    'minced meat',
    'mince',
    'minced beef',
    'ground beef',
    'beef mince',
    'ground meat',
    'daging cincang',
    'daging kisar',
  ],
  'pork-ribs': ['pork ribs', 'spare ribs', 'spareribs', 'baby back ribs', 'ribs', 'tulang babi'],
  bacon: ['bacon', 'streaky bacon', 'pancetta', 'beef bacon', 'turkey bacon'],
  mutton: ['mutton', 'lamb', 'leg of lamb', 'lamb shoulder', 'goat', 'daging kambing', 'kambing'],
  'beef-cubes': ['stewing beef', 'beef chunks', 'beef cubes', 'stew meat', 'beef shin', 'chuck'],
  oxtail: ['oxtail', 'ekor lembu'],
  liver: ['liver', 'chicken liver', 'chicken livers', 'beef liver', 'hati ayam', 'hati'],
  'chinese-sausage': [
    'chinese sausage',
    'chinese sausages',
    'lap cheong',
    'lap chong',
    'lup cheong',
    'lap cheung',
  ],
  salami: ['salami', 'pepperoni', 'chorizo'],
  turkey: ['turkey', 'whole turkey', 'turkey breast'],
  'chicken-feet': ['chicken feet', 'chicken foot', 'kaki ayam'],
  'pork-loin': ['pork loin', 'pork tenderloin', 'pork shoulder', 'pork collar', 'char siu pork'],
  'lamb-mince': ['lamb mince', 'minced lamb', 'ground lamb', 'minced mutton'],
  'beef-brisket': ['brisket', 'beef brisket', 'flank', 'beef flank', 'sengkel'],
  'duck-breast': ['duck breast', 'duck breasts'],
  'pork-chop': ['pork chop', 'pork chops'],
  'beef-bones': ['beef bones', 'marrow bones', 'soup bones', 'tulang lembu', 'pork bones'],
  'chicken-mince': ['chicken mince', 'minced chicken', 'ground chicken', 'ayam cincang'],
  'beef-tripe': ['tripe', 'beef tripe', 'perut lembu', 'babat'],
  'pork-mince': ['pork mince', 'minced pork', 'ground pork', 'babi cincang'],
  'luncheon-meat': ['luncheon meat', 'spam', 'canned ham'],
  'chicken-cubes': ['diced chicken', 'chicken pieces', 'chicken chunks', 'chicken cubes'],

  // -- Seafood ----------------------------------------------------------------
  'salmon-fillet': ['salmon', 'salmon fillet', 'salmon fillets', 'ikan salmon'],
  'tuna-can': ['tuna', 'canned tuna', 'tinned tuna', 'tuna chunks', 'tuna flakes'],
  sardines: ['sardine', 'sardines', 'canned sardines', 'sardin'],
  mackerel: ['mackerel', 'ikan kembung', 'kembung', 'ikan tenggiri', 'tenggiri', 'saba'],
  clams: ['clam', 'clams', 'lala', 'kepah', 'vongole'],
  scallops: ['scallop', 'scallops'],
  squid: ['squid', 'sotong', 'calamari', 'cuttlefish'],
  octopus: ['octopus', 'baby octopus', 'sotong kurita'],
  lobster: ['lobster', 'lobsters', 'crayfish', 'udang galah'],
  anchovies: ['anchovy', 'anchovies', 'ikan bilis', 'dried anchovies', 'teri'],
  'dried-shrimp': ['dried shrimp', 'dried shrimps', 'dried prawns', 'udang kering', 'hae bee'],
  'smoked-salmon': ['smoked salmon', 'lox'],
  'fish-roe': ['fish roe', 'roe', 'tobiko', 'ikura', 'caviar', 'mentaiko'],
  'crab-meat': ['crab meat', 'crabmeat', 'isi ketam'],
  'prawn-peeled': [
    'peeled prawns',
    'peeled shrimp',
    'prawns peeled',
    'shrimp peeled',
    'deveined prawns',
    'deveined shrimp',
    'prawn meat',
    'isi udang',
  ],
  tilapia: ['tilapia', 'ikan tilapia', 'ikan nila'],
  pomfret: ['pomfret', 'bawal', 'ikan bawal'],
  'cod-fillet': [
    'cod',
    'cod fillet',
    'white fish',
    'white fish fillet',
    'snapper',
    'red snapper',
    'halibut',
    'haddock',
    'dory',
    'ikan merah',
  ],
  'dried-squid': ['dried squid', 'sotong kering'],
  'bonito-flakes': ['bonito', 'bonito flakes', 'katsuobushi'],
  seabass: ['sea bass', 'seabass', 'barramundi', 'siakap', 'ikan siakap'],
  'dried-scallops': ['dried scallop', 'dried scallops', 'conpoy'],
  abalone: ['abalone'],
  'sea-cucumber': ['sea cucumber', 'gamat', 'timun laut'],
  kombu: ['kombu', 'kelp', 'dried kelp', 'dashima'],

  // -- Vegetables ---------------------------------------------------------------
  cucumber: ['cucumber', 'cucumbers', 'timun', 'japanese cucumber'],
  cabbage: ['cabbage', 'kubis', 'kobis', 'green cabbage', 'white cabbage'],
  'napa-cabbage': [
    'napa cabbage',
    'chinese cabbage',
    'wombok',
    'wong bok',
    'sawi putih',
    'kubis cina',
  ],
  'kai-lan': ['kai lan', 'kailan', 'gai lan', 'chinese broccoli'],
  broccoli: ['broccoli', 'brokoli', 'broccolini'],
  spinach: ['spinach', 'baby spinach', 'bayam'],
  kangkung: ['kangkung', 'water spinach', 'morning glory', 'ong choy'],
  lettuce: [
    'lettuce',
    'romaine',
    'iceberg',
    'salad leaves',
    'mixed greens',
    'salad greens',
    'salad',
  ],
  kale: ['kale', 'cavolo nero'],
  zucchini: ['zucchini', 'courgette', 'courgettes'],
  pumpkin: ['pumpkin', 'butternut', 'butternut squash', 'squash', 'labu', 'labu kuning'],
  'bitter-gourd': ['bitter gourd', 'bitter melon', 'peria', 'karela'],
  'long-beans': ['long beans', 'long bean', 'yardlong beans', 'kacang panjang', 'snake beans'],
  'snow-peas': [
    'snow peas',
    'snow pea',
    'mangetout',
    'sugar snap peas',
    'sugar snaps',
    'kacang pis',
  ],
  edamame: ['edamame'],
  radish: ['radish', 'daikon', 'white radish', 'lobak putih', 'mooli'],
  beetroot: ['beetroot', 'beet', 'beets', 'ubi bit'],
  jicama: ['jicama', 'sengkuang', 'yam bean', 'bangkuang'],
  'lotus-root': ['lotus root', 'lotus roots', 'akar teratai', 'renkon'],
  'bamboo-shoots': ['bamboo shoot', 'bamboo shoots', 'rebung'],
  'baby-corn': ['baby corn', 'jagung muda'],
  'cherry-tomatoes': ['cherry tomatoes', 'cherry tomato', 'grape tomatoes', 'tomato ceri'],
  'brussels-sprouts': ['brussels sprouts', 'brussel sprouts', 'brussels sprout'],
  artichoke: ['artichoke', 'artichokes', 'artichoke hearts'],
  'mustard-greens': [
    'mustard greens',
    'choy sum',
    'choi sum',
    'chye sim',
    'sawi',
    'sawi hijau',
    'bok choy',
    'pak choy',
    'bak choy',
    'pak choi',
  ],

  // -- Mushrooms, more vegetables, fruit -----------------------------------------
  shiitake: [
    'shiitake',
    'shiitake mushroom',
    'shiitake mushrooms',
    'dried mushrooms',
    'dried shiitake',
    'chinese mushrooms',
    'cendawan shiitake',
    'cendawan kering',
  ],
  enoki: ['enoki', 'enoki mushroom', 'enoki mushrooms', 'cendawan enoki', 'golden needle mushroom'],
  'oyster-mushroom': ['oyster mushroom', 'oyster mushrooms', 'cendawan tiram'],
  'wood-ear': ['wood ear', 'wood ear fungus', 'black fungus', 'cloud ear', 'kulat telinga tikus'],
  'tofu-skin': ['tofu skin', 'bean curd skin', 'beancurd skin', 'fucuk', 'fu chuk', 'yuba'],
  watercress: ['watercress', 'selada air'],
  'winter-melon': ['winter melon', 'wax gourd', 'kundur', 'labu kundur'],
  luffa: ['luffa', 'loofah', 'angled luffa', 'ridged gourd', 'petola'],
  petai: ['petai', 'stink beans', 'stink bean', 'pete'],
  cassava: ['cassava', 'ubi kayu', 'yuca', 'manioc'],
  'water-chestnut': ['water chestnut', 'water chestnuts', 'sengkuang cina'],
  chestnuts: ['chestnut', 'chestnuts', 'buah berangan', 'berangan'],
  arugula: ['arugula', 'rocket', 'rocket leaves'],
  turnip: ['turnip', 'turnips', 'swede', 'rutabaga', 'parsnip', 'parsnips'],
  calamansi: ['calamansi', 'kalamansi', 'limau kasturi', 'kasturi lime', 'calamondin'],
  raisins: ['raisin', 'raisins', 'sultana', 'sultanas', 'kismis', 'currants'],
  kiwi: ['kiwi', 'kiwis', 'kiwifruit', 'kiwi fruit'],
  raspberries: ['raspberry', 'raspberries'],
  pomegranate: ['pomegranate', 'pomegranate seeds', 'delima'],
  fig: ['fig', 'figs', 'dried figs', 'buah tin'],
  jackfruit: ['jackfruit', 'nangka', 'cempedak'],
  'dragon-fruit': ['dragon fruit', 'dragonfruit', 'pitaya', 'buah naga'],
  'passion-fruit': ['passion fruit', 'passionfruit', 'markisa'],
  'goji-berries': ['goji', 'goji berries', 'goji berry', 'wolfberry', 'wolfberries', 'kei chi'],
  'red-dates': ['red dates', 'red date', 'jujube', 'jujubes', 'chinese dates', 'kurma merah'],

  // -- Grains, noodles, wrappers, nuts, seeds, pulses ----------------------------------
  udon: ['udon', 'udon noodles'],
  'ramen-noodles': ['ramen', 'ramen noodles', 'fresh ramen'],
  soba: ['soba', 'soba noodles', 'buckwheat noodles'],
  'rice-paper': ['rice paper', 'rice papers', 'rice paper wrappers', 'banh trang'],
  'wonton-wrappers': [
    'wonton wrapper',
    'wonton wrappers',
    'wonton skins',
    'dumpling wrappers',
    'dumpling skins',
    'gyoza wrappers',
    'kulit wantan',
  ],
  'spring-roll-wrappers': [
    'spring roll wrappers',
    'spring roll pastry',
    'spring roll sheets',
    'popiah skin',
    'popiah wrappers',
    'kulit popiah',
  ],
  tortilla: ['tortilla', 'tortillas', 'wrap', 'wraps', 'flour tortillas'],
  couscous: ['couscous'],
  barley: ['barley', 'pearl barley', 'barli'],
  'lasagne-sheets': ['lasagne sheets', 'lasagna sheets', 'lasagne', 'lasagna'],
  penne: ['penne', 'rigatoni', 'fusilli', 'farfalle', 'pasta shapes', 'short pasta'],
  'basmati-rice': ['basmati', 'basmati rice', 'beras basmati'],
  'black-glutinous-rice': ['black glutinous rice', 'black rice', 'pulut hitam', 'forbidden rice'],
  'rice-cakes': ['rice cakes', 'rice cake', 'tteok', 'tteokbokki rice cakes', 'nian gao'],
  walnuts: ['walnut', 'walnuts', 'buah walnut'],
  pistachios: ['pistachio', 'pistachios'],
  hazelnuts: ['hazelnut', 'hazelnuts'],
  'pine-nuts': ['pine nut', 'pine nuts', 'pignoli'],
  'chia-seeds': ['chia', 'chia seeds', 'biji chia'],
  'pumpkin-seeds': ['pumpkin seeds', 'pepitas', 'kuaci labu'],
  'black-beans': ['black beans', 'black turtle beans'],
  'kidney-beans': ['kidney beans', 'red kidney beans'],
  'mung-beans': ['mung beans', 'mung bean', 'green beans dried', 'kacang hijau', 'moong'],
  'lotus-seeds': ['lotus seeds', 'lotus seed', 'biji teratai'],
  'gingko-nuts': ['ginkgo', 'gingko', 'ginkgo nuts', 'gingko nuts', 'ginkgo biloba nuts'],
  flaxseeds: ['flaxseed', 'flaxseeds', 'flax seeds', 'linseed', 'linseeds'],
  cranberries: ['cranberry', 'cranberries', 'dried cranberries', 'craisins'],
  'white-beans': ['white beans', 'cannellini', 'cannellini beans', 'butter beans', 'navy beans'],
}

/**
 * Drawings the app already had, read the way a recipe means them. The catalogue
 * draws `rice` as a cooked bowl, which is right for a meal and wrong for "2 cups
 * rice, rinsed". `null` means a line with no drawing rather than a wrong one.
 */
const RECIPE_READINGS: Record<string, string | null> = {
  rice: 'rice-grains',
  'jasmine rice': 'rice-grains',
  'white rice': 'rice-grains',
  'long grain rice': 'rice-grains',
  'uncooked rice': 'rice-grains',
  'short grain rice': 'rice-grains',
  'sushi rice': 'rice-grains',
  beras: 'rice-grains',
  'cooked rice': 'rice-bowl',
  'steamed rice': 'rice-bowl',
  'leftover rice': 'rice-bowl',
  'day old rice': 'rice-bowl',
  nasi: 'rice-bowl',
  noodles: 'egg-noodles',
  noodle: 'egg-noodles',
  mee: 'yellow-noodles',
  'kuey teow': 'flat-rice-noodles',
  'kway teow': 'flat-rice-noodles',
  'hor fun': 'flat-rice-noodles',
  'rice noodles': 'flat-rice-noodles',
  'rice stick': 'flat-rice-noodles',
  'rice sticks': 'flat-rice-noodles',
  salt: 'salt-shaker',
  'sea salt': 'salt-shaker',
  'kosher salt': 'salt-shaker',
  'salt and pepper': 'salt-shaker',
  garam: 'salt-shaker',
  'a pinch of salt': 'salt-pinch',
  'pinch of salt': 'salt-pinch',
  water: 'water-glass',
  'hot water': 'water-glass',
  'warm water': 'water-glass',
  'cold water': 'water-glass',
  'boiling water': 'water-glass',
  air: 'water-glass',
  ice: 'ice-cubes',
  'ice cubes': 'ice-cubes',
  'ice water': 'ice-cubes',
  ais: 'ice-cubes',
  'red pepper': 'bell-pepper',
  'green pepper': 'bell-pepper',
  'yellow pepper': 'bell-pepper',
  'red bell pepper': 'bell-pepper',
  capsicum: 'bell-pepper',
  'red chilli': 'chilli',
  'red chillies': 'chilli',
  'fresh chilli': 'chilli',
  chillies: 'chilli',
  chilies: 'chilli',
  'cili merah': 'chilli',
  cili: 'chilli',
  'palm sugar': 'gula-melaka',
  'coconut sugar': 'gula-melaka',
  jaggery: 'gula-melaka',
  'gula melaka': 'gula-melaka',
  'gula merah': 'gula-melaka',
  'gula aren': 'gula-melaka',
  'light soy sauce': 'soy-sauce',
  'soy sauce': 'soy-sauce',
  'soya sauce': 'soy-sauce',
  'light soy': 'soy-sauce',
  kicap: 'soy-sauce',
  'kicap cair': 'soy-sauce',
  tamari: 'soy-sauce',
  'rice vinegar': 'vinegar',
  'apple cider vinegar': 'vinegar',
  'white vinegar': 'vinegar',
  'black vinegar': 'vinegar',
  oil: 'cooking-oil',
  'vegetable oil': 'cooking-oil',
  'cooking oil': 'cooking-oil',
  'canola oil': 'cooking-oil',
  'sunflower oil': 'cooking-oil',
  'peanut oil': 'cooking-oil',
  'palm oil': 'cooking-oil',
  'neutral oil': 'cooking-oil',
  'stock cube': 'stock-cube',
  'stock powder': 'stock-cube',
  'stock granules': 'stock-cube',
  'fish balls': 'fish-ball',
  'fish ball': 'fish-ball',
  'beef balls': 'meatball',
  'beef ball': 'meatball',
  meatballs: 'meatball',
  'bebola daging': 'meatball',
  'bebola ikan': 'fish-ball',
  'mee hoon': 'rice-vermicelli',
  'bee hoon': 'rice-vermicelli',
  beehoon: 'rice-vermicelli',
  'wholegrain mustard': 'mustard',
  'dijon mustard': 'mustard',
  dijon: 'mustard',
  'english mustard': 'mustard',
  'stock cubes': 'stock-cube',
  'chicken stock cube': 'stock-cube',
  'chicken stock powder': 'stock-cube',
  'chicken powder': 'stock-cube',
  'chicken bouillon': 'stock-cube',
  'bouillon cube': 'stock-cube',
  'mushroom seasoning': 'stock-cube',
  msg: 'stock-cube',
  'all purpose flour': 'flour',
  'plain flour': 'flour',
  'self raising flour': 'flour',
  'self rising flour': 'flour',
  'bread flour': 'flour',
  'cake flour': 'flour',
  'wheat flour': 'flour',
  'tepung gandum': 'flour',
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  'full cream milk': 'milk-carton',
  'fresh milk': 'milk-carton',
  'whole milk': 'milk-carton',
  'beef slices': 'beef-slices',
  'sliced beef': 'beef-slices',
  'beef strips': 'beef-slices',
  'chicken wings': 'chicken-wing',
  'chicken drumsticks': 'chicken-drumstick',
  drumsticks: 'chicken-drumstick',
  prawns: 'prawn',
  shrimps: 'prawn',
  'tiger prawns': 'prawn',
  'king prawns': 'prawn',
  onions: 'onion',
  'red onion': 'onion',
  'red onions': 'onion',
  'yellow onion': 'onion',
  'white onion': 'onion',
  'bawang besar': 'onion',
  'big onion': 'onion',
  'bawang putih': 'garlic',
  'garlic cloves': 'garlic',
  'cloves garlic': 'garlic',
  'clove garlic': 'garlic',
  'garlic clove': 'garlic',
  'cloves of garlic': 'garlic',
  'clove of garlic': 'garlic',
  'ginger root': 'ginger',
  'fresh ginger': 'ginger',
  'ground ginger': 'spices',
  'lime juice': 'lime-juice',
  'lemon juice': 'lime-juice',
  'mixed spice': 'spices',
  'mixed herbs': 'herbs',
  'italian seasoning': 'herbs',
  'dried herbs': 'herbs',
  'mixed vegetables': 'vegetables',
  'frozen vegetables': 'vegetables',
  'chicken wing': 'chicken-wing',
  'quail eggs': 'quail-eggs',
  'quail egg': 'quail-eggs',
  'hard boiled eggs': 'boiled-egg',
  'boiled eggs': 'boiled-egg',
  'hard boiled egg': 'boiled-egg',
  'tofu puffs': 'fried-tofu-puff',
  'tau pok': 'fried-tofu-puff',
  taupok: 'fried-tofu-puff',
  'firm tofu': 'tofu',
  'silken tofu': 'tofu',
  'soft tofu': 'tofu',
  'egg tofu': 'tofu',
  'tomato ketchup': 'ketchup',
  cream: 'cream-tub',
  'coconut water': 'coconut-water',
  'condensed milk': 'condensed-milk',
  'sweetened condensed milk': 'condensed-milk',
  'cocoa powder': 'cocoa-powder',
  'dark chocolate': 'chocolate-bar',
  chocolate: 'chocolate-bar',
  // The leaf of a plant whose root is drawn. The root would name the wrong part,
  // and nothing else here looks like it, so no drawing.
  'turmeric leaf': null,
  'turmeric leaves': null,
  'daun kunyit': null,
}

/**
 * Every phrase the recipe reading knows, the catalogue's own table underneath
 * and the two above laid over it. A phrase both name takes the recipe's answer.
 *
 * Built on the first lookup rather than at import. The app imports this on the
 * way to a recipe, and every edge function that imports `icons.ts` loads it for
 * `INGREDIENT_DRAWINGS` alone; sorting two thousand phrases is wasted on both.
 */
type Phrase = { text: string; words: number; weak: boolean }
let table: Record<string, string | null> | undefined
let phrases: Phrase[] | undefined

export function recipeTable(): Record<string, string | null> {
  if (table) return table
  const built: Record<string, string | null> = { ...TABLE }
  for (const [icon, names] of Object.entries(INGREDIENT_DRAWINGS)) {
    for (const phrase of names) built[phrase] = icon
  }
  table = Object.assign(built, RECIPE_READINGS)
  return table
}

/**
 * Longest first, word count before length, as in `icon-match.ts`: "sweet chilli
 * sauce" beats "chilli sauce" beats "chilli". The catalogue's weak words (a
 * flavour on a packet more often than the food in it) still go last, so "honey
 * soy chicken" is a chicken.
 */
function recipePhrases(): Phrase[] {
  if (phrases) return phrases
  const weak = new Set(WEAK_PHRASES)
  phrases = Object.keys(recipeTable())
    .map((text) => ({ text, words: text.split(' ').length, weak: weak.has(text) }))
    .sort((a, b) =>
      a.weak !== b.weak
        ? Number(a.weak) - Number(b.weak)
        : b.words - a.words || b.text.length - a.text.length,
    )
  return phrases
}

const SET_OF = new Map<string, IconSet>()
for (const set of Object.keys(ICON_NAMES) as IconSet[]) {
  for (const name of ICON_NAMES[set]) if (!SET_OF.has(name)) SET_OF.set(name, set)
}

/**
 * The drawing for one line of a recipe, or null.
 *
 * Latin names go through the recipe table and stop at the most specific phrase,
 * null included, since a null there has already decided. Two phrases of the
 * same words and length are a tie that the order of the table used to settle,
 * which drew "dried chilli paste" as dried chillies; the one further along the
 * name wins instead, because an English name ends on what the thing is.
 *
 * A name in another script finds nothing here and falls through to `iconFor`,
 * whose script table reads Thai, Chinese and Japanese.
 */
export function ingredientIconFor(name: unknown): IconChoice | null {
  const text = normaliseName(name)
  if (text.trim().length > 0) {
    // "Sardines in soybean oil": what sits in the oil is the line's ingredient,
    // when the words before "in" name something.
    const cut = text.indexOf(' in ')
    const head = cut > 0 && text.indexOf(' oil ', cut) > 0 ? text.slice(0, cut + 1) : null
    const found = (head !== null ? recipeMatch(head) : null) ?? recipeMatch(text)
    if (found) {
      const read = head !== null && found.within === head ? head : text
      // An oil named for its source is a bottle of oil, not the source: "corn
      // oil", "rice bran oil for frying", "minyak jagung". On length alone the
      // source's phrase beat "oil" and drew a corn cob or a sack of rice.
      const icon =
        found.icon !== null &&
        !oilDrawings().has(found.icon) &&
        (read.indexOf(' oil ', found.end) >= 0 || read.startsWith(' minyak '))
          ? 'cooking-oil'
          : found.icon
      const set = icon ? SET_OF.get(icon) : undefined
      return icon && set ? { set, name: icon } : null
    }
  }
  return iconFor(name)
}

/**
 * The most specific recipe phrase in `text`, with where it ends, or null when
 * none is there. The icon is null when the table decided a phrase has no
 * drawing.
 */
function recipeMatch(text: string): { icon: string | null; end: number; within: string } | null {
  const all = recipePhrases()
  for (let i = 0; i < all.length; i++) {
    let best = all[i]
    let at = text.lastIndexOf(` ${best.text} `)
    if (at < 0) continue
    for (let j = i + 1; j < all.length; j++) {
      const next = all[j]
      if (next.weak !== best.weak || next.words !== best.words) break
      if (next.text.length !== best.text.length) break
      const later = text.lastIndexOf(` ${next.text} `)
      if (later > at) {
        best = next
        at = later
      }
    }
    // `end` is the space after the phrase, where a following word starts.
    return { icon: recipeTable()[best.text] ?? null, end: at + best.text.length + 1, within: text }
  }
  return null
}

/** Every drawing an oil's own name reaches ("sesame oil", "minyak sapi"): left as they are. */
let oils: Set<string> | undefined
function oilDrawings(): Set<string> {
  if (oils) return oils
  oils = new Set<string>()
  for (const [phrase, icon] of Object.entries(recipeTable())) {
    if (icon && (phrase === 'oil' || phrase.endsWith(' oil') || phrase.startsWith('minyak '))) {
      oils.add(icon)
    }
  }
  return oils
}
