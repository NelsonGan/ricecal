import { type CatalogueFood, REGION_DISHES } from "@/lib/catalogue";

/**
 * One page per market, and each one has to earn its place.
 *
 * Google treats near-identical pages spun up per country as doorway pages, so
 * nothing here is a template with the country name swapped in: the dish table,
 * the places people actually eat, the words they search in, and the questions
 * they ask are different on every page. `hreflang` then tells Google these are
 * regional variants of one another rather than duplicates.
 */
export type Country = {
  /** "Malaysian", "Filipino" — the word for the food, not for the place. */
  adjective: string;
  /**
   * The meta description: the paragraph in the search result, where `intro` is
   * the paragraph on the page. Kept to the ~150 characters Google prints, and
   * opening on the phrase somebody searched rather than on the product name.
   */
  blurb: string;
  /** Where people eat, in the words they use for it. */
  contexts: string[];
  /** Shown under the dish table. */
  dishNote: string;
  faq: Array<{ a: string; q: string }>;
  /** BCP 47, for hreflang. English is the app's only interface language. */
  hreflang: string;
  /** The paragraph under the H1. */
  intro: string;
  /** Search terms this page is written to answer. */
  keywords: string[];
  name: string;
  /**
   * What the category is called there, in the language it is called that in.
   *
   * `null` where English is what people actually type, since a local-language
   * phrase on a page with no local language on it is an invitation the page
   * cannot honour. Where it is set, the hero renders it under its own `lang`.
   */
  native: { lang: string; term: string } | null;
  /** "in Malaysia", "in the Philippines" — the article matters. */
  preposition: string;
  /**
   * The `<title>`, which is not the H1: this is for somebody who has not
   * clicked yet, so it leads with the words they typed. Keeping the two apart
   * also lets the page hold both "calorie tracker" and "calorie counter",
   * which are searched about as often as each other.
   *
   * Google truncates a tab at about 60 characters and the layout template
   * spends ten on " · RiceCal", so the budget here is 50.
   */
  searchTitle: string;
  slug: string;
  /** The H1. Carries the primary keyword. */
  title: string;
};

