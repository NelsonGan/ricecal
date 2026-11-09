"use client";

import {
  AppCard,
  AppRow,
  Fab,
  Glyph,
  MICRO,
  NavBar,
  ScreenHead,
  SCREEN_TOP,
  Squish,
} from "@/components/home/phone";
import { perServing, previewFor } from "@/lib/region-preview";
import { useRegion } from "@/lib/use-region";

/*
 * The five screens the tour moves between, drawn as the app draws them.
 *
 * The arithmetic on screen holds: one budget is declared here, the entries are
 * the region's own dishes, and everything else — what is left, the ring's
 * sweep, the macro grams — is worked out from those two. Somebody will check.
 *
 * Every screen is one flex column the height of the display, so nothing
 * scrolls and nothing is cut off mid-row. If a screen stops fitting, something
 * on it has to go, which is the rule the app is built under too.
 */

/** The day's allowance. One number, read by all five screens. */
const BUDGET = 2100;

/** A 2,100 kcal day's macro targets, in grams. */
const TARGETS = { carbs: 236, fat: 65, protein: 116 };

const KCAL_PER_GRAM = { carbs: 4, fat: 9, protein: 4 };

/** Half the energy from carbs, a fifth from protein, the rest fat. */
const SPLIT = { carbs: 0.5, fat: 0.28, protein: 0.22 };

function day(rows: readonly { kcal: number }[]) {
  const eaten = rows.reduce((sum, row) => sum + row.kcal, 0);

  return {
    eaten,
    left: BUDGET - eaten,
    macros: {
      carbs: Math.round((eaten * SPLIT.carbs) / KCAL_PER_GRAM.carbs),
      fat: Math.round((eaten * SPLIT.fat) / KCAL_PER_GRAM.fat),
      protein: Math.round((eaten * SPLIT.protein) / KCAL_PER_GRAM.protein),
    },
  };
}

/** Points, so a delay can be written where the thing it delays is written. */
function delay(seconds: number) {
  return { animationDelay: `${seconds}s` };
}

/* ------------------------------------------------------------------ Today */

type WeekCell = {
  day: number;
  initial: string;
  mark?: "over" | "under";
  today?: boolean;
};

const WEEK: WeekCell[] = [
  { day: 4, initial: "M", mark: "under" },
  { day: 5, initial: "T", mark: "under" },
  { day: 6, initial: "W", mark: "over" },
  { day: 7, initial: "T", mark: "under" },
  { day: 8, initial: "F", mark: "under", today: true },
  { day: 9, initial: "S" },
  { day: 10, initial: "S" },
];

const MARK_TINT = { over: "bg-kaya", under: "bg-pandan" } as const;

/** The ring, drawn from empty every time the screen arrives. */
function CalorieRing({ eaten }: { eaten: number }) {
  const size = 104;
  const thickness = 13;
  const radius = (size - thickness) / 2;
  const length = 2 * Math.PI * radius;
  const swept = Math.min(1, eaten / BUDGET);

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--surface-sunk)"
          strokeWidth={thickness}
        />
        <circle
          className="tour-ring"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="var(--pandan)"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - swept)}
          strokeLinecap="round"
          strokeWidth={thickness}
          style={
            {
              "--ring-length": length,
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            } as React.CSSProperties
          }
        />
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[24px] font-extrabold leading-none text-ink">
          {(BUDGET - eaten).toLocaleString()}
        </span>
        <span className="mt-1 font-sans text-[10px] font-extrabold text-muted">
          kcal left
        </span>
      </span>
    </div>
  );
}

