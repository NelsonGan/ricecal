"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneFrame } from "@/components/home/phone";
import {
  DescribeScreen,
  FoodScreen,
  SnapScreen,
  TodayScreen,
  TrendsScreen,
} from "@/components/home/screens";
import { SectionIntro } from "@/components/section";

/**
 * The app, on a phone, one screen at a time.
 *
 * What a reader wants before installing is to see what the thing looks like,
 * so the copy is a short heading and five one-word tabs and the screens do the
 * rest. They advance on their own, so a reader who does nothing still sees all
 * five; the moment somebody picks one the carousel stops and stays put.
 */

const TABS = [
  { icon: "/icons/ui/home.png", id: "today", label: "Today" },
  { icon: "/icons/system/camera.png", id: "snap", label: "Snap" },
  { icon: "/icons/system/sparkle.png", id: "describe", label: "Describe" },
  { icon: "/icons/food/cooking-pot.png", id: "food", label: "Food" },
  { icon: "/icons/ui/trends.png", id: "trends", label: "Trends" },
];

const SCREENS = [
  TodayScreen,
  SnapScreen,
  DescribeScreen,
  FoodScreen,
  TrendsScreen,
];

/** How long a screen holds before the next one comes up. */
const DWELL = "6.5s";

/** A swipe shorter than this is a tap that moved. */
const SWIPE_PX = 40;

