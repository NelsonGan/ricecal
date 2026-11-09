"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";

import { EVENTS, track } from "@/lib/analytics";
import {
  isRegion,
  pathAfterRegion,
  REGION_OPTIONS,
  regionPath,
} from "@/lib/regions";
import { useRegion } from "@/lib/use-region";

/**
 * Picking where the reader eats, and going there.
 *
 * Changing the country changes the URL, so the result can be bookmarked or
 * sent to somebody — and the path after the country code is carried across,
 * because somebody reading Malaysia's dish table wants Singapore's dish table
 * rather than its front page.
 *
 * The value shown is `useRegion`'s, so the control never disagrees with the
 * page around it.
 */
export function RegionPicker() {
  const pathname = usePathname();
  const router = useRouter();
  const { locked, region, setRegion } = useRegion();
  const id = useId();

  function handleChange(next: string) {
    if (!isRegion(next)) return;

    setRegion(next);
    track(EVENTS.regionChanged, {
      from: region,
      // Whether the country was already settled by the URL or was the reader's
      // standing preference — the same control, two quite different intents.
      fromLocalisedPage: locked,
      to: next,
    });

    router.push(regionPath(next, pathAfterRegion(pathname)));
  }

  return (
    <div className="flex items-center gap-2.5">
      <label
        htmlFor={id}
        className="font-sans text-[14px] font-bold text-muted"
      >
        Food from
      </label>

      <div className="relative">
        <select
          id={id}
          value={region}
          onChange={(event) => handleChange(event.target.value)}
          className="chip cursor-pointer appearance-none py-2 pl-4 pr-9 font-sans text-[14px] font-extrabold text-ink transition-colors hover:text-pandan-deep"
        >
          {REGION_OPTIONS.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.label}
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
  );
}
