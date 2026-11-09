"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Each figure is written as the number it counts to plus the bits around it, so
 * the counter never has to parse its own label back apart. `suffix` is what
 * follows the digits — "4 sec" is a number and a unit, not a string that
 * happens to end in letters.
 */
const STATS = [
  { label: "Packaged foods", suffix: "", value: 3_228_419 },
  { label: "Searchable foods", suffix: "", value: 48_000 },
  { label: "Ways to log", suffix: "", value: 5 },
  { label: "To log a meal", suffix: " sec", value: 4 },
];

/** As long as the count runs. Long enough to read as counting, short enough
 *  that nobody waits for it. */
const RUN_MS = 1400;

/*
 * Ease-out, so the number sprints and then settles.
 *
 * A linear count reads like a progress bar; this reads like a tally landing.
 * The flash below is timed to the moment it stops, which is the only moment
 * the reader is looking at a number that will not change again.
 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function useCountUp(target: number, start: boolean) {
  /*
   * Starts at the answer. These are the only figures on the page that say how
   * big the catalogue is, so initialising to zero would ship `0` to every
   * crawler and to anybody whose JavaScript never arrives. The effect below
   * zeroes it on the client instead, well before the band is scrolled to.
   */
  const [value, setValue] = useState(target);
  const [landed, setLanded] = useState(false);

  /*
   * The motion preference is read inside the effects, never during render:
   * the server has no `window`, so rendering with it would hydrate a reader
   * who asked for less motion into different markup than they were sent.
   *
   * They keep the number they were served and never see it move — the figure
   * is the content and the counting is decoration.
   */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Zeroed in a frame rather than straight from the effect body: the band is
    // far below the fold, so this lands long before anybody can see it, and
    // setting state synchronously here is the thing the lint rule is about.
    const frame = requestAnimationFrame(() => setValue(0));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let began: number | undefined;

    const step = (now: number) => {
      began ??= now;
      const progress = Math.min((now - began) / RUN_MS, 1);
      setValue(Math.round(target * easeOut(progress)));
      if (progress < 1) frame = requestAnimationFrame(step);
      else setLanded(true);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [start, target]);

  return { landed, value };
}

function Stat({
  label,
  start,
  suffix,
  value,
}: {
  label: string;
  start: boolean;
  suffix: string;
  value: number;
}) {
  const counted = useCountUp(value, start);

  return (
    <>
      {/*
        `tabular-nums` so the digits keep one width while they run. Without it
        every frame re-measures and the whole card twitches for a second and a
        half, which is the difference between a counter and a glitch.
      */}
      <div
        className={`font-display text-[32px] font-extrabold leading-none tabular-nums transition-colors duration-500 sm:text-[38px] ${
          start && !counted.landed ? "text-pandan" : "text-pandan-deep"
        } ${counted.landed ? "flash" : ""}`}
      >
        {counted.value.toLocaleString("en-US")}
        {suffix}
      </div>
      <div className="mt-2 font-sans text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
    </>
  );
}

export function Stats() {
  const card = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

  /*
   * The count starts when the card is on screen rather than on load: this band
   * sits below the fold, so a counter tied to load would be over before
   * anybody scrolled to it. Once, on purpose — a fact landing, not a loop.
   */
  useEffect(() => {
    const node = card.current;

    // No observer, no node: count immediately rather than leave four zeroes on
    // screen. The whole point of the reset above is that it is reversible.
    if (!node || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setStarted(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-13 sm:px-8">
      <div
        ref={card}
        className="card grid grid-cols-2 gap-y-6 px-8 py-8 sm:px-[38px] lg:grid-cols-4"
      >
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={
              index === 0
                ? ""
                : "lg:border-l lg:border-line lg:pl-[26px] " +
                  (index % 2 === 1 ? "border-l border-line pl-6 lg:pl-[26px]" : "")
            }
          >
            <Stat
              label={stat.label}
              start={started}
              suffix={stat.suffix}
              value={stat.value}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
