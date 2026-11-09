import {
  BOWL_NOODLE,
  BOWL_SOUP,
  COCONUT,
  GRILLED,
  MEAT,
  PLATE,
  PLATE_CURRY_RICE,
  PLATE_FRIED,
  PLATE_FRIED_ALT,
  PLATE_RICE,
  POT,
  STARCH,
} from "@/lib/dish-icons";
import type { RegionSlug } from "@/lib/regions";

/**
 * What the phone screens in the feature tour are showing, per market.
 *
 * They are drawn in HTML rather than shipped as pictures (see
 * `components/home/screens.tsx`), which is what makes this possible: a
 * screenshot of the app logging nasi lemak would have to be reshot fifteen
 * times, and this is data.
 *
 * Two rules kept throughout:
 *
 * - Every kcal figure for a finished dish is the catalogue's own, copied from
 *   `lib/catalogue.ts`, so no screen disagrees with the country page two
 *   scrolls down. Raw ingredients in `describe` are not catalogue rows, so
 *   they are ordinary estimates for the amounts named.
 * - `describe.perServing` is never written down. It is the ingredient rows
 *   summed over `servings` where the card is drawn, so the arithmetic on
 *   screen holds.
 */

export type PreviewRow = {
  detail: string;
  icon: string;
  kcal: number;
  title: string;
};

export type RegionPreview = {
  describe: {
    rows: PreviewRow[];
    /** What someone typed, in the shape people really type it. */
    sentence: string;
    servings: number;
  };
  log: {
    /** Mid-search, so the rows below it are what that prefix turns up. */
    query: string;
    rows: PreviewRow[];
  };
  recipes: Array<{ detail: string; icon: string; title: string }>;
  scan: {
    /** Rendered as "Looks like {dish}", so it is lowercase for a reason. */
    dish: string;
    icon: string;
    kcal: number;
    portion: string;
  };
};

