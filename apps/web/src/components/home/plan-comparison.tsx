import Image from "next/image";

import { Eyebrow } from "@/components/section";

/**
 * How many plates a free account may photograph in a day.
 *
 * A copy: the original is `FREE_DAILY_SCANS` in the app's `@ricecal/shared`
 * and Postgres' `free_daily_scans()` enforces it. This site cannot import
 * either, so the three have to be changed together — a page promising three a
 * day while the database allows five is a support thread.
 */
const FREE_DAILY_SCANS = 3;

/**
 * The same again: `FREE_RECIPES`, enforced by `free_recipe_limit()`. The app
 * calls one a "food" on screen and a recipe everywhere in its code, which is
 * why this constant and that column disagree.
 */
const FREE_RECIPES = 3;

type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; text: string };

const YES = { kind: "yes" } as const;
const NO = { kind: "no" } as const;
const text = (value: string): Cell => ({ kind: "text", text: value });

/**
 * What each tier gets, row by row — `PLAN_FEATURES` from the app's
 * `paywall/PlanTable.tsx`, in the same order and the same words, so the two
 * have to be changed together.
 *
 * Most of the free column is a tick, and that is the argument: the table says
 * "you already have a working diary, here is what it does not do yet".
 *
 * Ordered by use rather than by what is gated — the ways a meal gets in, then
 * what the app does with it, then what it does over time. Sorting the dashes
 * to the top would read as a list of complaints.
 */
const ROWS: { free: Cell; label: string; pro: Cell }[] = [
  // Text on both sides: three a day against unlimited is the whole offer, and a
  // tick in both columns would hide it.
  {
    free: text(`${FREE_DAILY_SCANS}/day`),
    label: "Snap a plate",
    pro: text("Unlimited"),
  },
  { free: NO, label: "Say what you ate, in words", pro: YES },
  { free: YES, label: "Scan a packet", pro: YES },
  { free: YES, label: "Search the food database", pro: YES },
  { free: NO, label: "Fix a meal by describing it", pro: YES },
  {
    free: text(`${FREE_RECIPES} foods`),
    label: "Save what you cook",
    pro: text("Unlimited"),
  },
  { free: NO, label: "Fill a food in from a photo", pro: YES },
  { free: YES, label: "A calorie budget that fits you", pro: YES },
  { free: YES, label: "Apple Health and Health Connect", pro: YES },
  { free: YES, label: "Meal reminders", pro: YES },
  { free: text("7 days"), label: "Trends", pro: text("Up to a year") },
  {
    free: text("Latest week"),
    label: "Weekly and monthly reviews",
    pro: text("Unlimited"),
  },
  { free: text("30 days"), label: "Your meal photos", pro: text("Unlimited") },
];

/** How wide each value column is. Enough for "Unlimited" on one line. */
const COLUMN = "w-[74px] shrink-0 text-center sm:w-[92px]";

/**
 * Free against Pro, in a section of its own rather than as a ticked list
 * inside each plan card. A card's job is to say what a plan costs, and only a
 * two-column table can say "you already have this" about a row.
 */
export function PlanComparison() {
  return (
    <section
      id="free-vs-pro"
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-20 sm:px-8 sm:pt-24"
    >
      {/* The eyebrow alone. The table below is the whole argument, and a
          sentence above it would restate in prose what the ticks show. */}
      <div className="text-center">
        <Eyebrow>Free vs Pro</Eyebrow>
      </div>

      <div className="card mx-auto mt-7 max-w-[680px] rounded-[30px] p-[22px] sm:p-[30px]">
        <div className="flex items-end gap-2 pb-2.5">
          <div className="flex-1" />
          <Heading className={COLUMN}>Free</Heading>
          {/* The one coloured thing in the table, because it is the column
              being sold. A right-hand side tinted throughout would read as a
              highlight rather than as a comparison. */}
          <Heading className={`${COLUMN} text-pandan-deep`}>Pro</Heading>
        </div>

        {ROWS.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-center gap-2 py-3 ${
              index === 0 ? "border-t border-[var(--line)]" : ""
            } border-b border-[var(--line)] last:border-b-0`}
          >
            <span className="flex-1 font-sans text-[14px] font-bold leading-[1.4] text-ink sm:text-[15px]">
              {row.label}
            </span>
            <Value cell={row.free} className={COLUMN} muted />
            <Value cell={row.pro} className={COLUMN} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Heading({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`font-sans text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * One value: a tick, a dash, or a few words.
 *
 * A dash rather than a cross for "not included" — a cross is a mark against
 * the thing beside it, and the free column is what somebody already has, not a
 * list of failings. For the same reason the free tick is `muted` rather than
 * the lightest grey, which reads as disabled.
 */
function Value({
  cell,
  className,
  muted,
}: {
  cell: Cell;
  className: string;
  muted?: boolean;
}) {
  if (cell.kind === "yes") {
    return (
      <span className={`${className} flex justify-center`}>
        <Image
          src="/icons/ui/check.png"
          alt="Included"
          width={192}
          height={192}
          className={`h-[18px] w-[18px] ${muted ? "opacity-45" : ""}`}
        />
      </span>
    );
  }

  if (cell.kind === "no") {
    return (
      <span className={`${className} font-sans text-[15px] font-bold text-faint`}>
        {/* An en dash, not an em: the mark for an empty cell, not a pause. */}
        <span aria-hidden>–</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  }

  return (
    <span
      className={`${className} font-sans text-[13px] font-bold leading-[1.3] text-ink`}
    >
      {cell.text}
    </span>
  );
}
