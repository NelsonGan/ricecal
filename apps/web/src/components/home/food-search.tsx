"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { FoodIcon, foodMeta } from "@/components/food-icon";
import { EVENTS, track } from "@/lib/analytics";
import { type CatalogueFood, REGION_DISHES } from "@/lib/catalogue";
import { regionLabel } from "@/lib/regions";
import { useRegion } from "@/lib/use-region";

/**
 * The catalogue, on the first screen, before anybody has installed anything.
 *
 * The rest of the page claims RiceCal already knows this food; this is the one
 * place a reader can check that claim rather than take it, which is why it
 * holds the whole right half of the hero.
 *
 * Drawn as the app's own search screen draws it — one card per result, the
 * dish's picture in a tile, place and portion on the second line, the calorie
 * figure at the end — so somebody who installs recognises where they land.
 *
 * The rows already on screen are baked, from `REGION_DISHES`, so landing here
 * fires no request. D1 bills rows read and one search reads about 1,500 of
 * them, so querying on mount would charge us for every visitor who scrolled
 * past. The network is touched only once somebody types.
 */

const ENDPOINT = "https://catalogue.ricecal.app/public/search";

/** The catalogue Worker owns both the searches and their one-row counter. */
const COUNT_ENDPOINT = "https://catalogue.ricecal.app/public/search-count";

/** Close enough to feel live without reading D1 while a tab sits in the back. */
const COUNT_POLL_MS = 5_000;

/**
 * How long the box waits for the typing to stop before it searches.
 *
 * 140ms, which this used to be, is shorter than the gap an ordinary typist
 * leaves between two letters, so "nasi lemak" billed D1 for most of its ten
 * characters on the way to the one query the reader meant. A search is worth
 * making once somebody has finished a word, not while they are still on it.
 */
const DEBOUNCE_MS = 320;

/** A chip is a finished query in one press, so there is nothing to wait out. */
const CHIP_DEBOUNCE_MS = 0;

/**
 * How many answers a session keeps. Small: the value is in the query somebody
 * just backspaced out of, not in one from ten searches ago.
 */
const CACHE_LIMIT = 32;

/** Two, because one character is the start of a search rather than a search. */
const MIN_QUERY = 2;

/**
 * One number for the seeded rows, the skeleton and the search limit, so the
 * panel does not collapse and grow on every search. The only movement left is
 * a query with genuinely fewer answers.
 */
const ROWS = 5;

/**
 * How much of a query is sent to PostHog. No dish name comes near this long,
 * and the cap is what stops a paste into a public text box becoming an event
 * property.
 */
const QUERY_LIMIT = 80;

const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

function isSearchCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Oldest query out first, so a long session cannot grow the cache forever. */
function remember(
  cache: Map<string, CatalogueFood[]>,
  query: string,
  foods: CatalogueFood[],
) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(query, foods);
}

/** The last search that finished, and which query it was an answer to. */
type Answer = { failed: boolean; foods: CatalogueFood[]; query: string };

/**
 * A row that is not there yet, at exactly the height of one that is. The icon
 * tile governs a row's height, so the 52px block and the padding are what have
 * to match; the bars inside are decoration at arbitrary widths.
 */
function ResultSkeleton() {
  return (
    <li aria-hidden>
      <div className="card card-sm flex animate-pulse items-center gap-3 p-3 sm:gap-3.5 sm:p-3.5">
        <span className="h-[52px] w-[52px] shrink-0 rounded-[18px] bg-surface-sunk sm:h-14 sm:w-14" />
        <span className="min-w-0 flex-1">
          <span className="block h-[15px] w-[62%] rounded-pill bg-surface-sunk" />
          <span className="mt-2 block h-[11px] w-[38%] rounded-pill bg-surface-sunk" />
        </span>
        <span className="h-[18px] w-[46px] shrink-0 rounded-pill bg-surface-sunk" />
      </div>
    </li>
  );
}

function Result({
  food,
  onSelect,
}: {
  food: CatalogueFood;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={`/food/${food.slug}`}
        onClick={onSelect}
        className="card card-sm group flex items-center gap-3 p-3 transition-transform hover:-translate-y-0.5 sm:gap-3.5 sm:p-3.5"
      >
        <FoodIcon food={food} className="h-[52px] w-[52px] sm:h-14 sm:w-14" />

        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[15px] font-extrabold text-ink transition-colors group-hover:text-pandan-deep">
            {food.name}
          </span>
          <span className="mt-0.5 block truncate font-sans text-[12px] font-bold text-muted">
            {foodMeta(food)}
          </span>
        </span>

        <span className="shrink-0 whitespace-nowrap font-display text-[18px] font-extrabold text-ink">
          {food.kcal}
          <span className="ml-1 font-sans text-[11px] font-extrabold text-muted">
            kcal
          </span>
        </span>
      </Link>
    </li>
  );
}

