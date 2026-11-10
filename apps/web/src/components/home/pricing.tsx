"use client";

import { useState } from "react";

import { DownloadLink } from "@/components/download-link";
import { SectionIntro } from "@/components/section";
import {
  formatMoney,
  type MarketPricing,
  perMonth,
  pricingFor,
  yearlySaving,
} from "@/lib/pricing";
import { useRegion } from "@/lib/use-region";

/**
 * How many plates a free account may photograph in a day. A copy of the app's
 * `FREE_DAILY_SCANS`, which Postgres enforces; `PlanComparison` holds the
 * other copy on this site and all three have to move together.
 */
const FREE_DAILY_SCANS = 3;

/**
 * The three ways to buy Pro. One is shown at a time, behind a picker: they are
 * one product at three billing periods, and a reader deciding whether to pay
 * at all needs one paid number to hold against the free column rather than
 * three to rank first.
 */
type PlanName = "Lifetime" | "Monthly" | "Yearly";

/**
 * What the card opens on. Named rather than taken as the first entry below, so
 * the picker's order and the recommended period can change apart.
 */
const DEFAULT_PLAN: PlanName = "Yearly";

type ProPlan = {
  badge?: string;
  name: PlanName;
  period: string;
  price: string;
  sub: string;
};

/**
 * The billing periods, priced in the reader's own currency from
 * `lib/pricing.ts`. Which market that is follows the same rule as the rest of
 * the page: the URL on `/jp`, the reader's own choice on `/`.
 */
function proPlansFor(pricing: MarketPricing): ProPlan[] {
  const plans: ProPlan[] = [
    {
      badge: `Save ${yearlySaving(pricing)}%`,
      name: "Yearly",
      period: "a month",
      price: formatMoney(perMonth(pricing.yearly)),
      sub: `${formatMoney(pricing.yearly)} a year`,
    },
    {
      name: "Monthly",
      period: "a month",
      price: formatMoney(pricing.monthly),
      sub: "Billed monthly",
    },
  ];

  /*
   * Every market has a lifetime price today, so this branch always runs. It
   * stays a branch so a market added before its price is set gets no lifetime
   * option rather than a figure no store will honour.
   */
  if (pricing.lifetime) {
    plans.push({
      badge: "Pay once",
      name: "Lifetime",
      period: "once",
      price: formatMoney(pricing.lifetime),
      sub: "One payment, no renewals",
    });
  }

  return plans;
}

/** The shell both cards share, so the paid one differs only where it means to. */
const CARD = "flex flex-col rounded-[30px]";

/**
 * The name line at the top of each card. A fixed minimum height because only
 * the paid card carries a control, and otherwise the two headline prices under
 * them would start at different heights.
 */
const CARD_HEAD = "flex min-h-[38px] items-center justify-between gap-3";

/** The slab button both cards share. Only the fill and the shadow differ. */
const CTA =
  "mt-6 flex h-[52px] items-center justify-center rounded-[18px] font-display text-[17px] font-extrabold transition active:translate-y-[5px] active:shadow-none";

const BADGE =
  "rounded-pill bg-pandan-soft px-2.5 py-1 font-sans text-[11px] font-extrabold uppercase tracking-[0.08em] text-pandan-deep";

/**
 * The sentence that levels the two cards. `flex-1` on the paragraph rather
 * than a height on the card, so whichever card has less to say takes the slack
 * and both buttons sit on the same line.
 */
const BLURB = "mt-4 flex-1 font-sans text-[15px] font-bold leading-[1.6] text-body";

/** The small-caps line under a headline price. */
const SUB =
  "font-sans text-[12px] font-extrabold uppercase tracking-[0.04em] text-faint";

/**
 * The same line under the paid card's price, not uppercased: it carries a
 * currency symbol, and `Rp499,000` would render as `RP499,000`. Indonesia is
 * the only one of the fifteen markets whose symbol has a lowercase letter, so
 * the fault is invisible from everywhere else.
 */
const PRICE_SUB = "font-sans text-[12px] font-extrabold text-faint";