export function Features() {
  /*
   * One stamp per screen, counting up; the largest is the screen on show. A
   * screen's own stamp is the key its contents mount under, so picking a
   * screen replays that screen's animations while the one sliding out keeps
   * the DOM it had. Keyed on the active index, every screen would replay its
   * entrance on the way out, in full view.
   */
  const [stamps, setStamps] = useState<number[]>(() =>
    TABS.map((_, index) => (index === 0 ? 1 : 0)),
  );
  const active = stamps.indexOf(Math.max(...stamps));

  const go = useCallback((next: number) => {
    setStamps((current) =>
      current.map((stamp, index) =>
        index === next ? Math.max(...current) + 1 : stamp,
      ),
    );
  }, []);

  /** Set the moment a reader picks a screen, and never unset. */
  const [held, setHeld] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);

  /* Arrow keys move between tabs, as a tab strip is expected to. */
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = useCallback(
    (next: number) => {
      setHeld(true);
      go(next);

      // On a phone the rail is a scrolling strip, and a chip picked at its
      // edge stays at its edge. Centring it is what makes the two chips
      // either side of it discoverable.
      tabs.current[next]?.scrollIntoView({
        block: "nearest",
        inline: "center",
      });
    },
    [go],
  );

  /*
   * Nothing moves until the section is on screen: a carousel that finishes its
   * cycle before anybody scrolls to it has shown nobody anything, and costs a
   * frame every six seconds to do it.
   */
  const section = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = section.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;

    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : step
            ? (active + step + TABS.length) % TABS.length
            : -1;

    if (next < 0) return;
    event.preventDefault();
    pick(next);
    tabs.current[next]?.focus();
  };

  /* And a swipe does on a phone what the tabs do on a desk. */
  const swipe = useRef<number | null>(null);

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (start === null) return;

    const moved = event.changedTouches[0].clientX - start;
    if (Math.abs(moved) < SWIPE_PX) return;

    pick(
      (active + (moved < 0 ? 1 : -1) + TABS.length) % TABS.length,
    );
  };

  /*
   * A reader who has asked for less motion gets no carousel: the bar that
   * times it is a CSS animation, and the `animationend` that advances the tour
   * never fires when that animation is off. Stated here rather than left as a
   * side effect, so the bar comes off the screen too.
   */
  const running = !held && inView && !reduced;

  return (
    <section
      ref={section}
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-16 pb-20 sm:px-8 sm:pt-20 sm:pb-24"
      id="tour"
    >
      {/* Across the full width, as every other section on the page opens.
          Inside the left column it read as a caption on the controls. */}
      <SectionIntro eyebrow="The app" title="See it work" />

      {/* Centred as a pair rather than pushed to the edges: at 352 and 342
          across 1200 they would leave a hole that reads as a missing column.
          Together they read as one object, a phone with its controls. */}
      <div className="mt-9 grid gap-8 lg:mx-auto lg:w-fit lg:grid-cols-[352px_auto] lg:items-center lg:gap-14">
        <div className="min-w-0">
          {/*
            A rail beside the phone on a wide screen, a strip of chips above it
            on a narrow one. One list either way: two would be two things to
            keep in step, and the only difference between them is the axis.
          */}
          <div
            aria-label="App screens"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
            onKeyDown={onKeyDown}
            role="tablist"
          >
            {TABS.map((tab, index) => {
              const on = index === active;

              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabs.current[index] = node;
                  }}
                  aria-controls={`tour-panel-${tab.id}`}
                  aria-selected={on}
                  className={`group relative flex shrink-0 items-center gap-3 overflow-hidden rounded-[18px] px-3 py-2.5 text-left transition-[background-color,transform,box-shadow] duration-200 active:translate-y-[3px] active:shadow-none lg:shrink lg:gap-3.5 lg:px-3.5 lg:py-3 ${
                    on
                      ? "bg-surface shadow-[0_4px_0_var(--line)]"
                      : "hover:bg-surface/70"
                  }`}
                  id={`tour-tab-${tab.id}`}
                  onClick={() => pick(index)}
                  role="tab"
                  tabIndex={on ? 0 : -1}
                  type="button"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] transition-colors lg:h-10 lg:w-10 ${
                      on ? "bg-pandan-soft" : "bg-surface-sunk"
                    }`}
                  >
                    <Image
                      alt=""
                      className={`h-[22px] w-[22px] transition-[filter,opacity] lg:h-6 lg:w-6 ${
                        on ? "" : "opacity-55 grayscale group-hover:opacity-80"
                      }`}
                      height={192}
                      src={tab.icon}
                      width={192}
                    />
                  </span>

                  <span
                    className={`font-sans text-[15px] font-extrabold ${
                      on ? "text-ink" : "text-muted"
                    }`}
                  >
                    {tab.label}
                  </span>

                  {/*
                    The bar IS the timer. Pausing the animation pauses the
                    carousel, which is what a pointer resting on the rail
                    should do, and `animationend` is what moves it on — one
                    clock instead of a CSS one racing a JavaScript one.
                  */}
                  {on && running ? (
                    <span
                      className="tour-progress absolute inset-x-0 bottom-0 h-[3px] rounded-pill bg-pandan"
                      onAnimationEnd={() => go((index + 1) % TABS.length)}
                      style={{
                        animationPlayState: hovering ? "paused" : "running",
                        "--tour-dwell": DWELL,
                      } as React.CSSProperties}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="relative flex min-w-0 justify-center"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onTouchEnd={onTouchEnd}
          onTouchStart={(event) => {
            swipe.current = event.touches[0].clientX;
          }}
        >
          <div className="relative">
            {/* A wash of pandan behind the handset, so the shadow is not the
                only thing lifting a dark object off a near-white canvas.

                Sized to this wrapper rather than to the column: as a
                percentage of the full-width cell, a 768px screen put 67px of
                halo off the page and gave the document a scrollbar. */}
            <span
              className="pointer-events-none absolute inset-x-0 -inset-y-10 rounded-[50%]"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in srgb, var(--pandan) 15%, transparent), transparent)",
              }}
            />

            <PhoneFrame className="relative">
              <div
                className="flex h-full w-full transition-transform duration-[520ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
                style={{ transform: `translateX(-${active * 100}%)` }}
              >
                {TABS.map((tab, index) => (
                  <div
                    key={tab.id}
                    aria-hidden={index !== active}
                    aria-labelledby={`tour-tab-${tab.id}`}
                    className="h-full w-full shrink-0"
                    id={`tour-panel-${tab.id}`}
                    role="tabpanel"
                  >
                    {/* Keyed on this screen's own stamp — see `stamps` above. */}
                    <Slide key={stamps[index]} index={index} />
                  </div>
                ))}
              </div>
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One screen in the carousel. A component rather than the screen itself, so
 * the key that replays its animations owns the whole screen, including
 * whatever that screen mounts inside itself.
 */
function Slide({ index }: { index: number }) {
  const Screen = SCREENS[index];

  return (
    <div className="h-full">
      <Screen />
    </div>
  );
}