export const COUNTRIES: Country[] = [
  {
    adjective: "Malaysian",
    blurb:
      "A calorie tracker built for Malaysia. Nasi lemak by the bungkus, CKT by the plate, teh tarik by the glass. Snap it or search it.",
    contexts: [
      "Mamak",
      "Kopitiam",
      "Hawker stall",
      "Nasi campur",
      "Pasar malam",
      "Home cooked",
    ],
    dishNote:
      "Figures are for a typical stall portion. A nasi lemak bungkus is not the same size as a nasi lemak on a plate, and RiceCal carries both.",
    faq: [
      {
        a: "Yes. Malaysian dishes come from the national food composition table and thousands of researched hawker, mamak and kopitiam plates, with the local names and nicknames searchable. Type CKT and char kuey teow comes up first.",
        q: "Does RiceCal know Malaysian food?",
      },
      {
        a: "Portions are the ones people order. One bungkus, half a plate, two pieces with dhal, one biji. Grams sit behind a tap for anyone who wants them.",
        q: "Do I have to weigh nasi lemak to log it?",
      },
      {
        a: "Point the camera at the plate. A mixed rice plate is read item by item, so the rice, the ayam and each lauk are priced separately and you can correct any of them before saving.",
        q: "How do I log nasi campur, with four lauk on one plate?",
      },
    ],
    hreflang: "en-MY",
    intro:
      "RiceCal counts the food people actually eat in Malaysia. Nasi lemak by the bungkus, char kuey teow by the plate, roti canai by the piece, teh tarik by the glass. Snap the plate, say what you ate, scan a packet or search by name.",
    keywords: [
      "calorie counter malaysia",
      "malaysian food calories",
      "nasi lemak calories",
      "char kuey teow calories",
      "aplikasi kira kalori",
      "halal calorie tracker",
      "mamak food calories",
    ],
    name: "Malaysia",
    native: { lang: "ms", term: "aplikasi kira kalori" },
    preposition: "in Malaysia",
    searchTitle: "Malaysia Calorie Tracker: Nasi Lemak to Roti Canai",
    slug: "malaysia",
    title: "Calorie counter for Malaysian food",
  },
  {
    adjective: "Singaporean",
    blurb:
      "A calorie tracker for Singapore hawker food. Chicken rice, laksa, bak kut teh and cai fan, counted by the plate. Snap it or search it.",
    contexts: [
      "Hawker centre",
      "Kopitiam",
      "Food court",
      "Zi char",
      "Cai fan",
      "Home cooked",
    ],
    dishNote:
      "Hawker portions vary by stall. These are the middle of the range, and every figure can be corrected on the entry after you log it.",
    faq: [
      {
        a: "Yes. Chicken rice, katong laksa, bak kut teh, char kway teow, chilli crab, prata and kaya toast are all in the catalogue under the names you would use at the stall.",
        q: "Does RiceCal cover hawker centre food?",
      },
      {
        a: "Cai fan is read plate by plate. Photograph it and each dish you picked is named and priced on its own, so two veg and one meat is not a single guess.",
        q: "Can it handle economy rice, with whatever I picked?",
      },
      {
        a: "Yes. Steps and workouts come in from Apple Health or Health Connect, and what you burn is added on top of your budget rather than taken off your meal.",
        q: "Does it sync with my watch?",
      },
    ],
    hreflang: "en-SG",
    intro:
      "RiceCal counts hawker centre food properly. Chicken rice, katong laksa, char kway teow, bak kut teh and prata, by the plate rather than by the gram. Snap it, describe it, scan the packet or search the catalogue.",
    keywords: [
      "calorie counter singapore",
      "hawker food calories",
      "chicken rice calories",
      "laksa calories",
      "singapore calorie tracker app",
      "cai fan calories",
    ],
    name: "Singapore",
    native: null,
    preposition: "in Singapore",
    searchTitle: "Singapore Calorie Tracker for Hawker Food",
    slug: "singapore",
    title: "Calorie counter for Singapore hawker food",
  },
  {
    adjective: "Indonesian",
    blurb:
      "A calorie tracker for Indonesia. Nasi goreng per piring, soto per mangkuk, sate per stick, rendang per potong. Snap it or search it.",
    contexts: [
      "Warung",
      "Kaki lima",
      "Rumah makan Padang",
      "Angkringan",
      "Nasi campur",
      "Masak sendiri",
    ],
    dishNote:
      "One porsi as a warung serves it. Nasi Padang is counted per dish taken, because nobody takes the same three.",
    faq: [
      {
        a: "Yes. Nasi goreng, soto, rendang, gado-gado, bakso, gudeg, sate and pecel are all in the catalogue, under Indonesian names as well as English ones.",
        q: "Apakah RiceCal mengenali makanan Indonesia?",
      },
      {
        a: "Photograph the plate. Each lauk you took is named and priced separately, so a nasi campur with rendang, telur balado and sayur is three lines rather than one guess.",
        q: "How do I log nasi Padang?",
      },
      {
        a: "The interface is English, and the food names are Indonesian. Searching “ayam penyet” or “soto ayam” finds the dish; you do not have to translate your lunch first.",
        q: "Is the app in Bahasa Indonesia?",
      },
    ],
    hreflang: "en-ID",
    intro:
      "RiceCal counts Indonesian food the way a warung serves it. Nasi goreng per piring, soto per mangkuk, sate per stick, rendang per potong. Photograph the plate, describe it, scan a barcode or search by name.",
    keywords: [
      "kalkulator kalori indonesia",
      "aplikasi penghitung kalori",
      "nasi goreng calories",
      "rendang calories",
      "indonesian food calories",
      "calorie counter indonesia",
    ],
    name: "Indonesia",
    native: { lang: "id", term: "aplikasi penghitung kalori" },
    preposition: "in Indonesia",
    searchTitle: "Indonesia Calorie Tracker: Nasi Padang to Bakso",
    slug: "indonesia",
    title: "Calorie counter for Indonesian food",
  },
  {
    adjective: "Thai",
    blurb:
      "A calorie tracker for Thailand. Pad thai, tom yum, som tam and khao man gai, priced as a street stall serves them. Snap it or search it.",
    contexts: [
      "Street stall",
      "Food court",
      "Rice and curry shop",
      "Night market",
      "Som tam cart",
      "Home cooked",
    ],
    dishNote:
      "A plate as a street stall serves it, rice included where the dish normally comes with it. Sugar in the sauce is what moves these figures most.",
    faq: [
      {
        a: "Yes. Pad thai, tom yum, som tam, khao man gai, krapao and the curries are all in the catalogue, with the Thai names searchable alongside the English ones.",
        q: "Does RiceCal know Thai street food?",
      },
      {
        a: "Point the camera down at the plate. Rice, protein and the fried egg on top are read separately, so khao krapao with a fried egg is counted as what it is.",
        q: "How do I log a rice plate with a fried egg on top?",
      },
      {
        a: "Sweetness is where Thai dishes vary most. Log the dish, then correct the portion or swap to a lighter version of the same dish; the entry is editable for as long as you keep it.",
        q: "Thai food is sweeter at some stalls. Does that matter?",
      },
    ],
    hreflang: "en-TH",
    intro:
      "RiceCal counts Thai food by the plate. Pad thai, tom yum, som tam, khao man gai and the curries, priced as a street stall serves them. Snap the plate, describe it in your own words, scan a packet or search by name.",
    keywords: [
      "calorie counter thailand",
      "thai food calories",
      "pad thai calories",
      "tom yum calories",
      "som tam calories",
      "แคลอรี่ อาหารไทย",
    ],
    name: "Thailand",
    native: { lang: "th", term: "แอปนับแคลอรี่" },
    preposition: "in Thailand",
    searchTitle: "Thailand Calorie Tracker: Pad Thai to Som Tam",
    slug: "thailand",
    title: "Calorie counter for Thai food",
  },
  {
    adjective: "Filipino",
    blurb:
      "A calorie tracker for the Philippines. Adobo, sinigang, sisig and the silogs, rice and ulam counted apart. Snap it or search it.",
    contexts: [
      "Carinderia",
      "Turo-turo",
      "Silog house",
      "Fast food",
      "Handaan",
      "Home cooked",
    ],
    dishNote:
      "One serving as a carinderia plates it. Silog meals include the rice and the egg, because that is what silog means.",
    faq: [
      {
        a: "Yes. Adobo, sinigang, sisig, kare-kare, lechon, pancit and the silogs are all in the catalogue under Filipino names.",
        q: "Does RiceCal know Filipino food?",
      },
      {
        a: "Photograph the plate. Rice, ulam and egg are read as separate items, so a tapsilog is counted as three things rather than one.",
        q: "How do I log rice and ulam together?",
      },
      {
        a: "Yes. Say or type it the way you would say it, unli rice included, and the portion words are read along with the dish names.",
        q: "Can I just type what I ate?",
      },
    ],
    hreflang: "en-PH",
    intro:
      "RiceCal counts Filipino food the way it is served. Adobo, sinigang, sisig and the silogs, rice and ulam counted separately. Snap the plate, describe it, scan the packet or search the catalogue.",
    keywords: [
      "calorie counter philippines",
      "filipino food calories",
      "adobo calories",
      "sinigang calories",
      "silog calories",
      "calorie tracker app philippines",
    ],
    name: "the Philippines",
    native: null,
    preposition: "in the Philippines",
    searchTitle: "Philippines Calorie Tracker: Adobo to Tapsilog",
    slug: "philippines",
    title: "Calorie counter for Filipino food",
  },
  {
    adjective: "Vietnamese",
    blurb:
      "A calorie tracker for Vietnam. Phở, bún chả, bánh mì, cơm tấm and cà phê sữa đá, counted by the bowl. Snap it or search it.",
    contexts: [
      "Quán ăn",
      "Street cart",
      "Cơm bình dân",
      "Bánh mì stand",
      "Cà phê",
      "Home cooked",
    ],
    dishNote:
      "One bowl or one roll as a street stall serves it. The broth is counted; how much of it you drink is up to you.",
    faq: [
      {
        a: "Yes. Phở, bún chả, bánh mì, cơm tấm, gỏi cuốn and bún bò Huế are in the catalogue with their Vietnamese names, diacritics and all.",
        q: "Does RiceCal know Vietnamese food?",
      },
      {
        a: "Photograph the bowl or write it down. Noodles, meat and broth are read as parts of the dish, and you can correct the portion afterwards.",
        q: "How do I log a bowl of phở?",
      },
      {
        a: "Cà phê sữa đá is in the catalogue with the condensed milk counted. It is one of the drinks people most often forget to log.",
        q: "What about Vietnamese iced coffee?",
      },
    ],
    hreflang: "en-VN",
    intro:
      "RiceCal counts Vietnamese food by the bowl. Phở, bún chả, bánh mì, cơm tấm and cà phê sữa đá, with their own names and their own portions. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter vietnam",
      "vietnamese food calories",
      "pho calories",
      "banh mi calories",
      "đếm calo",
      "calorie tracker vietnam",
    ],
    name: "Vietnam",
    native: { lang: "vi", term: "ứng dụng đếm calo" },
    preposition: "in Vietnam",
    searchTitle: "Vietnam Calorie Tracker: Phở to Bánh Mì",
    slug: "vietnam",
    title: "Calorie counter for Vietnamese food",
  },
  {
    adjective: "Japanese",
    blurb:
      "A calorie tracker for Japan. Ramen by broth, donburi by size, katsu curry as it comes, konbini food by barcode. Snap it or search it.",
    contexts: [
      "Ramen shop",
      "Konbini",
      "Teishoku",
      "Izakaya",
      "Bento",
      "Home cooked",
    ],
    dishNote:
      "One bowl or one set as a shop serves it. Ramen varies most by broth: tonkotsu and iekei sit far above shio and shoyu.",
    faq: [
      {
        a: "Yes. Ramen by broth, donburi, katsu curry, udon, soba, onigiri, tempura and yakitori are all in the catalogue.",
        q: "Does RiceCal know Japanese food?",
      },
      {
        a: "Scan the barcode. Packaged food is exact, and the catalogue holds over three million barcoded products.",
        q: "Can I scan a konbini onigiri?",
      },
      {
        a: "Ramen is logged by its broth rather than as one generic bowl, because the difference between shio and tonkotsu is bigger than the difference between most whole meals.",
        q: "Ramen calories vary a lot. How is that handled?",
      },
    ],
    hreflang: "en-JP",
    intro:
      "RiceCal counts Japanese food by the bowl and by the set. Ramen by broth, donburi by size, katsu curry as it comes. Snap the bowl, describe it, scan a konbini barcode or search by name.",
    keywords: [
      "calorie counter japan",
      "japanese food calories",
      "ramen calories",
      "gyudon calories",
      "katsu curry calories",
      "calorie tracker app japan",
    ],
    name: "Japan",
    native: { lang: "ja", term: "カロリー計算アプリ" },
    preposition: "in Japan",
    searchTitle: "Japan Calorie Tracker: Ramen to Konbini Bento",
    slug: "japan",
    title: "Calorie counter for Japanese food",
  },
  {
    adjective: "Korean",
    blurb:
      "A calorie tracker for South Korea. Bibimbap, jjigae, samgyeopsal and tteokbokki, banchan counted apart. Snap it or search it.",
    contexts: [
      "Bunsik",
      "Gogi-jip",
      "Baekban",
      "Convenience store",
      "Chimaek",
      "Home cooked",
    ],
    dishNote:
      "One bowl or one serving as a restaurant plates it. Banchan are counted separately, because how many you finish is your business.",
    faq: [
      {
        a: "Yes. Bibimbap, jjigae, samgyeopsal, tteokbokki, japchae, gimbap and fried chicken are all in the catalogue.",
        q: "Does RiceCal know Korean food?",
      },
      {
        a: "Photograph the table. Each dish is named separately, so the meat, the rice and the banchan are three entries rather than one estimate.",
        q: "How do I log a Korean BBQ table?",
      },
      {
        a: "Yangnyeom chicken is counted per half chicken as a shop sells it, and you can drop the portion to a quarter or a third if you shared.",
        q: "What about fried chicken, shared between people?",
      },
    ],
    hreflang: "en-KR",
    intro:
      "RiceCal counts Korean food dish by dish. Bibimbap, jjigae, samgyeopsal, tteokbokki and chimaek, with the banchan counted on their own. Snap the table, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter korea",
      "korean food calories",
      "bibimbap calories",
      "tteokbokki calories",
      "samgyeopsal calories",
      "칼로리 계산 앱",
    ],
    name: "South Korea",
    native: { lang: "ko", term: "칼로리 계산 앱" },
    preposition: "in South Korea",
    searchTitle: "Korea Calorie Tracker: Bibimbap to Tteokbokki",
    slug: "south-korea",
    title: "Calorie counter for Korean food",
  },
  {
    adjective: "Chinese",
    blurb:
      "A calorie tracker for China. Dan dan mian, mapo tofu, xiaolongbao and roast duck, shared plates included. Snap it or search it.",
    contexts: [
      "Jiachangcai",
      "Noodle shop",
      "Dim sum",
      "Hotpot",
      "Street breakfast",
      "Home cooked",
    ],
    dishNote:
      "One plate or one bowl as a restaurant serves it, shared dishes counted whole. Take a share of it when you log if the table split it.",
    faq: [
      {
        a: "Yes. Sichuan, Cantonese, Beijing and Shanghai dishes are in the catalogue, from dan dan mian and mapo tofu to char siew and roast duck.",
        q: "Does RiceCal know Chinese food?",
      },
      {
        a: "Log the dish whole, then set the portion to the share you ate. A plate split three ways is one third, and the app does that arithmetic.",
        q: "How do I log a dish the whole table shared?",
      },
      {
        a: "Both. Dishes carry their Chinese names as searchable aliases alongside the romanised ones, so 麻婆豆腐 and mapo tofu reach the same row.",
        q: "Can I search in Chinese?",
      },
    ],
    hreflang: "en-CN",
    intro:
      "RiceCal counts Chinese food by the plate, including the ones the table shares. Dan dan mian, mapo tofu, xiaolongbao, char siew and roast duck. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter china",
      "chinese food calories",
      "mapo tofu calories",
      "xiaolongbao calories",
      "dan dan noodles calories",
      "卡路里 计算",
    ],
    name: "China",
    native: { lang: "zh-Hans", term: "卡路里计算器" },
    preposition: "in China",
    searchTitle: "China Calorie Tracker: Mapo Tofu to Xiaolongbao",
    slug: "china",
    title: "Calorie counter for Chinese food",
  },
  {
    adjective: "Hong Kong",
    blurb:
      "A calorie tracker for Hong Kong. Roast goose rice, wonton noodles, cheung fun, egg tarts and milk tea. Snap it or search it.",
    contexts: [
      "Cha chaan teng",
      "Dai pai dong",
      "Yum cha",
      "Siu mei shop",
      "Bakery",
      "Home cooked",
    ],
    dishNote:
      "One plate as a cha chaan teng serves it. Milk tea is counted with the evaporated milk, which is most of why it is not a free drink.",
    faq: [
      {
        a: "Yes. Roast goose, siu mei rice plates, wonton noodles, cheung fun, pineapple buns, egg tarts and HK milk tea are all in the catalogue.",
        q: "Does RiceCal know Hong Kong food?",
      },
      {
        a: "Dim sum is counted per basket, so three har gow and a siu mai is two entries with their own portions rather than one lump.",
        q: "How do I log yum cha?",
      },
      {
        a: "Hong Kong milk tea carries the evaporated milk and the sugar as served. Switching to less sugar changes the figure, and the app has both.",
        q: "Is milk tea counted properly?",
      },
    ],
    hreflang: "en-HK",
    intro:
      "RiceCal counts Hong Kong food the way a cha chaan teng serves it. Roast goose rice, wonton noodles, cheung fun, pineapple buns and milk tea. Snap the plate, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter hong kong",
      "hong kong food calories",
      "roast goose calories",
      "milk tea calories",
      "dim sum calories",
      "卡路里 App",
    ],
    name: "Hong Kong",
    native: { lang: "zh-Hant", term: "卡路里計算 App" },
    preposition: "in Hong Kong",
    searchTitle: "Hong Kong Calorie Tracker for Cha Chaan Teng Food",
    slug: "hong-kong",
    title: "Calorie counter for Hong Kong food",
  },
  {
    adjective: "Taiwanese",
    blurb:
      "A calorie tracker for Taiwan. Beef noodle soup, lu rou fan, gua bao and pearl milk tea with the pearls counted. Snap it or search it.",
    contexts: [
      "Night market",
      "Beef noodle shop",
      "Bento shop",
      "Breakfast shop",
      "Bubble tea stand",
      "Home cooked",
    ],
    dishNote:
      "One bowl or one cup as a shop sells it. Pearl milk tea is counted with the pearls, which are most of the sugar in it.",
    faq: [
      {
        a: "Yes. Beef noodle soup, lu rou fan, gua bao, oyster omelette, fried chicken cutlet and night market snacks are all in the catalogue.",
        q: "Does RiceCal know Taiwanese food?",
      },
      {
        a: "Pearl milk tea is counted with the pearls and the sugar as ordered. Half sugar and no pearls are separate rows, because they are separate drinks.",
        q: "How are bubble tea calories worked out?",
      },
      {
        a: "Snap each thing as you buy it. A night market run is easier logged in three photos than reconstructed from memory afterwards.",
        q: "What about a night market, where I eat four small things?",
      },
    ],
    hreflang: "en-TW",
    intro:
      "RiceCal counts Taiwanese food by the bowl and the cup. Beef noodle soup, lu rou fan, gua bao, oyster omelette and pearl milk tea with the pearls counted. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter taiwan",
      "taiwanese food calories",
      "beef noodle soup calories",
      "bubble tea calories",
      "lu rou fan calories",
      "熱量 計算 App",
    ],
    name: "Taiwan",
    native: { lang: "zh-Hant", term: "熱量計算 App" },
    preposition: "in Taiwan",
    searchTitle: "Taiwan Calorie Tracker: Beef Noodles to Bubble Tea",
    slug: "taiwan",
    title: "Calorie counter for Taiwanese food",
  },
  {
    adjective: "Indian",
    blurb:
      "A calorie tracker for India, with the curry and the bread kept apart. Butter chicken, biryani, masala dosa and chai. Snap it or search it.",
    contexts: [
      "Thali",
      "Dhaba",
      "Tiffin",
      "Street chaat",
      "South Indian",
      "Home cooked",
    ],
    dishNote:
      "One bowl of curry without rice or bread, so you can add the roti and the rice you actually took. Ghee is where most of the variation lives.",
    faq: [
      {
        a: "Yes. North and South Indian dishes are both in the catalogue, from butter chicken and dal makhani to masala dosa and idli, with breads counted per piece.",
        q: "Does RiceCal know Indian food?",
      },
      {
        a: "The curry and the bread are separate entries on purpose, so two rotis with dal is counted as two rotis with dal rather than as an average thali.",
        q: "Why is the curry counted without the rice?",
      },
      {
        a: "Yes. Vegetarian, paneer and dal dishes are all in the catalogue, and the food style tags you pick during setup push them up your search results.",
        q: "Is vegetarian food covered properly?",
      },
    ],
    hreflang: "en-IN",
    intro:
      "RiceCal counts Indian food with the curry and the bread kept apart, so a thali is what you actually took. Butter chicken, biryani, masala dosa, chole bhature and chai. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter india",
      "indian food calories",
      "butter chicken calories",
      "biryani calories",
      "roti calories",
      "calorie tracker app india",
    ],
    name: "India",
    native: null,
    preposition: "in India",
    searchTitle: "India Calorie Tracker: Roti, Dal and Biryani",
    slug: "india",
    title: "Calorie counter for Indian food",
  },
  {
    adjective: "Burmese",
    blurb:
      "A calorie tracker for Myanmar. Mohinga, Shan khao swè, nan gyi thoke and the tea shop plates, oil and all. Snap it or search it.",
    contexts: [
      "Tea shop",
      "Street stall",
      "Htamin zain",
      "Market",
      "Home cooked",
    ],
    dishNote:
      "One bowl as a tea shop serves it. Oil is where Burmese figures move most, and a curry ladled with its oil is not the same as one drained.",
    faq: [
      {
        a: "Yes. Mohinga, Shan khao swè, nan gyi thoke and the tea shop staples are in the catalogue.",
        q: "Does RiceCal know Burmese food?",
      },
      {
        a: "Photograph it or write it down. The bowl is read as its parts, so the noodles and the fritter on top are counted separately.",
        q: "How do I log mohinga?",
      },
      {
        a: "Recently loaded days stay readable with no connection. Logging something new needs a connection, because the food it is matched against lives on our servers.",
        q: "Does it work on a slow connection?",
      },
    ],
    hreflang: "en-MM",
    intro:
      "RiceCal counts Burmese food by the bowl. Mohinga, Shan khao swè, nan gyi thoke and the tea shop plates, oil and all. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter myanmar",
      "burmese food calories",
      "mohinga calories",
      "shan noodles calories",
      "calorie tracker myanmar",
    ],
    name: "Myanmar",
    native: null,
    preposition: "in Myanmar",
    searchTitle: "Myanmar Calorie Tracker: Mohinga to Shan Noodles",
    slug: "myanmar",
    title: "Calorie counter for Burmese food",
  },
  {
    adjective: "Sri Lankan",
    blurb:
      "A calorie tracker for Sri Lanka. Rice and curry, kottu, hoppers and pol sambol, coconut milk counted. Snap it or search it.",
    contexts: [
      "Rice and curry shop",
      "Kottu stall",
      "Hopper stand",
      "Bakery",
      "Home cooked",
    ],
    dishNote:
      "Curries are counted without rice, so you can add the rice you took. Coconut milk is what moves these figures most.",
    faq: [
      {
        a: "Yes. Rice and curry, kottu, hoppers, string hoppers, pol sambol and ambul thiyal are in the catalogue.",
        q: "Does RiceCal know Sri Lankan food?",
      },
      {
        a: "Log the rice and each curry separately. A rice and curry plate is five or six things, and counting it as one number hides which of them was heavy.",
        q: "How do I log a rice and curry plate?",
      },
      {
        a: "Hoppers are counted per hopper, plain and with egg, because an egg hopper is a different thing from a plain one.",
        q: "Are hoppers counted per piece?",
      },
    ],
    hreflang: "en-LK",
    intro:
      "RiceCal counts Sri Lankan food curry by curry. Rice and curry, kottu, hoppers and pol sambol, with the coconut milk counted. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter sri lanka",
      "sri lankan food calories",
      "kottu calories",
      "hoppers calories",
      "rice and curry calories",
    ],
    name: "Sri Lanka",
    native: null,
    preposition: "in Sri Lanka",
    searchTitle: "Sri Lanka Calorie Tracker: Rice, Curry and Kottu",
    slug: "sri-lanka",
    title: "Calorie counter for Sri Lankan food",
  },
  {
    adjective: "Pakistani",
    blurb:
      "A calorie tracker for Pakistan. Nihari, karahi, haleem, biryani and halwa puri, breads counted per piece. Snap it or search it.",
    contexts: [
      "Dhaba",
      "Karahi house",
      "Nihari shop",
      "Bakery",
      "Dawat",
      "Home cooked",
    ],
    dishNote:
      "Curries are counted without bread, so you can add the naan or the roti you took. Ghee and the oil on top are where the figures move.",
    faq: [
      {
        a: "Yes. Nihari, karahi, haleem, biryani, seekh kebab and halwa puri are in the catalogue, with the breads counted per piece.",
        q: "Does RiceCal know Pakistani food?",
      },
      {
        a: "Photograph the plate. The curry, the naan and the rice are read separately, so you can correct any one of them.",
        q: "How do I log a karahi shared with the table?",
      },
      {
        a: "Yes. The whole catalogue is available without a subscription, so you can look up a dish and read its calories before you decide anything.",
        q: "Can I look up a dish without paying?",
      },
    ],
    hreflang: "en-PK",
    intro:
      "RiceCal counts Pakistani food with the curry and the bread kept apart. Nihari, karahi, haleem, biryani and halwa puri. Snap it, describe it, scan a barcode or search by name.",
    keywords: [
      "calorie counter pakistan",
      "pakistani food calories",
      "nihari calories",
      "biryani calories",
      "karahi calories",
    ],
    name: "Pakistan",
    native: null,
    preposition: "in Pakistan",
    searchTitle: "Pakistan Calorie Tracker: Nihari to Biryani",
    slug: "pakistan",
    title: "Calorie counter for Pakistani food",
  },
];