const PREVIEWS = {
  asia: {
    describe: {
      rows: [
        { detail: "Half a bird, with skin", icon: MEAT, kcal: 620, title: "Chicken" },
        { detail: "1 cup, thick", icon: COCONUT, kcal: 445, title: "Coconut milk" },
        { detail: "4 medium, 380 g", icon: STARCH, kcal: 293, title: "Potatoes" },
      ],
      sentence:
        "Mum's chicken curry, half a chicken, one cup coconut milk, four potatoes, feeds five",
      servings: 5,
    },
    log: {
      query: "chicken",
      rows: [
        { detail: "1 plate", icon: PLATE_RICE, kcal: 600, title: "Hainanese chicken rice" },
        { detail: "1 quarter chicken", icon: GRILLED, kcal: 380, title: "Chicken inasal" },
      ],
    },
    recipes: [
      { detail: "4 servings, 9 ingredients, 272 kcal each", icon: POT, title: "Weeknight chicken curry" },
      { detail: "2 servings, 7 ingredients, 410 kcal each", icon: PLATE_FRIED, title: "Garlic fried rice" },
      { detail: "3 servings, 11 ingredients, 520 kcal each", icon: BOWL_NOODLE, title: "Noodle soup, my way" },
    ],
    scan: { dish: "pad thai", icon: PLATE_FRIED, kcal: 600, portion: "1 plate" },
  },

  china: {
    describe: {
      rows: [
        { detail: "500 g, minced", icon: MEAT, kcal: 900, title: "Pork" },
        { detail: "2 blocks, 600 g", icon: PLATE, kcal: 480, title: "Silken tofu" },
        { detail: "3 tablespoons", icon: POT, kcal: 180, title: "Doubanjiang" },
      ],
      sentence:
        "Ma po tofu, two blocks of silken tofu, 500 g minced pork, three spoons doubanjiang, feeds six",
      servings: 6,
    },
    log: {
      query: "mian",
      rows: [
        { detail: "1 bowl (350 g)", icon: BOWL_NOODLE, kcal: 510, title: "Dan dan mian" },
        { detail: "1 bowl (400 g)", icon: PLATE_FRIED, kcal: 600, title: "Beijing zhajiang mian" },
      ],
    },
    recipes: [
      { detail: "6 servings, 8 ingredients, 260 kcal each", icon: POT, title: "Ma po tofu, my way" },
      { detail: "4 servings, 12 ingredients, 385 kcal each", icon: PLATE_FRIED_ALT, title: "Yuxiang rousi" },
      { detail: "3 servings, 9 ingredients, 515 kcal each", icon: BOWL_NOODLE, title: "Chongqing xiaomian" },
    ],
    scan: { dish: "xiaolongbao", icon: PLATE, kcal: 340, portion: "6 pieces" },
  },

  "hong-kong": {
    describe: {
      rows: [
        { detail: "800 g, on the bone", icon: MEAT, kcal: 1150, title: "Beef brisket" },
        { detail: "3 tablespoons", icon: POT, kcal: 190, title: "Curry paste" },
        { detail: "2 large, 400 g", icon: STARCH, kcal: 300, title: "Daikon" },
      ],
      sentence:
        "Curry beef brisket, 800 g brisket, three spoons curry paste, two daikon, feeds six",
      servings: 6,
    },
    log: {
      query: "rice",
      rows: [
        { detail: "1 plate (450 g)", icon: PLATE_RICE, kcal: 850, title: "Roast goose rice" },
        { detail: "1 plate (450 g)", icon: PLATE_CURRY_RICE, kcal: 720, title: "Curry beef brisket rice" },
      ],
    },
    recipes: [
      { detail: "6 servings, 10 ingredients, 273 kcal each", icon: POT, title: "Curry brisket, ah ma's" },
      { detail: "4 servings, 7 ingredients, 280 kcal each", icon: PLATE, title: "Steamed cheung fun" },
      { detail: "2 servings, 5 ingredients, 340 kcal each", icon: STARCH, title: "Pineapple buns, weekend batch" },
    ],
    scan: { dish: "roast goose", icon: MEAT, kcal: 700, portion: "1 quarter" },
  },

  india: {
    describe: {
      rows: [
        { detail: "1 kg, bone in", icon: MEAT, kcal: 1400, title: "Chicken" },
        { detail: "1 cup, whisked", icon: COCONUT, kcal: 150, title: "Yoghurt" },
        { detail: "4 tablespoons", icon: POT, kcal: 460, title: "Ghee" },
      ],
      sentence:
        "Amma's chicken curry, one kilo chicken, a cup of yoghurt, four spoons ghee, feeds six",
      servings: 6,
    },
    log: {
      query: "chicken",
      rows: [
        { detail: "1 bowl (250 g), no rice", icon: POT, kcal: 490, title: "Butter chicken" },
        { detail: "1 plate (400 g)", icon: PLATE_CURRY_RICE, kcal: 680, title: "Lucknowi chicken biryani" },
      ],
    },
    recipes: [
      { detail: "6 servings, 14 ingredients, 335 kcal each", icon: POT, title: "Chicken curry, amma's" },
      { detail: "4 servings, 9 ingredients, 330 kcal each", icon: BOWL_SOUP, title: "Dal makhani, slow" },
      { detail: "3 servings, 11 ingredients, 470 kcal each", icon: PLATE, title: "Masala dosa, Sunday" },
    ],
    scan: { dish: "masala dosa", icon: PLATE, kcal: 470, portion: "1 piece" },
  },

  indonesia: {
    describe: {
      rows: [
        { detail: "1 kg, chuck", icon: MEAT, kcal: 1300, title: "Daging sapi" },
        { detail: "2 cups, thick", icon: COCONUT, kcal: 890, title: "Santan" },
        { detail: "5 tablespoons", icon: POT, kcal: 210, title: "Bumbu rendang" },
      ],
      sentence:
        "Rendang ibu, satu kilo daging, dua gelas santan, bumbu lima sendok, untuk delapan orang",
      servings: 8,
    },
    log: {
      query: "nasi",
      rows: [
        { detail: "1 piring", icon: PLATE_FRIED, kcal: 620, title: "Nasi goreng Jawa" },
        { detail: "1 porsi with rice and egg", icon: PLATE_CURRY_RICE, kcal: 700, title: "Gudeg komplit" },
      ],
    },
    recipes: [
      { detail: "8 servings, 13 ingredients, 300 kcal each", icon: POT, title: "Rendang ibu" },
      { detail: "4 servings, 10 ingredients, 430 kcal each", icon: PLATE, title: "Gado-gado, bumbu sendiri" },
      { detail: "3 servings, 8 ingredients, 470 kcal each", icon: BOWL_SOUP, title: "Soto ayam Lamongan" },
    ],
    scan: { dish: "nasi goreng", icon: PLATE_FRIED, kcal: 620, portion: "1 piring" },
  },

  japan: {
    describe: {
      rows: [
        { detail: "600 g, rolled", icon: MEAT, kcal: 1560, title: "Pork belly" },
        { detail: "1 litre, reduced", icon: POT, kcal: 240, title: "Shoyu tare" },
        { detail: "4 large", icon: STARCH, kcal: 280, title: "Ajitama eggs" },
      ],
      sentence:
        "Sunday ramen, 600 g pork belly, a litre of shoyu tare, four ajitama, feeds four",
      servings: 4,
    },
    log: {
      query: "ramen",
      rows: [
        { detail: "1 bowl (500 g)", icon: BOWL_SOUP, kcal: 620, title: "Hakata tonkotsu ramen" },
        { detail: "1 bowl (500 g)", icon: BOWL_NOODLE, kcal: 470, title: "Shio ramen" },
      ],
    },
    recipes: [
      { detail: "4 servings, 12 ingredients, 520 kcal each", icon: BOWL_SOUP, title: "Sunday ramen" },
      { detail: "3 servings, 8 ingredients, 570 kcal each", icon: PLATE_FRIED_ALT, title: "Okonomiyaki, Osaka style" },
      { detail: "2 servings, 6 ingredients, 350 kcal each", icon: BOWL_NOODLE, title: "Bukkake udon, quick" },
    ],
    scan: { dish: "katsu curry", icon: PLATE_CURRY_RICE, kcal: 875, portion: "1 plate" },
  },

  malaysia: {
    describe: {
      rows: [
        { detail: "Half a bird, with skin", icon: MEAT, kcal: 620, title: "Kampung chicken" },
        { detail: "1 cup, thick", icon: COCONUT, kcal: 445, title: "Coconut milk" },
        { detail: "4 medium, 380 g", icon: STARCH, kcal: 293, title: "Potatoes" },
      ],
      sentence:
        "Mum's chicken curry, half a kampung chicken, one cup coconut milk, four potatoes, feeds five",
      servings: 5,
    },
    log: {
      query: "nasi",
      rows: [
        { detail: "1 plate", icon: PLATE_RICE, kcal: 740, title: "Nasi lemak ayam goreng" },
        { detail: "1 plate", icon: PLATE_CURRY_RICE, kcal: 695, title: "Nasi kandar ikan" },
      ],
    },
    recipes: [
      { detail: "4 servings, 9 ingredients, 272 kcal each", icon: POT, title: "Kari ayam kampung" },
      { detail: "2 servings, 7 ingredients, 410 kcal each", icon: GRILLED, title: "Sambal ikan bakar" },
      { detail: "3 servings, 11 ingredients, 520 kcal each", icon: PLATE_FRIED_ALT, title: "Mee goreng mamak, my way" },
    ],
    scan: { dish: "char kuey teow", icon: PLATE_FRIED, kcal: 745, portion: "1 plate" },
  },

  myanmar: {
    describe: {
      rows: [
        { detail: "1 kg, whole", icon: GRILLED, kcal: 900, title: "Catfish" },
        { detail: "500 g, dry", icon: PLATE, kcal: 1800, title: "Rice noodles" },
        { detail: "1 cup, sliced", icon: STARCH, kcal: 320, title: "Banana stem" },
      ],
      sentence:
        "Mohinga for the family, one kilo catfish, 500 g rice noodles, banana stem, feeds eight",
      servings: 8,
    },
    log: {
      query: "khao swè",
      rows: [
        { detail: "1 bowl (450 g)", icon: PLATE_FRIED, kcal: 435, title: "Shan khao swè" },
        { detail: "1 bowl (500 g)", icon: BOWL_SOUP, kcal: 620, title: "Ohn no khao swè" },
      ],
    },
    recipes: [
      { detail: "8 servings, 12 ingredients, 378 kcal each", icon: BOWL_NOODLE, title: "Mohinga, Sunday pot" },
      { detail: "4 servings, 9 ingredients, 560 kcal each", icon: PLATE_FRIED_ALT, title: "Nan gyi thoke" },
      { detail: "3 servings, 7 ingredients, 515 kcal each", icon: PLATE_RICE, title: "Htamin jaw, leftovers" },
    ],
    scan: { dish: "mohinga", icon: BOWL_NOODLE, kcal: 460, portion: "1 bowl" },
  },

  pakistan: {
    describe: {
      rows: [
        { detail: "1.5 kg, shank", icon: MEAT, kcal: 1950, title: "Beef" },
        { detail: "5 tablespoons", icon: POT, kcal: 570, title: "Ghee" },
        { detail: "1 cup", icon: PLATE, kcal: 380, title: "Wheat flour" },
      ],
      sentence:
        "Nihari for Sunday, 1.5 kilo beef shank, five spoons ghee, a cup of flour, feeds ten",
      servings: 10,
    },
    log: {
      query: "biryani",
      rows: [
        { detail: "1 plate (400 g)", icon: PLATE_CURRY_RICE, kcal: 720, title: "Hyderabadi chicken dum biryani" },
        { detail: "1 bowl (300 g), no bread", icon: POT, kcal: 480, title: "Nihari" },
      ],
    },
    recipes: [
      { detail: "10 servings, 15 ingredients, 290 kcal each", icon: POT, title: "Nihari, Sunday pot" },
      { detail: "4 servings, 11 ingredients, 455 kcal each", icon: BOWL_SOUP, title: "Chicken karahi, quick" },
      { detail: "6 servings, 9 ingredients, 420 kcal each", icon: BOWL_NOODLE, title: "Haleem, slow" },
    ],
    scan: { dish: "chicken karahi", icon: BOWL_SOUP, kcal: 455, portion: "1 karahi" },
  },

  philippines: {
    describe: {
      rows: [
        { detail: "1 kg, bone in", icon: MEAT, kcal: 1520, title: "Pork belly" },
        { detail: "1 cup", icon: POT, kcal: 90, title: "Soy sauce and vinegar" },
        { detail: "2 bulbs, crushed", icon: STARCH, kcal: 90, title: "Garlic" },
      ],
      sentence:
        "Lola's adobo, one kilo pork belly, a cup of soy and vinegar, two bulbs garlic, feeds six",
      servings: 6,
    },
    log: {
      query: "sinigang",
      rows: [
        { detail: "1 bowl", icon: BOWL_SOUP, kcal: 320, title: "Sinigang na baboy" },
        { detail: "1 serving (2 pieces)", icon: POT, kcal: 380, title: "Adobong manok" },
      ],
    },
    recipes: [
      { detail: "6 servings, 8 ingredients, 283 kcal each", icon: POT, title: "Lola's adobo" },
      { detail: "4 servings, 11 ingredients, 320 kcal each", icon: BOWL_SOUP, title: "Sinigang na baboy" },
      { detail: "3 servings, 9 ingredients, 420 kcal each", icon: PLATE_FRIED, title: "Pancit canton, fiesta" },
    ],
    scan: { dish: "sisig", icon: PLATE_FRIED_ALT, kcal: 520, portion: "1 sizzling plate" },
  },

  singapore: {
    describe: {
      rows: [
        { detail: "1 kg, meaty", icon: MEAT, kcal: 1450, title: "Pork ribs" },
        { detail: "2 bulbs, whole", icon: STARCH, kcal: 90, title: "Garlic" },
        { detail: "2 tablespoons", icon: POT, kcal: 30, title: "White peppercorns" },
      ],
      sentence:
        "Ah ma's bak kut teh, one kilo pork ribs, two bulbs garlic, plenty of white pepper, feeds five",
      servings: 5,
    },
    log: {
      query: "chicken",
      rows: [
        { detail: "1 plate", icon: PLATE_RICE, kcal: 600, title: "Hainanese chicken rice, steamed" },
        { detail: "1 plate", icon: PLATE_CURRY_RICE, kcal: 720, title: "Nasi lemak Singapore, chicken wing" },
      ],
    },
    recipes: [
      { detail: "5 servings, 7 ingredients, 314 kcal each", icon: BOWL_SOUP, title: "Bak kut teh, ah ma's" },
      { detail: "4 servings, 12 ingredients, 560 kcal each", icon: BOWL_NOODLE, title: "Katong laksa, my way" },
      { detail: "2 servings, 9 ingredients, 480 kcal each", icon: GRILLED, title: "Sambal chilli crab" },
    ],
    scan: { dish: "katong laksa", icon: BOWL_NOODLE, kcal: 560, portion: "1 bowl" },
  },

  "south-korea": {
    describe: {
      rows: [
        { detail: "600 g, sliced", icon: MEAT, kcal: 1100, title: "Pork belly" },
        { detail: "400 g, aged", icon: POT, kcal: 120, title: "Kimchi" },
        { detail: "2 blocks, 600 g", icon: PLATE, kcal: 480, title: "Tofu" },
      ],
      sentence:
        "Kimchi jjigae, 600 g pork belly, a jar of aged kimchi, two blocks tofu, feeds six",
      servings: 6,
    },
    log: {
      query: "bap",
      rows: [
        { detail: "1 bowl (450 g)", icon: PLATE_RICE, kcal: 620, title: "Bibimbap" },
        { detail: "1 bowl (450 g)", icon: PLATE_FRIED_ALT, kcal: 700, title: "Jeyuk deopbap" },
      ],
    },
    recipes: [
      { detail: "6 servings, 9 ingredients, 283 kcal each", icon: BOWL_SOUP, title: "Kimchi jjigae, mum's" },
      { detail: "4 servings, 13 ingredients, 640 kcal each", icon: PLATE_FRIED, title: "Japchae, holiday batch" },
      { detail: "3 servings, 8 ingredients, 480 kcal each", icon: POT, title: "Tteokbokki, after work" },
    ],
    scan: { dish: "bibimbap", icon: PLATE_RICE, kcal: 620, portion: "1 bowl" },
  },

  "sri-lanka": {
    describe: {
      rows: [
        { detail: "500 g, red", icon: STARCH, kcal: 1750, title: "Masoor dhal" },
        { detail: "2 cups, thick", icon: COCONUT, kcal: 890, title: "Coconut milk" },
        { detail: "4 tablespoons", icon: POT, kcal: 120, title: "Curry powder and pandan" },
      ],
      sentence:
        "Dhal curry for the week, 500 g masoor dhal, two cups coconut milk, curry leaves, feeds ten",
      servings: 10,
    },
    log: {
      query: "hopper",
      rows: [
        { detail: "1 hopper (105 g)", icon: PLATE, kcal: 180, title: "Egg hopper" },
        { detail: "1 plate (350 g)", icon: PLATE_FRIED_ALT, kcal: 620, title: "String hopper pilaf" },
      ],
    },
    recipes: [
      { detail: "10 servings, 8 ingredients, 276 kcal each", icon: POT, title: "Dhal curry, week pot" },
      { detail: "3 servings, 12 ingredients, 720 kcal each", icon: PLATE_FRIED, title: "Chicken kottu, Friday" },
      { detail: "6 servings, 5 ingredients, 115 kcal each", icon: COCONUT, title: "Pol sambol, fresh" },
    ],
    scan: { dish: "kottu roti", icon: PLATE_FRIED, kcal: 720, portion: "1 plate" },
  },

  taiwan: {
    describe: {
      rows: [
        { detail: "1 kg, shank", icon: MEAT, kcal: 1450, title: "Beef" },
        { detail: "500 g, fresh", icon: PLATE, kcal: 700, title: "Wheat noodles" },
        { detail: "4 tablespoons", icon: POT, kcal: 170, title: "Doubanjiang and soy" },
      ],
      sentence:
        "Beef noodle soup, one kilo beef shank, 500 g noodles, doubanjiang, feeds six",
      servings: 6,
    },
    log: {
      query: "fan",
      rows: [
        { detail: "1 bowl (300 g)", icon: PLATE_RICE, kcal: 480, title: "Lu rou fan" },
        { detail: "1 bowl (600 g)", icon: BOWL_NOODLE, kcal: 620, title: "Taiwanese beef noodle soup" },
      ],
    },
    recipes: [
      { detail: "6 servings, 11 ingredients, 387 kcal each", icon: BOWL_NOODLE, title: "Beef noodle soup, slow" },
      { detail: "4 servings, 8 ingredients, 480 kcal each", icon: PLATE_RICE, title: "Lu rou fan, big pot" },
      { detail: "2 servings, 7 ingredients, 400 kcal each", icon: PLATE_FRIED_ALT, title: "Oyster omelette, night market" },
    ],
    scan: { dish: "lu rou fan", icon: PLATE_RICE, kcal: 480, portion: "1 bowl" },
  },

  thailand: {
    describe: {
      rows: [
        { detail: "800 g, thigh", icon: MEAT, kcal: 1400, title: "Chicken" },
        { detail: "2 cups, thick", icon: COCONUT, kcal: 890, title: "Coconut milk" },
        { detail: "5 tablespoons", icon: POT, kcal: 150, title: "Green curry paste" },
      ],
      sentence:
        "Green curry, 800 g chicken thigh, two cups coconut milk, five spoons paste, feeds eight",
      servings: 8,
    },
    log: {
      query: "khao",
      rows: [
        { detail: "1 plate", icon: PLATE_RICE, kcal: 630, title: "Khao man gai" },
        { detail: "1 plate", icon: PLATE_FRIED, kcal: 620, title: "Khao pad poo" },
      ],
    },
    recipes: [
      { detail: "8 servings, 10 ingredients, 305 kcal each", icon: POT, title: "Green curry, big pot" },
      { detail: "4 servings, 12 ingredients, 600 kcal each", icon: PLATE_FRIED, title: "Pad thai, my way" },
      { detail: "3 servings, 7 ingredients, 290 kcal each", icon: BOWL_SOUP, title: "Tom yum goong" },
    ],
    scan: { dish: "pad krapao", icon: PLATE_RICE, kcal: 730, portion: "1 plate with rice and egg" },
  },

  vietnam: {
    describe: {
      rows: [
        { detail: "2 kg, marrow", icon: MEAT, kcal: 1600, title: "Beef bones" },
        { detail: "800 g, fresh", icon: PLATE, kcal: 880, title: "Bánh phở noodles" },
        { detail: "Star anise, cassia, ginger", icon: POT, kcal: 40, title: "Spices" },
      ],
      sentence:
        "Phở for the weekend, two kilo beef bones, 800 g bánh phở, star anise and cassia, feeds eight",
      servings: 8,
    },
    log: {
      query: "bún",
      rows: [
        { detail: "1 bowl (600 g)", icon: PLATE_FRIED, kcal: 450, title: "Bún chả cá Quy Nhơn" },
        { detail: "1 bowl (650 g)", icon: BOWL_SOUP, kcal: 620, title: "Bún bò Huế giò heo" },
      ],
    },
    recipes: [
      { detail: "8 servings, 12 ingredients, 315 kcal each", icon: BOWL_NOODLE, title: "Phở bò, weekend pot" },
      { detail: "4 servings, 9 ingredients, 780 kcal each", icon: PLATE_RICE, title: "Cơm tấm sườn" },
      { detail: "3 servings, 8 ingredients, 320 kcal each", icon: MEAT, title: "Chả giò, Tết batch" },
    ],
    scan: { dish: "phở bò", icon: BOWL_NOODLE, kcal: 470, portion: "1 bowl (600 g)" },
  },
} satisfies Record<RegionSlug, RegionPreview>;

export function previewFor(slug: RegionSlug): RegionPreview {
  return PREVIEWS[slug];
}

/** The sum of the ingredient rows over the servings. See the note above. */
export function perServing(describe: RegionPreview["describe"]): number {
  const total = describe.rows.reduce((sum, row) => sum + row.kcal, 0);
  return Math.round(total / describe.servings);
}
