import Link from "next/link";

import { COUNTRIES, countryCode, label } from "@/lib/countries";

/**
 * The internal links into the fifteen markets. Without them those pages are
 * orphans: a sitemap gets them crawled, but nothing tells Google they matter
 * or passes the home page's authority to them.
 *
 * Two links per card, because there are two pages per market: the heading goes
 * to `/{code}` and the link under it to `/{code}/food`. Nothing else a crawler
 * follows reaches the localised home pages — the footer picker is a `<select>`
 * and hreflang is a hint rather than a link.
 *
 * The anchor text is the query, "Malaysia calorie tracker" rather than
 * "Malaysia", since a link's own words are most of what they say about the
 * page on the other end.
 *
 * The whole card is still one click: `after:absolute after:inset-0` stretches
 * the title's hit area over the card without stretching its anchor text, and
 * `relative` lifts the second link above that overlay.
 */
export function Countries() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-20 sm:px-8">
      <h2 className="text-[28px] sm:text-[36px]">Counted across Asia</h2>
      <p className="mt-3 max-w-[640px] text-[17px] leading-[1.6] text-body">
        Strongest where a meal comes by the plate, the bowl or the stick. Pick a
        country to see what it already knows.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COUNTRIES.map((country) => (
          <div
            key={country.slug}
            className="card card-sm relative flex flex-col justify-between gap-3 p-5 transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="min-w-0">
              <Link
                href={`/${countryCode(country)}`}
                className="block font-display text-[19px] font-extrabold text-heading transition-colors after:absolute after:inset-0 hover:text-pandan-deep"
              >
                {label(country)} calorie tracker
              </Link>
              <span className="mt-0.5 block truncate font-sans text-[14px] text-muted">
                {country.contexts.slice(0, 3).join(" · ")}
              </span>
            </div>

            <Link
              href={`/${countryCode(country)}/food`}
              className="relative inline-flex w-fit items-center gap-1.5 font-sans text-[14px] font-extrabold text-muted transition-colors hover:text-pandan-deep"
            >
              {country.adjective} food calories
              <span aria-hidden className="font-display text-[16px]">
                ›
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
