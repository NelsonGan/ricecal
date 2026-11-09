import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DishList } from "@/components/dish-list";
import { FoodIcon } from "@/components/food-icon";
import { Footer, Header } from "@/components/site-chrome";
import { StoreButtons } from "@/components/store-buttons";
import { COUNTRIES, countryCode, label } from "@/lib/countries";
import { bakedFoods, foodBySlug, relatedFoods } from "@/lib/food";
import { jsonLd, pageMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * One dish, and what it costs you. The long tail of the site: somebody who
 * types "char kuey teow" into Google is asking a question with a number for an
 * answer, and there are 52,000 of these pages to answer it.
 *
 * The first 3,000 are built with the site and the rest render per request
 * on this same route, which is what `dynamicParams` allows. See `lib/food.ts`.
 */

export const dynamicParams = true;

/*
 * Baked dishes cannot change until the next deploy, because their data is in
 * the Worker bundle, so their prerendered page is served as-is until then.
 * Unbaked slugs render per request; foodBySlug caches only their catalogue
 * response, for one day, and the rendered page is never stored.
 */
export const revalidate = false;

export function generateStaticParams() {
  return bakedFoods().map((food) => ({ slug: food.slug }));
}

/**
 * What to call the dishes next door. `relatedFoods` keeps to one `place`, so
 * the heading can name it rather than say "you may also like". A `place` the
 * catalogue grows later falls back to {@link RELATED_FALLBACK}.
 */
const RELATED_HEADING: Record<string, string> = {
  hawker: "More hawker dishes",
  home: "More home-cooked dishes",
  kopitiam: "More kopitiam orders",
  mamak: "More mamak plates",
  packaged: "More packaged foods",
};

const RELATED_FALLBACK = "More from the catalogue";

/** Carbs kaya, protein hibiscus, fat teh — the app's colours and its order. */
const MACROS = [
  { energy: 4, fill: "bg-kaya", key: "carbs_g", label: "Carbs" },
  { energy: 4, fill: "bg-hibiscus", key: "protein_g", label: "Protein" },
  { energy: 9, fill: "bg-teh", key: "fat_g", label: "Fat" },
] as const;

/**
 * "1 plate · 450 g" out of a label and a weight that may each be missing.
 *
 * The weight is appended only when the label has not already given one, in any
 * unit. Plenty of labels carry their own — "1 serving (22.5 g)" — and pasting
 * the column onto that reads as two different portions; the drinks measured in
 * millilitres would have got "· 500 g" after "(500 ml)".
 */
function portion(food: { serving_g: number | null; serving_label: string | null }) {
  const base = food.serving_label ?? "1 serving";
  if (!food.serving_g || /\d\s*(g|kg|ml|l)\b/i.test(base)) return base;
  return `${base} · ${Math.round(food.serving_g)} g`;
}

export async function generateMetadata({
  params,
}: PageProps<"/food/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const food = await foodBySlug(slug);
  if (!food) return {};

  /*
   * The title is the search somebody typed, not a headline: "Nasi Lemak
   * calories" is the query, while "Nasi Lemak" alone competes with every
   * recipe page for the dish.
   *
   * No hreflang `cluster`: a dish has no per-country variant to be an
   * alternate of.
   */
  return pageMetadata({
    description:
      `${food.name} has ${food.kcal} calories per ${portion(food)}, with ` +
      `${Math.round(food.carbs_g)} g carbs, ${Math.round(food.protein_g)} g protein ` +
      `and ${Math.round(food.fat_g)} g fat. From the RiceCal catalogue of 48,000 Asian dishes.`,
    /*
     * Not for the index. A dish page is a name, a portion and four numbers in
     * one template, 52,000 times over; Google left 2,988 of the 3,096 in the
     * sitemap as "discovered, not indexed", and in the September 2026 spam
     * update the whole site, brand name included, stopped appearing in results
     * while staying indexed. That is how a site is scored for scaled content,
     * and it is the dish pages that make it one. They stay for readers who
     * search the catalogue or come in from a country's dish table.
     */
    indexable: false,
    keywords: [
      `${food.name} calories`,
      `${food.name} nutrition`,
      `calories in ${food.name}`,
      `${food.name} macros`,
    ],
    path: `/food/${food.slug}`,
    /*
     * "calories", not "calories and macros". Nobody types the longer phrase,
     * and its eleven characters are not a rounding error in a sixty-character
     * result: dish names carry local aliases and country tags — "Beef, brain,
     * raw Baka utak(PH)" — so the longer suffix had Google truncating 159 of
     * the 3,096 built titles mid-name, against 12 with this one.
     *
     * Trimming the name to fit instead would be worse: everything past the
     * comma is the local term somebody actually searches for.
     */
    title: `${food.name} calories`,
  });
}

export default async function FoodPage({ params }: PageProps<"/food/[slug]">) {
  const { slug } = await params;
  const food = await foodBySlug(slug);
  if (!food) notFound();

  const url = `${SITE_URL}/food/${food.slug}`;
  const related = relatedFoods(food);

  const energies = MACROS.map((macro) => food[macro.key] * macro.energy);
  const total = energies.reduce((sum, energy) => sum + energy, 0);
  const macros = MACROS.map((macro, index) => ({
    ...macro,
    grams: Math.round(food[macro.key]),
    share: total > 0 ? energies[index] / total : 0,
  }));

  /* Only the ones the catalogue carries — a dash is not a fact. */
  const extras = [
    { label: "Fibre", value: food.fibre_g == null ? null : `${food.fibre_g} g` },
    { label: "Sugar", value: food.sugar_g == null ? null : `${food.sugar_g} g` },
    { label: "Sodium", value: food.sodium_mg == null ? null : `${food.sodium_mg} mg` },
  ].filter((row) => row.value !== null);

  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "MenuItem",
      name: food.name,
      nutrition: {
        "@type": "NutritionInformation",
        calories: `${food.kcal} calories`,
        carbohydrateContent: `${food.carbs_g} g`,
        fatContent: `${food.fat_g} g`,
        proteinContent: `${food.protein_g} g`,
        ...(food.fibre_g == null ? {} : { fiberContent: `${food.fibre_g} g` }),
        ...(food.sodium_mg == null ? {} : { sodiumContent: `${food.sodium_mg} mg` }),
        ...(food.sugar_g == null ? {} : { sugarContent: `${food.sugar_g} g` }),
        servingSize: portion(food),
      },
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", item: SITE_URL, name: SITE_NAME, position: 1 },
        { "@type": "ListItem", item: url, name: food.name, position: 2 },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-5 pt-28 pb-12 sm:px-8 lg:pt-[116px]">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 font-sans text-[14px] font-bold text-muted">
              <li>
                <Link href="/" className="transition-colors hover:text-pandan-deep">
                  {SITE_NAME}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="truncate text-ink">{food.name}</li>
            </ol>
          </nav>

          <div className="flex items-start gap-4 sm:gap-5">
            <FoodIcon food={food} className="mt-1 h-16 w-16 sm:mt-1.5 sm:h-20 sm:w-20" />
            <div className="min-w-0">
              <h1 className="text-[34px] leading-[1.06] tracking-[-0.9px] sm:text-[44px]">
                {food.name}
              </h1>
              <p className="mt-3 font-sans text-[16px] font-bold text-muted">
                {portion(food)}
                {food.brand ? ` · ${food.brand}` : ""}
                {food.verified ? " · Verified" : ""}
              </p>
            </div>
          </div>

          {/* Main and a 360px aside, the same shape `/{code}/food` uses. At
              the site's full 1200px the page needs the aside to fill it. */}
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
            <div className="min-w-0">
              <div className="card p-7 sm:p-9">
                <div className="flex items-end gap-3">
                  <span className="font-display text-[52px] font-extrabold leading-none text-heading sm:text-[64px]">
                    {food.kcal}
                  </span>
                  <span className="pb-1.5 font-sans text-[15px] font-extrabold uppercase tracking-[0.1em] text-faint">
                    kcal
                  </span>
                </div>

                <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
                  {macros.map((macro) => (
                    <div key={macro.key}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-sans text-[14px] font-extrabold text-ink">
                          {macro.label}
                        </span>
                        <span className="font-sans text-[14px] font-extrabold text-muted">
                          {macro.grams} g
                        </span>
                      </div>
                      <div
                        aria-hidden
                        className="mt-2 h-2.5 overflow-hidden rounded-pill bg-surface-sunk"
                      >
                        <div
                          className={`h-full rounded-pill ${macro.fill}`}
                          style={{ width: `${Math.round(macro.share * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 font-sans text-[12.5px] text-faint">
                        {Math.round(macro.share * 100)}% of calories
                      </p>
                    </div>
                  ))}
                </div>

                {extras.length ? (
                  <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-t border-line pt-6">
                    {extras.map((row) => (
                      <div key={row.label}>
                        <dt className="font-sans text-[12px] font-extrabold uppercase tracking-[0.08em] text-faint">
                          {row.label}
                        </dt>
                        <dd className="mt-0.5 font-sans text-[16px] font-extrabold text-ink">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>

              {/* Required, not decoration: a quarter of the catalogue comes
                  from Open Food Facts, whose licence makes the credit travel
                  with the numbers. So this prints whatever the row carries. */}
              <p className="mt-4 font-sans text-[13px] leading-[1.6] text-faint">
                {food.source_attribution
                  ? food.source_attribution
                  : food.source_name
                    ? `Source: ${food.source_name}.`
                    : null}{" "}
                Figures are estimates for a typical portion, for general wellness
                rather than medical advice.
              </p>
            </div>

            <aside className="h-fit rounded-[20px] bg-pandan-soft p-7 lg:sticky lg:top-24">
              <h2 className="text-[22px] sm:text-[24px]">
                Log {food.name} in two taps
              </h2>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-body">
                This figure is the one RiceCal gives you. Snap the plate,
                describe it in your own words, scan a barcode or search 48,000
                dishes by their local names.
              </p>
              <StoreButtons className="mt-6" placement="dish" />
            </aside>
          </div>
        </section>

        {related.length ? (
          <section className="mx-auto max-w-[1200px] px-5 pb-14 sm:px-8">
            <h2 className="text-[24px] sm:text-[30px]">
              {RELATED_HEADING[food.place] ?? RELATED_FALLBACK}
            </h2>
            <p className="mt-2 text-[16px] text-body">
              Counted the same way, in the portion each one is served in.
            </p>
            <DishList className="mt-6" dishes={related} />
          </section>
        ) : null}

        <section className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
          <h2 className="text-[22px] sm:text-[26px]">Dishes by country</h2>
          <p className="mt-2 text-[16px] text-body">
            The catalogue, market by market, with the figures for each.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {COUNTRIES.map((country) => (
              <Link
                key={country.slug}
                href={`/${countryCode(country)}/food`}
                className="chip px-4 py-2 font-sans text-[14px] font-extrabold text-ink transition hover:text-pandan-deep"
              >
                {label(country)}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
