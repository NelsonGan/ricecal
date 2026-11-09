import { COUNTRIES, countryBySlug, countryCode, label } from "@/lib/countries";
import {
  BOWL_NOODLE,
  BOWL_SOUP,
  COCONUT,
  DESSERT,
  DRINK,
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

/**
 * What the home page shows a reader who has told us nothing about themselves.
 *
 * The country pages under `/[code]` are one page per market, crawled as
 * itself. The home page is one URL for the whole region instead: it ships the
 * pan-Asian set in its HTML and swaps to a local one in the browser once there
 * is something to go on, so Google indexes the generic page while a reader in
 * Seoul sees tteokbokki.
 *
 * Detection is by IANA time zone rather than by IP or `navigator.language`.
 * Language says what someone reads, not where they eat, and an IP lookup would
 * make the page dynamic for a guess the footer picker exists to correct.
 */

export type ChipDish = {
  /** A path under `/public`. See `lib/dish-icons.ts` for the vocabulary. */
  icon: string;
  name: string;
};

/**
 * Eight dishes a person from that market would name without thinking. The
 * short forms people say out loud, not the catalogue rows in `lib/catalogue.ts`
 * — "Ramen", not "Hakata Tonkotsu Ramen", which no chip has room for.
 */
const DISHES = {
  asia: [
    { icon: BOWL_NOODLE, name: "Pho" },
    { icon: BOWL_SOUP, name: "Ramen" },
    { icon: PLATE_FRIED, name: "Pad thai" },
    { icon: PLATE_RICE, name: "Bibimbap" },
    { icon: PLATE, name: "Dim sum" },
    { icon: PLATE_CURRY_RICE, name: "Biryani" },
    { icon: PLATE_FRIED_ALT, name: "Nasi goreng" },
    { icon: DRINK, name: "Bubble tea" },
  ],
  china: [
    { icon: BOWL_NOODLE, name: "Dan dan mian" },
    { icon: POT, name: "Mapo tofu" },
    { icon: PLATE, name: "Xiaolongbao" },
    { icon: PLATE_FRIED, name: "Zhajiang mian" },
    { icon: GRILLED, name: "Char siew" },
    { icon: MEAT, name: "Roast duck" },
    { icon: BOWL_SOUP, name: "Hotpot" },
    { icon: STARCH, name: "Youtiao" },
  ],
  "hong-kong": [
    { icon: PLATE_RICE, name: "Roast goose rice" },
    { icon: BOWL_NOODLE, name: "Wonton noodles" },
    { icon: PLATE, name: "Cheung fun" },
    { icon: STARCH, name: "Siu mai" },
    { icon: COCONUT, name: "Pineapple bun" },
    { icon: DESSERT, name: "Egg tart" },
    { icon: POT, name: "Curry brisket" },
    { icon: DRINK, name: "HK milk tea" },
  ],
  india: [
    { icon: POT, name: "Butter chicken" },
    { icon: PLATE_CURRY_RICE, name: "Biryani" },
    { icon: PLATE, name: "Masala dosa" },
    { icon: STARCH, name: "Chole bhature" },
    { icon: BOWL_SOUP, name: "Dal makhani" },
    { icon: MEAT, name: "Tandoori chicken" },
    { icon: PLATE_RICE, name: "Pav bhaji" },
    { icon: DRINK, name: "Masala chai" },
  ],
  indonesia: [
    { icon: PLATE_FRIED, name: "Nasi goreng" },
    { icon: POT, name: "Rendang" },
    { icon: MEAT, name: "Sate ayam" },
    { icon: PLATE, name: "Gado-gado" },
    { icon: BOWL_SOUP, name: "Soto ayam" },
    { icon: PLATE_CURRY_RICE, name: "Nasi Padang" },
    { icon: BOWL_NOODLE, name: "Bakso" },
    { icon: DESSERT, name: "Es cendol" },
  ],
  japan: [
    { icon: BOWL_SOUP, name: "Ramen" },
    { icon: PLATE_CURRY_RICE, name: "Katsu curry" },
    { icon: PLATE_RICE, name: "Gyudon" },
    { icon: BOWL_NOODLE, name: "Udon" },
    { icon: STARCH, name: "Onigiri" },
    { icon: PLATE, name: "Sushi" },
    { icon: GRILLED, name: "Yakitori" },
    { icon: MEAT, name: "Karaage" },
  ],
  malaysia: [
    { icon: PLATE_RICE, name: "Nasi lemak" },
    { icon: PLATE_FRIED, name: "Char kuey teow" },
    { icon: BOWL_NOODLE, name: "Laksa" },
    { icon: PLATE_CURRY_RICE, name: "Nasi kandar" },
    { icon: DRINK, name: "Teh tarik" },
    { icon: BOWL_SOUP, name: "Bak kut teh" },
    { icon: DESSERT, name: "Cendol" },
    { icon: PLATE_FRIED_ALT, name: "Mee goreng" },
  ],
  myanmar: [
    { icon: BOWL_NOODLE, name: "Mohinga" },
    { icon: PLATE_FRIED, name: "Shan khao swè" },
    { icon: PLATE_FRIED_ALT, name: "Nan gyi thoke" },
    { icon: BOWL_SOUP, name: "Ohn no khao swè" },
    { icon: PLATE_RICE, name: "Htamin jaw" },
    { icon: STARCH, name: "Samusa thoke" },
    { icon: POT, name: "Tea shop curry" },
    { icon: DRINK, name: "Laphet yay" },
  ],
  pakistan: [
    { icon: POT, name: "Nihari" },
    { icon: BOWL_SOUP, name: "Chicken karahi" },
    { icon: PLATE_CURRY_RICE, name: "Biryani" },
    { icon: GRILLED, name: "Seekh kebab" },
    { icon: BOWL_NOODLE, name: "Haleem" },
    { icon: MEAT, name: "Chapli kebab" },
    { icon: STARCH, name: "Halwa puri" },
    { icon: DRINK, name: "Kashmiri chai" },
  ],
  philippines: [
    { icon: POT, name: "Adobo" },
    { icon: BOWL_SOUP, name: "Sinigang" },
    { icon: PLATE_FRIED_ALT, name: "Sisig" },
    { icon: PLATE_FRIED, name: "Pancit" },
    { icon: PLATE_RICE, name: "Tapsilog" },
    { icon: MEAT, name: "Lechon" },
    { icon: STARCH, name: "Lumpia" },
    { icon: DESSERT, name: "Halo-halo" },
  ],
  singapore: [
    { icon: PLATE_RICE, name: "Chicken rice" },
    { icon: BOWL_NOODLE, name: "Katong laksa" },
    { icon: BOWL_SOUP, name: "Bak kut teh" },
    { icon: PLATE_FRIED, name: "Char kway teow" },
    { icon: PLATE_CURRY_RICE, name: "Cai fan" },
    { icon: PLATE, name: "Roti prata" },
    { icon: GRILLED, name: "Chilli crab" },
    { icon: DRINK, name: "Kopi" },
  ],
  "south-korea": [
    { icon: PLATE_RICE, name: "Bibimbap" },
    { icon: BOWL_SOUP, name: "Kimchi jjigae" },
    { icon: GRILLED, name: "Samgyeopsal" },
    { icon: POT, name: "Tteokbokki" },
    { icon: PLATE_FRIED, name: "Japchae" },
    { icon: PLATE, name: "Gimbap" },
    { icon: MEAT, name: "Fried chicken" },
    { icon: DESSERT, name: "Patbingsu" },
  ],
  "sri-lanka": [
    { icon: PLATE_CURRY_RICE, name: "Rice and curry" },
    { icon: PLATE_FRIED, name: "Kottu" },
    { icon: PLATE, name: "Egg hopper" },
    { icon: PLATE_FRIED_ALT, name: "String hoppers" },
    { icon: POT, name: "Dhal curry" },
    { icon: COCONUT, name: "Pol sambol" },
    { icon: BOWL_SOUP, name: "Ambul thiyal" },
    { icon: DRINK, name: "Ceylon tea" },
  ],
  taiwan: [
    { icon: BOWL_NOODLE, name: "Beef noodle soup" },
    { icon: PLATE_RICE, name: "Lu rou fan" },
    { icon: STARCH, name: "Gua bao" },
    { icon: PLATE_FRIED_ALT, name: "Oyster omelette" },
    { icon: MEAT, name: "Popcorn chicken" },
    { icon: PLATE, name: "Scallion pancake" },
    { icon: BOWL_SOUP, name: "Stinky tofu" },
    { icon: DRINK, name: "Pearl milk tea" },
  ],
  thailand: [
    { icon: PLATE_FRIED, name: "Pad thai" },
    { icon: BOWL_SOUP, name: "Tom yum" },
    { icon: PLATE, name: "Som tam" },
    { icon: POT, name: "Green curry" },
    { icon: PLATE_RICE, name: "Khao man gai" },
    { icon: GRILLED, name: "Moo ping" },
    { icon: DESSERT, name: "Mango sticky rice" },
    { icon: DRINK, name: "Thai iced tea" },
  ],
  vietnam: [
    { icon: BOWL_NOODLE, name: "Phở" },
    { icon: STARCH, name: "Bánh mì" },
    { icon: PLATE_FRIED, name: "Bún chả" },
    { icon: PLATE_RICE, name: "Cơm tấm" },
    { icon: PLATE, name: "Gỏi cuốn" },
    { icon: BOWL_SOUP, name: "Bún bò Huế" },
    { icon: MEAT, name: "Chả giò" },
    { icon: DRINK, name: "Cà phê sữa đá" },
  ],
} satisfies Record<string, ChipDish[]>;

export type RegionSlug = keyof typeof DISHES;

export const DEFAULT_REGION = "asia" satisfies RegionSlug;

/**
 * Time zones that mean a country we have a set for. Anything else, including
 * every zone outside Asia, falls back to the pan-Asian set — a reader in
 * London gets the same page Google indexes.
 */
const TIME_ZONES: Record<string, RegionSlug> = {
  "Asia/Bangkok": "thailand",
  "Asia/Calcutta": "india",
  "Asia/Chongqing": "china",
  "Asia/Colombo": "sri-lanka",
  "Asia/Dhaka": "india",
  "Asia/Harbin": "china",
  "Asia/Ho_Chi_Minh": "vietnam",
  "Asia/Hong_Kong": "hong-kong",
  "Asia/Jakarta": "indonesia",
  "Asia/Jayapura": "indonesia",
  "Asia/Karachi": "pakistan",
  "Asia/Kashgar": "china",
  "Asia/Kathmandu": "india",
  "Asia/Kolkata": "india",
  "Asia/Kuala_Lumpur": "malaysia",
  "Asia/Kuching": "malaysia",
  "Asia/Macau": "hong-kong",
  "Asia/Makassar": "indonesia",
  "Asia/Manila": "philippines",
  "Asia/Pontianak": "indonesia",
  "Asia/Rangoon": "myanmar",
  "Asia/Saigon": "vietnam",
  "Asia/Seoul": "south-korea",
  "Asia/Shanghai": "china",
  "Asia/Singapore": "singapore",
  "Asia/Taipei": "taiwan",
  "Asia/Tokyo": "japan",
  "Asia/Urumqi": "china",
  "Asia/Yangon": "myanmar",
};

export function isRegion(value: string): value is RegionSlug {
  return Object.hasOwn(DISHES, value);
}

export function regionFromTimeZone(timeZone: string | undefined): RegionSlug {
  if (!timeZone) return DEFAULT_REGION;
  return TIME_ZONES[timeZone] ?? DEFAULT_REGION;
}

export function dishesForRegion(slug: RegionSlug): ChipDish[] {
  return DISHES[slug];
}

export function regionLabel(slug: RegionSlug): string {
  const country = countryBySlug(slug);
  return country ? label(country) : "Asia";
}

const CODES = new Set(COUNTRIES.map(countryCode));

/**
 * The part of a path that comes after the country: `/my/food` → `"food"`.
 *
 * Empty for `/my`, and empty for anything that is not a country path at all —
 * the legal pages are single, unprefixed copies, so `/privacy` has no
 * Malaysian counterpart to carry the reader across to.
 */
export function pathAfterRegion(pathname: string): string {
  const [first, ...rest] = pathname.split("/").filter(Boolean);
  return first && CODES.has(first) ? rest.join("/") : "";
}

/**
 * Where a region lives, keeping the reader in the section they are in:
 * `/my`, or `/my/food` when they came from another country's dish table.
 *
 * The pan-Asian default is always `/`. There is no country-less dish table for
 * it to land on, and inventing one would mean a sixteenth page saying what the
 * fifteen already say.
 */
export function regionPath(slug: RegionSlug, suffix = ""): string {
  const country = countryBySlug(slug);
  if (!country) return "/";

  const base = `/${countryCode(country)}`;
  return suffix ? `${base}/${suffix}` : base;
}

/**
 * Every option the footer picker offers, the default first.
 *
 * A country with no dish set of its own drops out rather than offering a
 * choice that would change nothing, so adding a market to `COUNTRIES` and
 * adding one here stay independent.
 */
export const REGION_OPTIONS: Array<{ label: string; slug: RegionSlug }> = [
  { label: "All of Asia", slug: DEFAULT_REGION },
  ...COUNTRIES.flatMap((country) =>
    isRegion(country.slug) ? [{ label: label(country), slug: country.slug }] : [],
  ),
];