function MacroBar({
  grams,
  index,
  label,
  target,
  tint,
}: {
  grams: number;
  index: number;
  label: string;
  target: number;
  tint: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-[11px] font-extrabold text-body">
          {label}
        </span>
        <span className="font-sans text-[11px] font-bold text-muted">
          {grams} g
        </span>
      </div>
      <div className="mt-1 h-[6px] overflow-hidden rounded-pill bg-surface-sunk">
        <div
          className={`tour-fill h-full rounded-pill ${tint}`}
          style={{
            ...delay(0.35 + index * 0.1),
            width: `${Math.min(100, (grams / target) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

export function TodayScreen() {
  const { log } = previewFor(useRegion().region);
  const { eaten, macros } = day(log.rows);

  return (
    <div className={`flex h-full flex-col ${SCREEN_TOP}`}>
      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-1">
        <div className="tour-in">
          <ScreenHead
            leading={
              <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-surface">
                <Glyph
                  className="h-[17px] w-[17px]"
                  src="/icons/ui/calendar-view.png"
                />
              </span>
            }
            title="Friday"
            trailing={
              <span className="flex items-center gap-1 rounded-pill bg-kaya-soft px-2.5 py-1.5">
                <Glyph
                  className="h-[15px] w-[15px]"
                  src="/icons/body/flame-burn.png"
                />
                <span className="font-sans text-[11px] font-extrabold text-kaya-deep">
                  12 days
                </span>
              </span>
            }
          />
        </div>

        <div className="flex gap-1.5">
          {WEEK.map((cell, index) => {
            const on = Boolean(cell.today);
            const ahead = index > 4;

            return (
              <Squish
                key={cell.day}
                className={`tour-in flex flex-1 flex-col items-center gap-0.5 rounded-[13px] py-1.5 ${
                  on ? "bg-pandan" : "bg-surface"
                } ${ahead ? "opacity-40" : ""}`}
                depth={3}
                slab={on ? "var(--pandan-deep)" : "var(--line)"}
                style={delay(index * 0.04)}
              >
                <span
                  className={`font-sans text-[9px] font-extrabold ${
                    on ? "text-on-fill/80" : "text-faint"
                  }`}
                >
                  {cell.initial}
                </span>
                <span
                  className={`font-display text-[15px] font-extrabold leading-none ${
                    on ? "text-on-fill" : "text-ink"
                  }`}
                >
                  {cell.day}
                </span>
                <span
                  className={`h-1 w-1 rounded-full ${
                    on
                      ? "bg-on-fill"
                      : cell.mark
                        ? MARK_TINT[cell.mark]
                        : "bg-transparent"
                  }`}
                />
              </Squish>
            );
          })}
        </div>

        <div className="tour-in" style={delay(0.08)}>
          <AppCard className="flex items-center gap-3.5 p-3.5">
            <CalorieRing eaten={eaten} />
            <div className="min-w-0 flex-1">
              <MacroBar
                grams={macros.carbs}
                index={0}
                label="Carbs"
                target={TARGETS.carbs}
                tint="bg-kaya"
              />
              <div className="mt-2.5">
                <MacroBar
                  grams={macros.protein}
                  index={1}
                  label="Protein"
                  target={TARGETS.protein}
                  tint="bg-hibiscus"
                />
              </div>
              <div className="mt-2.5">
                <MacroBar
                  grams={macros.fat}
                  index={2}
                  label="Fat"
                  target={TARGETS.fat}
                  tint="bg-teh"
                />
              </div>
            </div>
          </AppCard>
        </div>

        {/* The tank IS the card: one silhouette, filling up. */}
        <div className="tour-in" style={delay(0.16)}>
          <AppCard className="relative h-[72px] overflow-hidden p-0">
            <span className="absolute inset-x-0 bottom-0 top-[42%] overflow-hidden">
              <span className="tour-rise block h-full w-full border-t-2 border-white/30 bg-water" />
            </span>

            {/* The readout sits above the water line, in ink: water is bright
                in both themes, and ink is the one colour that reads on the
                surface above it either way. */}
            <span className="absolute right-2.5 top-2 flex items-center gap-1">
              <span className="font-display text-[17px] font-extrabold leading-none text-ink">
                1.4
              </span>
              <span className="font-sans text-[11px] font-bold text-muted">
                of 2 L
              </span>
              <span className="ml-0.5 flex h-6 w-6 items-center justify-center">
                <Glyph className="h-[15px] w-[15px]" src="/icons/ui/plus.png" />
              </span>
            </span>
          </AppCard>
        </div>

        <div className="tour-in" style={delay(0.24)}>
          <AppCard className="flex flex-col gap-3.5 p-3.5">
            {log.rows.map((row, index) => (
              <AppRow
                key={row.title}
                className="tour-in"
                detail={row.detail}
                icon={row.icon}
                style={delay(0.3 + index * 0.09)}
                title={row.title}
                value={String(row.kcal)}
              />
            ))}
          </AppCard>
        </div>
      </div>

      <Fab />
      <NavBar active="Today" />
    </div>
  );
}

/* ------------------------------------------------------- The log sheet */

const TILES = [
  {
    fill: "bg-pandan-soft",
    icon: "/icons/system/camera.png",
    label: "Snap",
    slab: "var(--pandan-soft-line)",
  },
  {
    fill: "bg-kaya-soft",
    icon: "/icons/system/sparkle.png",
    label: "Describe",
    slab: "var(--kaya-soft-line)",
  },
  {
    fill: "bg-surface-sunk",
    icon: "/icons/ui/search.png",
    label: "Search",
    slab: "var(--line-strong)",
  },
];

/** The three ways in. The one whose panel is open is pressed flat. */
function QuickActions({ open }: { open: string }) {
  return (
    <div className="flex gap-2">
      {TILES.map((tile, index) => {
        const on = tile.label === open;

        return (
          <Squish
            key={tile.label}
            className={`tour-in flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[16px] py-2.5 ${
              tile.fill
            } ${on ? "border-[2.5px] border-ink" : ""}`}
            depth={on ? 0 : 4}
            slab={tile.slab}
            style={delay(index * 0.05)}
          >
            <Glyph className="h-[22px] w-[22px]" src={tile.icon} />
            <span className="font-sans text-[10px] font-extrabold text-ink">
              {tile.label}
            </span>
          </Squish>
        );
      })}
    </div>
  );
}

/**
 * The sheet, and the day it came up over.
 *
 * The day behind is the heading and nothing else — a sheet this tall covers the
 * rest of it, and drawing a screen nobody can see would be two screens to keep
 * in step for the sake of 40 pixels.
 */
function LogSheet({
  children,
  left,
}: {
  children: React.ReactNode;
  left: number;
}) {
  return (
    <div className="relative h-full">
      <div className={`px-4 pt-1 ${SCREEN_TOP}`}>
        <ScreenHead title="Friday" />
      </div>

      <span className="absolute inset-0 bg-[#0c1310]/55" />

      <div className="absolute inset-x-0 bottom-0 top-[72px] flex flex-col gap-3 rounded-t-[28px] bg-surface px-4 pb-4 pt-2.5">
        <span className="mx-auto h-1 w-9 rounded-pill bg-line-strong" />

        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[18px] font-extrabold text-heading">
            Log a meal
          </span>
          <span className="font-sans text-[12px] font-bold text-muted">
            {left.toLocaleString()} kcal left
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}

export function SnapScreen() {
  const { log, scan } = previewFor(useRegion().region);
  const { left } = day(log.rows);

  return (
    <LogSheet left={left}>
      <QuickActions open="Snap" />

      <div className="tour-in mx-auto flex gap-1 rounded-pill bg-canvas p-1" style={delay(0.1)}>
        {["Meal", "Barcode"].map((tab, index) => (
          <span
            key={tab}
            className={`rounded-pill px-4 py-1 font-sans text-[12px] font-extrabold ${
              index === 0
                ? "bg-surface text-ink shadow-[0_2px_0_var(--line)]"
                : "text-muted"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>

      {/* The viewfinder. The line is the only thing here still working. */}
      <div
        className="tour-in relative h-[208px] overflow-hidden rounded-[20px] bg-surface-sunk"
        style={delay(0.16)}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          <Glyph className="h-[100px] w-[100px]" src={scan.icon} />
        </span>

        {[
          "left-3 top-3 border-l-2 border-t-2 rounded-tl-[8px]",
          "right-3 top-3 border-r-2 border-t-2 rounded-tr-[8px]",
          "bottom-3 left-3 border-b-2 border-l-2 rounded-bl-[8px]",
          "bottom-3 right-3 border-b-2 border-r-2 rounded-br-[8px]",
        ].map((corner) => (
          <span
            key={corner}
            className={`absolute h-5 w-5 border-pandan ${corner}`}
          />
        ))}

        <span
          className="tour-sweep absolute inset-x-3 top-3 h-[2px] rounded-pill bg-pandan shadow-[0_0_12px_2px_var(--color-pandan)]"
          style={{ "--sweep-to": "182px" } as React.CSSProperties}
        />
      </div>

      <div
        className="tour-in flex items-center gap-2 rounded-[16px] bg-pandan-soft px-3 py-2.5"
        style={delay(0.55)}
      >
        <Glyph className="h-[18px] w-[18px]" src="/icons/system/sparkle.png" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[13px] font-extrabold text-ink">
            Looks like {scan.dish}
          </span>
          <span className="block truncate font-sans text-[11.5px] text-body">
            {scan.portion} · {scan.kcal} kcal
          </span>
        </span>
        <span className="shrink-0 font-sans text-[12px] font-extrabold text-pandan-deep">
          92%
        </span>
      </div>

      <div className="tour-in mt-auto flex justify-center" style={delay(0.65)}>
        <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-[3px] border-line-strong">
          <span className="h-[44px] w-[44px] rounded-full bg-pandan shadow-[0_3px_0_var(--color-pandan-deep)]" />
        </span>
      </div>
    </LogSheet>
  );
}

export function DescribeScreen() {
  const { describe, log } = previewFor(useRegion().region);
  const { left } = day(log.rows);

  const words = describe.sentence.split(" ");

  return (
    <LogSheet left={left}>
      <QuickActions open="Describe" />

      {/* Typed out a word at a time, which is what the panel watches somebody
          do. Word by word rather than letter by letter because the sentence
          wraps, and a letter-wise reveal cannot wrap without reflowing. */}
      <div
        className="tour-in rounded-[18px] bg-canvas px-3 py-2.5"
        style={delay(0.12)}
      >
        <p className="font-sans text-[13px] leading-[1.45] text-ink">
          {words.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className="tour-in inline-block"
              style={delay(0.3 + index * 0.05)}
            >
              {word}
              {index < words.length - 1 ? " " : null}
            </span>
          ))}
          <span
            className="tour-caret ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] bg-pandan align-baseline"
            style={delay(0.3 + words.length * 0.05)}
          />
        </p>
      </div>

      <div
        className="tour-in flex items-center gap-2"
        style={delay(0.4 + words.length * 0.05)}
      >
        <Glyph className="h-[17px] w-[17px]" src="/icons/system/sparkle.png" />
        <span className="font-sans text-[12px] font-extrabold text-pandan-deep">
          {describe.rows.length} ingredients, {describe.servings} servings
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {describe.rows.map((row, index) => (
          <AppRow
            key={row.title}
            className="tour-in"
            detail={row.detail}
            icon={row.icon}
            style={delay(0.55 + words.length * 0.05 + index * 0.1)}
            title={row.title}
            value={String(row.kcal)}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
        <div>
          <div className="font-display text-[22px] font-extrabold leading-none text-ink">
            {perServing(describe)}
          </div>
          <div className={`${MICRO} mt-1`}>kcal a serving</div>
        </div>
        <span className="flex h-[44px] items-center rounded-[16px] bg-pandan px-5 font-display text-[15px] font-extrabold text-on-fill shadow-[0_4px_0_var(--color-pandan-deep)]">
          Add
        </span>
      </div>
    </LogSheet>
  );
}

/* ------------------------------------------------------------- Your foods */

/**
 * "4 servings, 9 ingredients, 272 kcal each" is three facts and a 320pt row has
 * space for two. The middle one goes: how many things went in matters when you
 * are cooking it, not when you are picking it off a list.
 */
function shorten(detail: string) {
  const parts = detail.split(", ");

  return [parts[0], parts[2]].filter(Boolean).join(" · ");
}

/**
 * The food somebody wrote themselves, inside search.
 *
 * The middle of three tabs under one field, which is where the app puts it: the
 * shared database, then your own, then what you have eaten before. The plus on
 * each row is the argument for showing this one — a pot you entered once is one
 * tap from the day — and the button above it is the other half, since a food of
 * your own has to be written before it can be tapped.
 */
export function FoodScreen() {
  const { log, recipes } = previewFor(useRegion().region);
  const { left } = day(log.rows);

  return (
    <LogSheet left={left}>
      <QuickActions open="Search" />

      <div
        className="tour-in flex items-center gap-2 rounded-[16px] bg-canvas px-3 py-2.5"
        style={delay(0.1)}
      >
        <Glyph className="h-[15px] w-[15px]" src="/icons/ui/search.png" />
        <span className="font-sans text-[13px] text-faint">
          Search any dish
        </span>
      </div>

      {/* Underlined rather than a pill, because these are tabs over one field
          and not a value picked from a set. The app draws the same difference
          with the same two controls. */}
      <div
        className="tour-in flex justify-center gap-5 border-b border-line"
        style={delay(0.16)}
      >
        {["All foods", "My foods", "Past foods"].map((tab, index) => (
          <span
            key={tab}
            className={`-mb-px border-b-[2.5px] pb-2 font-sans text-[12px] font-extrabold ${
              index === 1
                ? "border-ink text-ink"
                : "border-transparent text-muted"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>

      {/* The quiet row the app uses for "one more of these", not a button:
          the foods under it are what somebody came to this tab for, and a
          slab across the width would outrank them. */}
      <div className="tour-in flex items-center gap-2.5" style={delay(0.2)}>
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[9px] bg-pandan-soft">
          <Glyph className="h-[13px] w-[13px]" src="/icons/ui/plus.png" />
        </span>
        <span className="font-sans text-[13px] font-extrabold text-pandan-deep">
          New food
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {recipes.map((recipe, index) => (
          <div
            key={recipe.title}
            className="tour-in flex items-center gap-2.5"
            style={delay(0.24 + index * 0.09)}
          >
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px] bg-surface-sunk">
              <Glyph className="h-[38px] w-[38px]" src={recipe.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[14px] font-extrabold text-ink">
                {recipe.title}
              </span>
              <span className="mt-0.5 block truncate font-sans text-[12px] text-muted">
                {shorten(recipe.detail)}
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-pandan shadow-[0_3px_0_var(--color-pandan-deep)]">
              <Glyph className="h-[15px] w-[15px]" src="/icons/ui/plus.png" />
            </span>
          </div>
        ))}
      </div>
    </LogSheet>
  );
}

/* ----------------------------------------------------------------- Trends */

/**
 * A week of days, as fractions of the tallest.
 *
 * The split is the energy split, drawn the way the app stacks it: fat on top,
 * then protein, carbs at the bottom.
 */
const BARS = [
  { height: 0.82, label: "M" },
  { height: 0.94, label: "T" },
  { height: 0.71, label: "W" },
  { height: 1, label: "T" },
  { height: 0.88, label: "F" },
  { height: 0.86, label: "S" },
  { height: 0.76, label: "S" },
];

const METRICS = [
  { icon: "/icons/body/flame-burn.png", label: "Calories", value: "1,962" },
  { icon: "/icons/body/water-drop.png", label: "Water", value: "1.8 L" },
  { icon: "/icons/body/weighing-scale.png", label: "Weight", value: "67.5" },
];

const LEGEND = [
  { label: "Carbs", tint: "bg-kaya" },
  { label: "Protein", tint: "bg-hibiscus" },
  { label: "Fat", tint: "bg-teh" },
];

export function TrendsScreen() {
  return (
    <div className={`flex h-full flex-col ${SCREEN_TOP}`}>
      <div className="flex flex-1 flex-col gap-3 px-4 pt-1">
        <div className="tour-in">
          <ScreenHead
            title="Trends"
            trailing={
              <span className="flex gap-0.5 rounded-pill bg-canvas p-1">
                {["7d", "30d", "1y"].map((range, index) => (
                  <span
                    key={range}
                    className={`rounded-pill px-2.5 py-1 font-sans text-[11px] font-extrabold ${
                      index === 0
                        ? "bg-surface text-ink shadow-[0_2px_0_var(--line)]"
                        : "text-muted"
                    }`}
                  >
                    {range}
                  </span>
                ))}
              </span>
            }
          />
        </div>

        <div className="flex gap-2">
          {METRICS.map((metric, index) => {
            const on = index === 0;

            return (
              <Squish
                key={metric.label}
                className={`tour-in flex-1 rounded-[16px] px-2.5 py-2 ${
                  on ? "bg-pandan" : "bg-surface"
                }`}
                depth={4}
                slab={on ? "var(--pandan-deep)" : "var(--line)"}
                style={delay(0.04 + index * 0.06)}
              >
                <Glyph className="h-[16px] w-[16px]" src={metric.icon} />
                <div
                  className={`mt-1 font-sans text-[9.5px] font-extrabold uppercase tracking-[0.08em] ${
                    on ? "text-on-fill/80" : "text-faint"
                  }`}
                >
                  {metric.label}
                </div>
                <div
                  className={`mt-0.5 font-display text-[15px] font-extrabold leading-none ${
                    on ? "text-on-fill" : "text-ink"
                  }`}
                >
                  {metric.value}
                </div>
              </Squish>
            );
          })}
        </div>

        <div className="tour-in" style={delay(0.12)}>
          <AppCard className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-sans text-[12px] font-extrabold text-heading">
                  Last 7 days
                </div>
                <div className="font-sans text-[11px] text-muted">
                  Goal {BUDGET.toLocaleString()} a day
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-pill bg-pandan-soft px-2 py-1">
                <Glyph
                  className="h-[13px] w-[13px]"
                  src="/icons/body/trend-down.png"
                />
                <span className="font-sans text-[11px] font-extrabold text-pandan-deep">
                  138 under
                </span>
              </span>
            </div>

            <div className="mt-3 flex h-[148px] items-end gap-1.5">
              {BARS.map((bar, index) => (
                <div
                  key={`${bar.label}-${index}`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
                >
                  <div
                    className="tour-grow flex flex-col overflow-hidden rounded-[7px]"
                    style={{
                      ...delay(0.2 + index * 0.07),
                      height: `${bar.height * 100}%`,
                    }}
                  >
                    <span className="h-[26%] bg-teh" />
                    <span className="h-[22%] bg-hibiscus" />
                    <span className="h-[52%] bg-kaya" />
                  </div>
                  <span className="text-center font-sans text-[9.5px] font-extrabold text-faint">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              {LEGEND.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-[2px] ${item.tint}`}
                  />
                  <span className="font-sans text-[10.5px] font-bold text-muted">
                    {item.label}
                  </span>
                </span>
              ))}
            </div>
          </AppCard>
        </div>

        <div className="tour-in" style={delay(0.24)}>
          <AppCard className="flex items-center gap-2.5 p-3">
            <Glyph
              className="h-[26px] w-[26px]"
              src="/icons/ui/calendar-view.png"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[13px] font-extrabold text-ink">
                Weekly reviews
              </span>
              <span className="block font-sans text-[11px] text-muted">
                Every finished week
              </span>
            </span>
            <Glyph
              className="h-[14px] w-[14px]"
              src="/icons/ui/chevron-right.png"
            />
          </AppCard>
        </div>
      </div>

      <NavBar active="Trends" />
    </div>
  );
}
