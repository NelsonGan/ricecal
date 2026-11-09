/**
 * The catalogue, copied out of D1 and into the site.
 *
 *     node scripts/catalogue.mjs
 *
 * Run it when the catalogue changes; nothing here runs at request time.
 *
 * The site could ask `catalogue.ricecal.app` for these rows on demand, and the
 * search box does. But three things are on the page before anybody types — the
 * dish table at `/{code}/food`, the rows already in the search panel, and the
 * dish pages — so a query for those is fired by arriving rather than by
 * searching. D1 bills rows read and one search reads about 1,500 of them, so
 * that would charge us for every visitor who never used the feature.
 *
 * The dishes are named here and the numbers are not. `food` has no country
 * column — `place` tells a hawker stall from a kopitiam, not Malaysia from
 * Vietnam — so which dishes belong on which page is editorial and lives in
 * `TERMS` below. Every figure comes out of the database, so a name that stops
 * resolving fails loudly at build time rather than becoming a wrong calorie
 * count on a public page.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const DATABASE = "ricecal-d1-food-catalogue";
const SEARCH_URL = "https://catalogue.ricecal.app/public/search";

/** How many dish pages are prerendered. The rest render on demand. */
const STATIC_LIMIT = 3000;

/**
 * Which dishes each market's pages are about. Editorial, and deliberately so —
 * see the header. Spelt as the catalogue spells them, so a name that drifts is
 * caught by the resolver below rather than by a reader.
 */