export function Pricing() {
  const { region } = useRegion();
  const [plan, setPlan] = useState<PlanName>(DEFAULT_PLAN);

  const proPlans = proPlansFor(pricingFor(region));

  /*
   * The fallback covers a market with no lifetime price. The option cannot be
   * chosen there, but it can be chosen elsewhere and still be selected when
   * the reader changes country in the footer.
   */
  const selected = proPlans.find((one) => one.name === plan) ?? proPlans[0];

  /** Narrowed against the rendered options rather than cast, as `isRegion` is. */
  function handleChange(next: string) {
    const match = proPlans.find((one) => one.name === next);
    if (match) setPlan(match.name);
  }

  return (
    <section
      id="pricing"
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-20 sm:px-8 sm:pt-24"
    >
      <SectionIntro
        center
        eyebrow="Pricing"
        title="Free to start, yours to keep"
      />

      {/* Two cards, breaking to one column at `lg` rather than `sm`. The
          headline price is the widest thing here — `₫2,499,000` beside
          `once` runs past 260px at this display size — and two columns at
          `sm` leave only about 230px, which the short-price markets would
          never show.

          No `items-start`: the cards stretch to each other and `BLURB` takes
          up the slack, so the stretch shows as two aligned buttons. */}
      <div className="mt-9 grid gap-5 lg:grid-cols-2">
        <article className={`card ${CARD} p-[30px]`}>
          <div className={CARD_HEAD}>
            <h3 className="text-[22px]">Free</h3>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[36px] font-extrabold leading-none text-ink sm:text-[40px]">
              Free
            </span>
            <span className="font-sans text-[14px] font-extrabold text-muted">
              forever
            </span>
          </div>
          <div className={`mt-2 ${SUB}`}>No card needed</div>

          {/* One sentence rather than a ticked list, since the comparison it
              was half of is `PlanComparison` below. It names the daily figure,
              because "log your meals" reads as no limit at all. */}
          <p className={BLURB}>
            {FREE_DAILY_SCANS} photo meals a day, the barcode scanner and the
            whole catalogue.
          </p>

          <DownloadLink
            className={`${CTA} bg-canvas text-ink shadow-[0_5px_0_var(--line)]`}
            placement="pricing"
            plan="free"
          >
            Download free
          </DownloadLink>
        </article>

        {/* 3px of border short of the free card's padding, so the two sit at
            the same width. */}
        <article
          className={`${CARD} border-[3px] border-pandan bg-surface p-[27px] shadow-[0_5px_0_var(--color-pandan-soft-line)]`}
        >
          <div className={CARD_HEAD}>
            <div className="flex items-center gap-2">
              <h3 className="text-[22px]">Pro</h3>
              {/* The badge belongs to the selected period, not to the card. */}
              {selected.badge ? (
                <span className={BADGE}>{selected.badge}</span>
              ) : null}
            </div>

            <div className="relative">
              {/*
                A native select, as the footer's `RegionPicker` is. It gets the
                platform's own dropdown on a phone, which is the one control a
                reader on a phone already knows how to use, and it costs no
                popover, no outside-click handler and no focus trap to keep
                right.

                Bordered rather than the `chip` the region picker wears: this
                card is `bg-surface` and so is a chip, so a chip here would be
                an invisible control on the only card that has one.
              */}
              <select
                aria-label="Billing period"
                value={plan}
                onChange={(event) => handleChange(event.target.value)}
                className="h-[38px] cursor-pointer appearance-none rounded-pill border-2 border-[var(--line)] bg-canvas pl-4 pr-9 font-sans text-[14px] font-extrabold text-ink transition-colors hover:text-pandan-deep"
              >
                {proPlans.map((one) => (
                  <option key={one.name} value={one.name}>
                    {one.name}
                  </option>
                ))}
              </select>

              {/* The native arrow is dropped above so it can sit inside the pill. */}
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                fill="none"
                aria-hidden
              >
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* `flex-wrap` so a long price drops clear of the period beside it
              rather than being squeezed or truncated. */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[36px] font-extrabold leading-none text-ink sm:text-[40px]">
              {selected.price}
            </span>
            <span className="font-sans text-[14px] font-extrabold text-muted">
              {selected.period}
            </span>
          </div>
          <div className={`mt-2 ${PRICE_SUB}`}>{selected.sub}</div>

          {/* The free card's sentence, answered. Every claim here is a row of
              `PlanComparison` below, so the two cannot drift apart. */}
          <p className={BLURB}>
            Unlimited photo meals, meals described in words, and a year of
            trends.
          </p>

          <DownloadLink
            className={`${CTA} bg-pandan text-on-fill shadow-[0_5px_0_var(--color-pandan-deep)]`}
            placement="pricing"
            plan="pro"
          >
            Get RiceCal Pro
          </DownloadLink>
        </article>
      </div>

      <p className="mt-6 text-center font-sans text-[13px] font-bold text-muted">
        App Store prices for your country, and they may change. You will see the
        exact figure before you confirm.
      </p>
    </section>
  );
}
