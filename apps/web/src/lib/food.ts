import type { CatalogueFood } from "@/lib/catalogue";
import { STATIC_FOODS } from "@/lib/catalogue-static";

/**
 * One dish, however we can get it.
 *
 * Every one of the 52,000 dishes has a page; about 3,100 of them are built
 * ahead of time (`STATIC_LIMIT` in `scripts/catalogue.mjs`, plus every dish a
 * country table shows). The rest render per request on the same route, with their
 * catalogue response cached for a day.
 *
 * The build is not what stops us building all 52,000: 3,000 pages prerender in
 * seconds. The deploy is. Every prerendered page ships as two Static Assets
 * files (its HTML and its RSC payload), uploaded afresh on every deploy;
 * 3,000 dishes is already ~600 MB, and a Worker version holds at most 100,000
 * asset files on Workers Paid. See
 * `vite.config.ts` for where those pages land.
 */

const BAKED = new Map(STATIC_FOODS.map((food) => [food.slug, food]));

const ENDPOINT = "https://catalogue.ricecal.app/public/food";

/** A day. The catalogue moves when an import runs, which is far rarer. */
export const FOOD_REVALIDATE = 86_400;

export function bakedFoods(): CatalogueFood[] {
  return STATIC_FOODS;
}

/**
 * How many dishes a dish page points at. Long enough to be a way out of a dead
 * end, short enough that the page is not giving all its authority away.
 */
const RELATED_COUNT = 8;

/** The baked catalogue split by where the dish is eaten, in catalogue order. */
const BY_PLACE = STATIC_FOODS.reduce<Map<string, CatalogueFood[]>>(
  (buckets, food) => {
    const bucket = buckets.get(food.place);
    if (bucket) bucket.push(food);
    else buckets.set(food.place, [food]);
    return buckets;
  },
  new Map(),
);

/** Where in its own bucket each baked dish sits, so a lookup is not a scan. */
const PLACE_INDEX = new Map(
  [...BY_PLACE.values()].flatMap((bucket) =>
    bucket.map((food, index) => [food.slug, index] as const),
  ),
);

/** A slug to a number, so an unbaked dish still gets the same neighbours twice. */
function hash(slug: string): number {
  let value = 0;
  for (let i = 0; i < slug.length; i += 1) {
    value = (value * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return value;
}

/**
 * The dishes a dish page links on to, so no dish page is a dead end.
 *
 * The next few dishes in the bucket, not the most popular ones: successors
 * make each bucket a ring, so every dish is linked to and a crawler starting
 * anywhere reaches all of them. Picking the best N instead would leave the
 * other three thousand as orphaned as before.
 *
 * The ring stays within one `place`, so it also reads sensibly — a hawker dish
 * leads to hawker dishes — and every bucket holds at least one dish a country
 * page already links, which is the way in. A dish rendered on demand is not in
 * the ring, so it enters its bucket at a fixed offset from its own slug.
 */
export function relatedFoods(food: CatalogueFood): CatalogueFood[] {
  const bucket = BY_PLACE.get(food.place) ?? STATIC_FOODS;
  if (bucket.length < 2) return [];

  const at = PLACE_INDEX.get(food.slug) ?? hash(food.slug) % bucket.length;

  // `- 1` so a small bucket does not wrap all the way round to this dish again.
  const take = Math.min(RELATED_COUNT, bucket.length - 1);

  return Array.from(
    { length: take },
    (_, step) => bucket[(at + step + 1) % bucket.length],
  );
}

/**
 * A missing dish and an unreachable catalogue are not the same answer.
 *
 * `null` becomes a 404, which tells Google to drop the page. The catalogue
 * response is cached for a day, so a brief outage must not appear as missing
 * food.
 * So only the catalogue's own "no such row" (a 200 carrying `food: null`)
 * returns `null`. A 5xx, a timeout or a refused connection throws, giving a
 * 500 that Google comes back for.
 */
export async function foodBySlug(slug: string): Promise<CatalogueFood | null> {
  const baked = BAKED.get(slug);
  if (baked) return baked;

  /*
   * `WEB_CATALOGUE_TOKEN` is why this fetch must stay server-side: it exempts
   * us from the catalogue Worker's per-IP cap. On-demand renders all leave
   * from Cloudflare's network rather than from the reader, so without it a
   * crawler walking the catalogue would rate-limit itself.
   *
   * Both ends are Workers on one account, so a service binding is the better
   * long-term answer. It is not a drop-in: a binding call is not a
   * Next-instrumented `fetch`, so the caching below would have to move to
   * `"use cache"`.
   */
  const token = process.env.WEB_CATALOGUE_TOKEN;

  const response = await fetch(`${ENDPOINT}?slug=${encodeURIComponent(slug)}`, {
    headers: token ? { "x-ricecal-web": token } : {},
    next: { revalidate: FOOD_REVALIDATE },
  });

  if (!response.ok) {
    throw new Error(`Catalogue answered ${response.status} for "${slug}"`);
  }

  const body = (await response.json()) as { food?: CatalogueFood | null };
  return body.food ?? null;
}