const TERMS = {
  malaysia: [
    "Nasi Lemak Ayam Goreng",
    "Penang Char Kuey Teow",
    "Roti Canai Banjir",
    "Nasi Kandar Ikan",
    "Teh Tarik Ais",
    "Curry Mee Penang",
    "Satay Kajang Ayam",
    "Nasi Lemak Rendang Daging",
    "Cendol Durian",
    "Mee Goreng Ayam",
    "Penang Hokkien Mee",
  ],
  singapore: [
    "Hainanese Chicken Rice, Steamed (SG)",
    "Katong Laksa",
    "Teochew Bak Kut Teh",
    "Char Kway Teow Singapore Style",
    "Chilli Crab",
    "Roti Prata Kosong",
    "Kaya Toast Set with Eggs and Kopi",
    "Nasi Lemak Singapore, Chicken Wing",
    "Fried Carrot Cake, Black (Chai Tow Kway)",
    "Satay Bee Hoon",
    "Nasi Padang Singapore, Three Dishes",
    "Indian Mee Goreng Singapore",
  ],
  indonesia: [
    "Nasi Goreng Jawa",
    "Rendang Padang",
    "Sate Ayam Ponorogo",
    "Gado-Gado",
    "Soto Ayam Lamongan",
    "Bakso Malang",
    "Gudeg Komplit",
    "Ayam Penyet",
    "Pecel Madiun",
    "Ketoprak Jakarta",
    "Sate Lilit Bali",
    "Opor Ayam",
  ],
  thailand: [
    "Pad Thai Moo",
    "Tom Yum Goong Nam Khon",
    "Som Tam Pu",
    "Gaeng Keow Wan Moo",
    "Khao Man Gai",
    "Khao Niao Mamuang",
    "Pad Krapao Moo Sap",
    "Gaeng Massaman Neua",
    "Khao Pad Poo",
    "Moo Satay Thai",
    "Gaeng Kari Gai",
    "Pad See Ew Moo",
  ],
  philippines: [
    "Adobong Manok",
    "Sinigang na Baboy",
    "Lechon Kawali",
    "Pancit Canton",
    "Sisig na Baboy",
    "Halo-Halo",
    "Kare-Kare",
    "Lumpiang Shanghai",
    "Tapsilog",
    "Chicken Inasal",
    "Bicol Express",
    "Pandesal",
  ],
  vietnam: [
    "Phở Bò Tái",
    "Bánh Mì Thịt Nguội",
    "Bún Chả Cá Quy Nhơn",
    "Cơm Tấm Sườn Bì Chả",
    "Gỏi Cuốn Chay",
    "Bún Bò Huế Giò Heo",
    "Phúc Long Cà Phê Sữa Đá",
    "Bánh Xèo Miền Trung",
    "Chả Giò",
    "Mì Quảng",
    "Hủ Tiếu Nam Vang",
  ],
  japan: [
    "Hakata Tonkotsu Ramen",
    "Pork Katsu Curry Rice",
    "Yoshinoya Gyudon",
    "Okonomiyaki Osaka",
    "Bukkake Udon",
    "Onigiri Umeboshi",
    "Tempura Soba",
    "Katsuya Katsudon",
    "Sushiro Salmon Nigiri",
    "Yakitori Momo",
    "Shio Ramen",
    "Hiyashi Chuka",
  ],
  "south-korea": [
    // Not the plain "Bibimbap, Korean", which the catalogue prices per CUP at
    // 123 kcal. A country page wants the bowl somebody orders.
    "Bibimbap (chicken)",
    "Chamchi Kimchi Jjigae",
    "Baekjeong Samgyeopsal Set",
    "Tteokbokki",
    "Japchae Bap",
    "Bulgogi Deopbap",
    "BBQ Chicken Yangnyeom",
    "Mul Naengmyeon",
    "Chamchi Gimbap",
    "Doenjang Jjigae",
    "Jeyuk Deopbap",
    "Patbingsu",
  ],
  china: [
    "Dan Dan Mian",
    "Ma Po Tofu",
    "Kung Po Chicken",
    "Xie Fen Xiaolongbao",
    "Beijing Zhajiang Mian",
    "Yuxiang Rousi",
    "Char Siew",
    "Roast Duck",
    "Huiguorou",
    "Laziji",
    "Chongqing Xiaomian",
    "Shanghai Hongshao Tipang",
  ],
  "hong-kong": [
    "Hong Kong Roast Goose",
    "Roast Goose Rice",
    "Hong Kong Milk Tea",
    "Pineapple Bun",
    "Hong Kong Street Siu Mai",
    "Beef Cheung Fun",
    "Hong Kong Claypot Rice with Lap Cheong",
    // Was "Taiwanese Egg Tart", on the Hong Kong page, which was simply wrong.
    "Egg Tart",
    "Hong Kong Curry Beef Brisket Rice",
    "Hong Kong French Toast",
    "Portuguese Chicken Rice",
  ],
  taiwan: [
    "Taiwanese Beef Noodle Soup",
    "Lu Rou Fan",
    "Chun Shui Tang Pearl Milk Tea",
    "Gua Bao",
    "Taiwanese Salt and Pepper Chicken",
    "O A Jian, Taiwanese Oyster Omelette",
    "Taiwanese Scallion Pancake",
    "Danzai Noodles",
    "Taiwanese Fried Chicken Cutlet",
    "Braised Stinky Tofu",
    "Pineapple Cake",
    "Taiwanese Sweet Soy Milk",
  ],
  india: [
    "Butter Chicken",
    "Lucknowi Chicken Biryani",
    "Mysore Masala Dosa",
    "Chole Bhature",
    "Paneer Butter Masala",
    "Samosa Chaat",
    "Idli Podi",
    "Rajma Chawal",
    "Pav Bhaji",
    "Dal Makhani",
    "Roghni Naan",
    "Masala Chai",
  ],
  myanmar: [
    "Mohinga",
    "Shan Khao Swè",
    "Nan Gyi Thoke",
    "Ohn No Khao Swè",
    "Htamin Jaw",
    "Samusa Thoke",
    "Kyay Oh",
    "Shan Khao Swè Thoke",
  ],
  "sri-lanka": [
    "Chicken Kottu Roti",
    "Sri Lankan Dhal Curry",
    "Egg Hopper",
    "Plain Hopper",
    "Rice and Curry Plate",
    "String Hopper Pilaf",
    "Pol Sambol",
    "Ambul Thiyal",
  ],
  pakistan: [
    "Nihari",
    "Chicken Karahi",
    "Haleem",
    "Chapli Kebab",
    "Hyderabadi Chicken Dum Biryani",
    "Seekh Kebab",
    "Paya",
    "Halwa Puri",
  ],
};

