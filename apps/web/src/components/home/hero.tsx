import { FoodSearch } from "@/components/home/food-search";
import { StoreButtons } from "@/components/store-buttons";
import type { Country } from "@/lib/countries";

/**
 * The top of the home page, generic or localised.
 *
 * With a `country` this is `/my` rather than `/`, and the headline, paragraph
 * and chips come from that country's own editorial in `lib/countries.ts` — the
 * same words its food page is written from.
 *
 * {@link FoodSearch} holds the right half. A picture of the app would only
 * claim what the paragraph beside it already claims; the search lets a reader
 * check it in one keystroke.
 */
export function Hero({ country }: { country?: Country }) {
  /*
   * The search column is a fixed 440px and the copy takes what is left: a
   * result row has a natural width — icon, two lines of text, a calorie figure
   * — and past about 460px it reads as a gap with words at each end.
   *
   * Three cells rather than two, for the phone. Stacked, a two-cell hero puts
   * the whole left column above the search and buries it past the fold.
   * Splitting the copy from the store buttons lets the panel sit between them
   * when the columns collapse, and the row placement puts it back beside both
   * on a wide screen.
   */
  return (
    <section className="mx-auto grid max-w-[1200px] gap-x-14 gap-y-7 px-5 pt-4 pb-10 sm:px-8 sm:pt-6 lg:grid-cols-[1fr_440px] lg:items-center lg:gap-y-8 lg:pt-[116px]">
      <div className="rise min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
        {/* The headline opens the page. The count it used to sit under is in
            the stats band and in the search label, said twice already. */}
        <h1 className="text-[34px] leading-[1.05] tracking-[-0.9px] sm:text-[52px] lg:text-[60px]">
          {country ? country.title : "Calorie counter for Asian food"}
        </h1>

        <p className="mt-4 max-w-[520px] text-[16.5px] leading-[1.6] text-body sm:mt-5 sm:text-[19px] sm:leading-[1.65]">
          {country
            ? country.intro
            : "Phở, ramen, nasi lemak, bibimbap, biryani. Counted the way they are served."}
        </p>

        {/* The local-language name for the category — the one thing the page
            cannot say anywhere else. Only the markets with a term to show get
            this line; see `native` in `lib/countries.ts`.

            `country.name` rather than `label`, because the article is part of
            the phrase: "for the Philippines", not "for Philippines". */}
        {country?.native ? (
          <p className="mt-4 font-sans text-[15px] font-bold text-muted">
            Calorie tracker for {country.name} ·{" "}
            <span lang={country.native.lang}>{country.native.term}</span>
          </p>
        ) : null}

        {country ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {country.contexts.map((context) => (
              <span
                key={context}
                className="chip px-4 py-2 font-sans text-[14px] font-extrabold text-ink"
              >
                {context}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Row 2 on a phone, so it lands under the headline rather than under the
          whole pitch. Spanning both rows on a wide screen, so it sits beside
          them instead. */}
      <div className="rise min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 [animation-delay:0.15s]">
        <FoodSearch />
      </div>

      {/* `self-end` above and `self-start` here, so the copy and the buttons
          meet in the middle of the left column rather than each centring in a
          row of its own — the rows are as tall as the search panel spanning
          both, which otherwise leaves a hole between them. */}
      <div className="rise min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start [animation-delay:0.3s]">
        <StoreButtons placement="hero" />
      </div>
    </section>
  );
}
