import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DishList } from "@/components/dish-list";
import { FinalCta } from "@/components/home/final-cta";
import { Pricing } from "@/components/home/pricing";
import { Footer, Header } from "@/components/site-chrome";
import { StoreButtons } from "@/components/store-buttons";
import { jsonLd, marketApp, ogLocale, pageMetadata } from "@/lib/seo";
import {
  COUNTRIES,
  countryByCode,
  countryCode,
  countryKeywords,
  dishesFor,
  label,
} from "@/lib/countries";
import { isRegion } from "@/lib/regions";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { RegionLock } from "@/lib/use-region";

/**
 * The dish table: `/my/food`, `/sg/food`.
 *
 * The calorie-lookup half of a market. `/{code}` above it is the product page;
 * this one answers the question somebody typed into Google — what does this
 * dish cost me. Keeping the H1, the title and the description on that question
 * is what keeps the two pages out of each other's results.
 */
export function generateStaticParams() {
  return COUNTRIES.map((country) => ({ code: countryCode(country) }));
}

export const dynamicParams = false;

function describe(code: string) {
  const country = countryByCode(code);
  if (!country) return null;
  const dishes = dishesFor(country.slug);
  return { country, dishes };
}

/** "Malaysian dishes and their calories" — the H1. */
function heading(adjective: string): string {
  return `${adjective} dishes and their calories`;
}

/**
 * The `<title>`, which leads on the phrase somebody types rather than on the
 * sentence that reads well above a table. Same split `/{code}` makes between
 * its H1 and its `searchTitle`.
 */
function searchHeading(adjective: string): string {
  return `${adjective} food calories, dish by dish`;
}

export async function generateMetadata({
  params,
}: PageProps<"/[code]/food">): Promise<Metadata> {
  const { code } = await params;
  const found = describe(code);
  if (!found) return {};

  const { country, dishes } = found;
  // Opens on "Calories in Malaysian food", because that is the query. Opening
  // on dish names read as a list of topics rather than as an answer.
  const description = `Calories in ${country.adjective} food: ${dishes
    .slice(0, 3)
    .map((dish) => dish.name)
    .join(", ")} and 48,000 more, each counted in the portion it is served in.`;

  return pageMetadata({
    cluster: "food",
    description,
    keywords: countryKeywords(country),
    locale: ogLocale(country.hreflang),
    path: `/${countryCode(country)}/food`,
    // The root layout's template appends "· RiceCal", so this must not.
    title: searchHeading(country.adjective),
  });
}

export default async function CountryFoodPage({
  params,
}: PageProps<"/[code]/food">) {
  const { code } = await params;
  const found = describe(code);
  if (!found) notFound();

  const { country, dishes } = found;

  // Every country in COUNTRIES has a dish set, but the type cannot know that.
  if (!isRegion(country.slug)) notFound();

  const url = `${SITE_URL}/${countryCode(country)}/food`;

  const graph = [
    marketApp({
      country,
      description: country.intro,
      name: `${SITE_NAME}: ${label(country)} Calorie Tracker`,
      url,
    }),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", item: SITE_URL, name: SITE_NAME, position: 1 },
        {
          "@type": "ListItem",
          item: url,
          name: `${country.adjective} food calories`,
          position: 2,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: country.faq.map((item) => ({
        "@type": "Question",
        acceptedAnswer: { "@type": "Answer", text: item.a },
        name: item.q,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: dishes.map((dish, index) => ({
        "@type": "ListItem",
        item: {
          "@type": "MenuItem",
          name: dish.name,
          nutrition: {
            "@type": "NutritionInformation",
            calories: `${dish.kcal} calories`,
            carbohydrateContent: `${dish.carbs_g} g`,
            fatContent: `${dish.fat_g} g`,
            proteinContent: `${dish.protein_g} g`,
            servingSize: dish.serving_label ?? "1 serving",
          },
        },
        position: index + 1,
      })),
      name: `${country.adjective} food calories, by the portion`,
      numberOfItems: dishes.length,
    },
  ];

  return (
    <RegionLock region={country.slug}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-5 pt-28 pb-10 sm:px-8 lg:pt-[116px]">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 font-sans text-[14px] font-bold text-muted">
              <li>
                <Link href="/" className="transition-colors hover:text-pandan-deep">
                  {SITE_NAME}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link
                  href={`/${countryCode(country)}`}
                  className="transition-colors hover:text-pandan-deep"
                >
                  {label(country)}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-ink">Food</li>
            </ol>
          </nav>

          <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
            <div className="min-w-0">
              <h1 className="text-[34px] leading-[1.06] tracking-[-0.9px] sm:text-[48px]">
                {heading(country.adjective)}
              </h1>
              {/* Not `country.intro` — that is the pitch under the H1 on
                  `/{code}`. This page opens on the table. */}
              <p className="mt-5 max-w-[560px] text-[17px] leading-[1.65] text-body sm:text-[19px]">
                {dishes.length} dishes, in the portions they are served in.
                These are the figures RiceCal gives you {country.preposition}.
              </p>

              <StoreButtons className="mt-8" placement="country-dishes" />
            </div>

            <aside className="card h-fit p-7">
              <h2 className="text-[20px]">Four ways to log a meal {country.preposition}</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {[
                  "Snap the plate, every item named",
                  "Describe it in your own words",
                  "Scan a barcode, three million packets",
                  "Search 48,000 dishes by local name",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] text-body">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-pill bg-pandan" />
                    {item}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
          <h2 className="text-[28px] sm:text-[38px]">
            By the portion, not by the gram
          </h2>
          <p className="mt-3 max-w-[640px] text-[17px] leading-[1.6] text-body">
            A sample of the catalogue. Each one is searchable in the app under
            the name you would use for it.
          </p>

          <DishList className="mt-8" dishes={dishes} />

          <p className="mt-4 text-[15px] text-muted">
            The bars are where each dish&rsquo;s calories come from.{" "}
            {country.dishNote} Estimates for general wellness, not medical
            advice.
          </p>
        </section>

        <section className="bg-surface py-14">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <h2 className="text-[28px] sm:text-[38px]">
              Questions from {country.name}
            </h2>
            <div className="mt-8 space-y-3">
              {country.faq.map((item) => (
                <details
                  key={item.q}
                  className="card card-sm group bg-canvas p-6 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <h3 className="text-[18px] sm:text-[20px]">{item.q}</h3>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface text-ink transition-transform duration-300 group-open:rotate-45">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-[16px] leading-[1.6] text-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <Pricing />

        <section className="mx-auto max-w-[1200px] px-5 pt-16 sm:px-8">
          <h2 className="text-[24px] sm:text-[30px]">Somewhere else in Asia?</h2>
          <p className="mt-2 text-[16px] text-body">
            Same app, same catalogue, the rest of the region.
          </p>
          {/* Into the other dish tables, not the other home pages: a link
              across a cluster is worth more than one out of it. */}
          <div className="mt-6 flex flex-wrap gap-2">
            {COUNTRIES.filter((other) => other.slug !== country.slug).map(
              (other) => (
                <Link
                  key={other.slug}
                  href={`/${countryCode(other)}/food`}
                  className="chip px-4 py-2 font-sans text-[14px] font-extrabold text-ink transition hover:text-pandan-deep"
                >
                  {label(other)}
                </Link>
              ),
            )}
          </div>
        </section>

        <FinalCta />
      </main>

      <Footer />
    </RegionLock>
  );
}
