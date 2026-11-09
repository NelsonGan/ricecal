"use client";

import Image from "next/image";

import { type ChipDish, dishesForRegion } from "@/lib/regions";
import { useRegion } from "@/lib/use-region";

function Row({ dishes, hidden }: { dishes: ChipDish[]; hidden?: boolean }) {
  return (
    <div className="flex shrink-0 gap-3" aria-hidden={hidden}>
      {dishes.map((dish) => (
        <span
          key={dish.name}
          className="chip flex shrink-0 items-center gap-2 py-[11px] pl-3 pr-[18px]"
        >
          <Image
            src={dish.icon}
            alt=""
            width={192}
            height={192}
            className="h-[26px] w-[26px]"
          />
          <span className="font-sans text-[15px] font-extrabold text-ink">
            {dish.name}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The dishes scrolling under the hero — or above it, on a phone, where they
 * are the first thing on the page. See `home-main.tsx` for why the order moves
 * and `lib/regions.ts` for how the region is picked and why the server always
 * renders the pan-Asian set.
 */
export function DishMarquee({ className = "" }: { className?: string }) {
  const { region } = useRegion();
  const dishes = dishesForRegion(region);

  return (
    <section className={`mx-auto w-full max-w-[1200px] px-5 pb-3 sm:px-8 ${className}`}>
      <div
        className="overflow-hidden py-1.5"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        }}
      >
        {/* The row is doubled so the loop can translate exactly half its width. */}
        <div className="marquee flex w-max gap-3">
          <Row dishes={dishes} />
          <Row dishes={dishes} hidden />
        </div>
      </div>
    </section>
  );
}