export function FoodSearch({ className = "" }: { className?: string }) {
  const { region } = useRegion();
  const inputId = useId();

  const dishes = REGION_DISHES[region] ?? REGION_DISHES.asia;
  const seed = dishes.slice(0, ROWS);

  /*
   * The chips are this market's own dishes, taken from the rows below rather
   * than written again — something to press for a reader who cannot think of a
   * dish to type.
   */
  const suggestions = dishes.slice(ROWS, ROWS + 4).map((food) => food.name);

  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [searchCount, setSearchCount] = useState<number | null>(null);

  /*
   * Other visitors' searches arrive on a short poll. A recursive timeout
   * cannot overlap itself, and a hidden tab stops reading D1 until it becomes
   * visible again. The count still updates immediately for this visitor from
   * the search response below.
   */
  useEffect(() => {
    let active = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, COUNT_POLL_MS);
    };

    const refresh = async () => {
      if (refreshing) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }

      refreshing = true;

      try {
        const response = await fetch(COUNT_ENDPOINT, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));

        const body = (await response.json()) as { search_count?: number };
        if (active && isSearchCount(body.search_count)) {
          setSearchCount(body.search_count);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          // The search itself should stay useful when its social proof cannot
          // be refreshed. The next poll quietly tries again.
        }
      } finally {
        refreshing = false;
        schedule();
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void refresh();
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    void refresh();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  /*
   * Whether the query was typed or came from a chip — which is how we find out
   * if the chips earn the row they occupy. A ref rather than state, because
   * nothing renders differently for it.
   */
  const origin = useRef<"chip" | "typed">("typed");

  /*
   * Every answer this session has already paid D1 for, keyed by the exact
   * query that was sent. A ref rather than state: a hit is read inside the
   * effect below and never renders on its own.
   */
  const cache = useRef(new Map<string, CatalogueFood[]>());

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY;

  /*
   * Nothing is set synchronously here, which keeps "not searching" derived
   * rather than stored. One controller per run, aborted by the run's own
   * cleanup: typing "nasi" starts four effects and cancels three of them.
   *
   * The wait is what decides how many of those four ever reach the network.
   * Only the query still in the box when the typing settles is sent, so a word
   * typed at speed is one search rather than one per letter.
   */
  useEffect(() => {
    if (trimmed.length < MIN_QUERY) return;

    /*
     * A query we have answered already costs nothing to answer again — no
     * request, no wait, and no row read. Backspacing a letter and typing it
     * back, correcting a typo into a word already tried, or pressing the same
     * chip twice all land here, and all of them used to be a fresh search.
     *
     * No event either: `foodSearched` counts what the catalogue was asked, and
     * this was asked once already.
     */
    const remembered = cache.current.get(trimmed);
    if (remembered) {
      setAnswer({ failed: false, foods: remembered, query: trimmed });
      return;
    }

    const controller = new AbortController();

    /*
     * One event per answer, not one per keystroke: sent beside the `setAnswer`
     * calls, which is exactly where a request finished, so aborted runs never
     * reach it.
     *
     * `results: 0` is the row worth reading — a person naming a dish they
     * expected us to know is the catalogue's gaps saying so out loud.
     */
    const report = (results: number, failed: boolean) =>
      track(EVENTS.foodSearched, {
        failed,
        query: trimmed.slice(0, QUERY_LIMIT).toLowerCase(),
        results,
        source: origin.current,
      });

    // Typing is what the wait exists for. A chip is a whole query arriving in
    // one press, and making somebody watch a skeleton after it would be the
    // debounce charging for something it did not save.
    const wait = origin.current === "chip" ? CHIP_DEBOUNCE_MS : DEBOUNCE_MS;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${ENDPOINT}?q=${encodeURIComponent(trimmed)}&limit=${ROWS}`,
          { signal: controller.signal },
        );
        // 429 included: the honest answer to "you are going too fast" is to say
        // so, not to leave the last query's results sitting there looking live.
        if (!response.ok) throw new Error(String(response.status));

        const body = (await response.json()) as {
          foods?: CatalogueFood[];
          search_count?: number;
        };
        const foods = body.foods ?? [];

        remember(cache.current, trimmed, foods);

        setAnswer({ failed: false, foods, query: trimmed });
        if (isSearchCount(body.search_count)) {
          setSearchCount(body.search_count);
        }
        report(foods.length, false);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        // Deliberately not remembered: a failure is the network's answer, not
        // the catalogue's, and the next attempt at this query should be real.
        setAnswer({ failed: true, foods: [], query: trimmed });
        report(0, true);
      }
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // An answer counts only for the query it was asked about; while it is behind
  // the box, the panel says it is still working rather than showing the last
  // word somebody typed.
  const current = answer?.query === trimmed ? answer : null;

  // Searching with no answer back yet is the skeleton's whole reason to exist.
  // Before, this fell through to an empty array and the panel folded up.
  const pending = searching && !current;
  const showing = searching ? (current?.foods ?? []) : seed;

  const caption = !searching
    ? region === "asia"
      ? "Popular across Asia"
      : `Popular in ${regionLabel(region)}`
    : current
      ? current.failed
        ? "Search"
        : "From the catalogue"
      : "Searching";

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="flex min-h-5 items-center gap-2 font-sans text-[13px] font-extrabold tracking-[0.04em] text-muted"
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pandan opacity-55" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-pandan" />
        </span>
        <span aria-live="polite" aria-atomic="true">
          {searchCount === null ? (
            <span className="text-faint">&hellip; searches and counting</span>
          ) : (
            <span
              className="search-count-pop inline-block tabular-nums"
              key={searchCount}
            >
              {COUNT_FORMATTER.format(searchCount)}{" "}
              {searchCount === 1 ? "search" : "searches"} and counting
            </span>
          )}
        </span>
      </label>

      {/* 3px border and a soft ring on focus, as the app draws its search bar. */}
      <div className="relative mt-2.5">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted"
          fill="none"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.6" />
          <path
            d="m20 20-3.6-3.6"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          id={inputId}
          type="search"
          aria-label="Search Asian dishes"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            origin.current = "typed";
            setQuery(event.target.value);
          }}
          placeholder="nasi lemak, pho, ramen"
          className="min-h-[54px] w-full rounded-[20px] border-[3px] border-line bg-surface pl-11 pr-4 font-sans text-[16px] font-extrabold text-ink transition-colors placeholder:font-bold placeholder:text-faint focus:border-pandan focus:outline-none focus:ring-[5px] focus:ring-pandan/20"
        />
      </div>

      {/* Scrolls sideways rather than wrapping, so the panel keeps its height
          on a phone whatever the dish names are. The negative margin lets the
          end chips sit flush while the scroll runs edge to edge. */}
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              // No event of its own: a chip is a search somebody did not have
              // to think of, so it is the same search with a different origin.
              origin.current = "chip";
              setQuery(name);
            }}
            className="shrink-0 whitespace-nowrap rounded-pill border-2 border-line bg-surface px-3.5 py-2 font-sans text-[13px] font-extrabold text-muted transition-colors hover:border-pandan hover:text-pandan-deep"
          >
            {name}
          </button>
        ))}
      </div>

      <p className="mt-4 font-sans text-[11.5px] font-extrabold uppercase tracking-[0.09em] text-faint">
        {caption}
      </p>

      {/* Polite, and on the wrapper rather than each row: a screen reader
          should hear the result once it settles, not every keystroke. */}
      <div aria-live="polite" className="mt-2.5">
        {current?.failed ? (
          <p className="card card-sm px-4 py-5 font-sans text-[14px] text-muted">
            Search is having a moment. Try again shortly.
          </p>
        ) : current && !current.foods.length ? (
          <p className="card card-sm px-4 py-5 font-sans text-[14px] text-muted">
            No dish by that name. In the app you can photograph the plate
            instead.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {pending
              ? Array.from({ length: ROWS }, (_, row) => (
                  <ResultSkeleton key={row} />
                ))
              : showing.map((food, rank) => (
                  <Result
                    food={food}
                    key={food.slug}
                    /*
                     * The rank is the point: a page view says a dish was read,
                     * this says the search put it in front of somebody and
                     * where — the only way to tell a search that works from
                     * one that is merely used. `seeded` separates the baked
                     * rows, which are browsing rather than searching.
                     *
                     * Plain `track`: this is a `Link` to our own page, so the
                     * reader stays in this JS context and the batch carries it.
                     */
                    onSelect={() =>
                      track(EVENTS.searchResultClicked, {
                        query: searching
                          ? trimmed.slice(0, QUERY_LIMIT).toLowerCase()
                          : "",
                        rank: rank + 1,
                        results: showing.length,
                        seeded: !searching,
                        slug: food.slug,
                        source: searching ? origin.current : "seeded",
                      })
                    }
                  />
                ))}
          </ul>
        )}
      </div>
    </div>
  );
}