/**
 * The pan-Asian set, for `/` and for anybody we have no country for. Drawn
 * from the lists above rather than written again, so a dish that stops
 * resolving fails in one place. One per market, weighted towards the dishes
 * somebody outside Asia would recognise.
 */
const ASIA = [
  "Phở Bò Tái",
  "Hakata Tonkotsu Ramen",
  "Pad Thai Moo",
  "Nasi Lemak Ayam Goreng",
  "Katong Laksa",
  "Tteokbokki",
  "Dan Dan Mian",
  "Butter Chicken",
  "Nasi Goreng Jawa",
  "Adobong Manok",
  "Lu Rou Fan",
  "Mohinga",
];

/** The echo of `normalize` in the Worker's `text.ts`. Both ends must agree. */
function normalize(text) {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** `wrangler d1 execute`, with the JSON banner trimmed off the front. */
async function query(sql) {
  const { stdout } = await run(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", sql],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("[")))[0].results;
}

/**
 * The columns a public page may show — the same set the Worker's `publicShape`
 * returns, so a baked dish and a searched one are the same object. Anything
 * absent from both is absent on purpose; see that function.
 */
const COLUMNS = `
  f.slug, f.name, f.brand, f.place, f.kcal, f.carbs_g, f.protein_g, f.fat_g,
  f.fibre_g, f.sugar_g, f.sodium_mg, f.verified, f.icon_set, f.icon_name,
  f.source_name, f.source_attribution,
  (select s.label from food_serving s where s.food_id = f.id
    order by s.is_default desc, s.position limit 1) as serving_label,
  (select s.grams from food_serving s where s.food_id = f.id
    order by s.is_default desc, s.position limit 1) as serving_g`;

function shape(row) {
  return {
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? null,
    place: row.place,
    kcal: row.kcal,
    carbs_g: row.carbs_g,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    fibre_g: row.fibre_g ?? null,
    sugar_g: row.sugar_g ?? null,
    sodium_mg: row.sodium_mg ?? null,
    verified: row.verified === 1 || row.verified === true,
    icon_set: row.icon_set ?? null,
    icon_name: row.icon_name ?? null,
    serving_label: row.serving_label ?? null,
    serving_g: row.serving_g ?? null,
    source_name: row.source_name ?? null,
    source_attribution: row.source_attribution ?? null,
  };
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * Every named dish, in one round trip.
 *
 * A name can hit more than one row — the catalogue carries a Milo six times —
 * so the window function picks the same one every run: verified first, then
 * the source the search prefers, then popularity, then the shortest name,
 * which breaks ties towards the plain dish rather than a variant.
 */
async function resolveExact(terms) {
  const values = terms.map((term) => `(${quote(term)}, ${quote(normalize(term))})`).join(",");
  const rows = await query(`
    with want(term, n) as (values ${values}),
    ranked as (
      select w.term as term, ${COLUMNS},
        row_number() over (
          partition by w.term
          order by f.verified desc, f.source_priority desc, f.popularity desc, length(f.name)
        ) as rn
      from want w join food f on f.name_norm = w.n
    )
    select * from ranked where rn = 1`);

  return new Map(rows.map((row) => [row.term, shape(row)]));
}

/**
 * What the catalogue might have meant, for a name that resolves to nothing.
 *
 * A suggestion and nothing more. Accepting the top hit automatically put a jar
 * of "Hainanese Chicken Rice Mix" on Singapore's page and priced Korea's
 * bibimbap by the cup: a ranking built to answer "what is this person typing"
 * is not one built to answer "which row represents this cuisine".
 *
 * So a miss stops the build and prints these, and a person puts the right name
 * in `TERMS`. The happy path never touches the network.
 */
async function suggest(term) {
  const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(term)}&limit=5`, {
    headers: { origin: "https://www.ricecal.app" },
  });
  if (!response.ok) return [];
  const { foods } = await response.json();
  // Packaged goods filtered out: a country page wants a plate, never a packet.
  return (foods ?? []).filter((food) => food.place !== "packaged");
}

async function resolve(terms) {
  const exact = await resolveExact(terms);
  const found = new Map();
  const missing = [];

  for (const term of terms) {
    const hit = exact.get(term);
    if (hit) found.set(term, hit);
    else missing.push(term);
  }

  return { found, missing };
}

const everyTerm = [...new Set([...Object.values(TERMS).flat(), ...ASIA])];
console.log(`Resolving ${everyTerm.length} dish names against D1…`);

const { found, missing } = await resolve(everyTerm);

/*
 * A name nobody can resolve stops the build. Writing the file anyway, with a
 * guess in place of a dish, is exactly the silent disagreement these figures
 * moved into the database to avoid.
 */
if (missing.length) {
  console.error(`\n${missing.length} dish names resolve to nothing:\n`);
  for (const term of missing) {
    console.error(`  ${term}`);
    const candidates = await suggest(term);
    if (!candidates.length) console.error("      (no unpackaged dish comes close)");
    for (const food of candidates) {
      const portion = food.serving_label ? ` per ${food.serving_label}` : "";
      console.error(`      ${food.name}  —  ${food.kcal} kcal${portion}`);
    }
  }
  console.error("\nPut the right name in TERMS. Check the portion, not just the name.");
  process.exit(1);
}

const regions = Object.fromEntries([
  ["asia", ASIA.map((term) => found.get(term))],
  ...Object.entries(TERMS).map(([slug, terms]) => [slug, terms.map((term) => found.get(term))]),
]);

/*
 * Every icon the catalogue names, not every icon this file bakes. The search
 * box asks the live Worker and the long tail of `/food/{slug}` renders on
 * demand, so the site draws rows this file has never seen — checking only the
 * baked ones shipped 93 missing pictures.
 *
 * Checked rather than copied: the site serves its own copy from `public/icons`,
 * so a new icon is a change somebody reviews rather than something a build
 * pulls in. A miss is loud here, where it can be fixed.
 */
console.log("\nChecking every icon the catalogue names…");
const icons = await query(`
  select icon_set, icon_name, count(*) as n from food
  where icon_set is not null and icon_name is not null
  group by icon_set, icon_name`);

const absent = icons.filter((icon) => !existsSync(`public/icons/${icon.icon_set}/${icon.icon_name}.png`));

if (absent.length) {
  const rows = absent.reduce((sum, icon) => sum + icon.n, 0);
  console.error(`\n${absent.length} icons are missing from public/icons, on ${rows} foods:\n`);
  for (const icon of absent.sort((a, b) => b.n - a.n).slice(0, 20)) {
    console.error(`  ${icon.icon_set}/${icon.icon_name}.png  (${icon.n} foods)`);
  }
  if (absent.length > 20) console.error(`  … and ${absent.length - 20} more`);
  console.error(
    "\nCopy them from the app's icons, from apps/web:" +
      "\n  cp ../mobile/assets/icons/{dishes,food}/*.png …",
  );
  process.exit(1);
}
console.log(`  ${icons.length} icons, all present.`);

/**
 * Which dish pages are built ahead of time.
 *
 * Packaged goods are excluded: three million barcoded packets would swamp the
 * build, and "Milo, 400 g tin" is not a page anybody searches
 * for. The rest are ordered with our own researched rows first, then whatever
 * the app's users reach for most.
 *
 * Everything else still has a page, rendered per request with a cached
 * catalogue response. This is only about which are ready before anybody asks.
 */
console.log(`\nCollecting the ${STATIC_LIMIT} dish pages to prerender…`);
const popular = await query(`
  select ${COLUMNS} from food f
  where f.place != 'packaged'
  order by (f.source_name like 'RiceCal%') desc, f.popularity desc, f.verified desc, f.name
  limit ${STATIC_LIMIT}`);

/*
 * Every dish named on a country page is prerendered too, however unpopular.
 * Those are the ones the site itself links to, and a link from a built page to
 * an unbuilt one is the slowest page on the site by construction.
 */
const statics = new Map(popular.map((row) => [row.slug, shape(row)]));
for (const dish of Object.values(regions).flat()) statics.set(dish.slug, dish);

const header = `/**
 * GENERATED by \`scripts/catalogue.mjs\` — do not edit.
 *
 * Every figure here is the catalogue's own, read out of D1 at build time. Which
 * dishes appear is editorial and lives in that script; what they weigh is not.
 * Regenerate rather than hand-edit, or the site and the app start disagreeing.
 */`;

const file = `${header}

/** The shape the Worker's \`publicShape\` returns, so live and baked rows match. */
export type CatalogueFood = {
  brand: string | null;
  carbs_g: number;
  fat_g: number;
  fibre_g: number | null;
  icon_name: string | null;
  icon_set: string | null;
  kcal: number;
  name: string;
  place: string;
  protein_g: number;
  serving_g: number | null;
  serving_label: string | null;
  slug: string;
  sodium_mg: number | null;
  source_attribution: string | null;
  source_name: string | null;
  sugar_g: number | null;
  verified: boolean;
};

/**
 * What each market's pages show before anybody types.
 *
 * Both the dish table at \`/{code}/food\` and the results already sitting in the
 * search panel come from here, which is why landing on a page costs no query.
 */
export const REGION_DISHES: Record<string, CatalogueFood[]> = ${JSON.stringify(regions, null, 2)};
`;

/*
 * The prerender list lives in its own module, and is parsed rather than
 * written out as object literals.
 *
 * Separate, because `catalogue.ts` is reached from `countries.ts`, which
 * nearly every page imports — three thousand dishes in there is three thousand
 * dishes in the bundle of a page that wanted a country's name.
 *
 * Parsed, because `tsc` gives up on an array literal this size ("union type
 * that is too complex to represent") rather than infer three thousand object
 * types to check against an annotation they all carry. `JSON.parse` returns
 * `any`, so the annotation is believed, and it is faster to read at startup.
 */
const payload = JSON.stringify([...statics.values()])
  // `String.raw` cannot escape these, so they are escaped INTO the JSON, where
  // `JSON.parse` turns them back. Both only ever occur inside strings.
  .replace(/`/g, "\\u0060")
  .replace(/\$/g, "\\u0024");

const staticFile = `${header}

import type { CatalogueFood } from "@/lib/catalogue";

/**
 * The dish pages built ahead of time. Everything else in the catalogue still
 * has a page — it renders per request with a cached catalogue response. This
 * is only the list that is ready before anybody asks.
 */
export const STATIC_FOODS: CatalogueFood[] = JSON.parse(String.raw\`${payload}\`);
`;

await writeFile("src/lib/catalogue.ts", file);
await writeFile("src/lib/catalogue-static.ts", staticFile);

console.log(
  `\nWrote src/lib/catalogue.ts` +
    `\n  ${Object.keys(regions).length} regions, ${Object.values(regions).flat().length} named dishes` +
    `\n  ${(file.length / 1024).toFixed(0)} KB` +
    `\nWrote src/lib/catalogue-static.ts` +
    `\n  ${statics.size} dish pages prerendered` +
    `\n  ${(staticFile.length / 1024 / 1024).toFixed(2)} MB`,
);