/**
 * The name on its own, for a card, a chip or a breadcrumb.
 *
 * `name` carries its article because it is written into sentences ("Questions
 * from the Philippines"); a label that starts with a lowercase "the" is wrong.
 */
export function label(country: Country): string {
  return country.name.replace(/^the /, "");
}

/**
 * Everything this market's pages are written to answer. Each country's own
 * `keywords` carry the dishes and local phrases; this adds the plain
 * "malaysia calorie tracker" forms nobody would write out fifteen times, which
 * are in practice the most-typed queries of the lot.
 */
export function countryKeywords(country: Country): string[] {
  const place = label(country).toLowerCase();

  return [
    `${place} calorie tracker`,
    `calorie tracker app ${place}`,
    `${place} calorie counter`,
    ...country.keywords,
    ...(country.native ? [country.native.term] : []),
  ];
}

export function countryBySlug(slug: string): Country | undefined {
  return COUNTRIES.find((country) => country.slug === slug);
}

/**
 * The URL segment a country page lives at: its ISO 3166-1 alpha-2 code,
 * lowercased. `/my`, `/sg`, `/jp`.
 *
 * Derived from `hreflang` rather than stored beside it, since `en-MY` and
 * `/my` are one fact written twice. `slug` stays the editorial key: it is what
 * the generated `catalogue.ts` is keyed by and what the region store persists.
 */
export function countryCode(country: Country): string {
  return country.hreflang.split("-")[1].toLowerCase();
}

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => countryCode(country) === code);
}

export function dishesFor(slug: string): CatalogueFood[] {
  return REGION_DISHES[slug] ?? [];
}

export type { CatalogueFood };
