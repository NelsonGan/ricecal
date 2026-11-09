import Image from "next/image";

import type { CatalogueFood } from "@/lib/catalogue";

/**
 * A dish's own picture, in the tile the app draws it in.
 *
 * The catalogue carries `icon_set` and `icon_name` on about five rows in six,
 * pointing into the same PNGs the app ships (`public/icons/{set}/{name}.png`).
 * A reader who has seen nasi lemak in the app recognises the row before they
 * have read it.
 *
 * The tile is always drawn, even for the sixth row with no picture — a ragged
 * left edge reads as a mistake rather than as missing data — so those fall
 * back to the generic plate.
 *
 * `unoptimized` is the site-wide default from `next.config.ts`; it is repeated
 * on the tag because these are already 192px PNGs sized for exactly this.
 */

const FALLBACK = "/icons/food/portion-plate.png";

export function FoodIcon({
  className = "",
  food,
}: {
  /** The tile's size, as utility classes, so it can differ per breakpoint. */
  className?: string;
  food: Pick<CatalogueFood, "icon_name" | "icon_set" | "name">;
}) {
  const src =
    food.icon_set && food.icon_name
      ? `/icons/${food.icon_set}/${food.icon_name}.png`
      : FALLBACK;

  /*
   * Sized by class rather than by a `size` prop: a prop means an inline pixel
   * value, which cannot answer a media query, so a responsive tile had to be
   * rendered twice per row behind `sm:hidden` and `hidden sm:flex`.
   *
   * The picture is 71% of the tile at every size — the design system's 40-in-56.
   */
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[18px] bg-surface-sunk ${className}`}
    >
      <Image
        alt=""
        className="h-[71%] w-[71%] object-contain"
        height={96}
        src={src}
        unoptimized
        width={96}
      />
    </span>
  );
}

/** "Hawker · 1 plate", the app's own second line on a food row. */
export function foodMeta(food: Pick<CatalogueFood, "brand" | "place" | "serving_label">) {
  const place = food.place ? food.place[0].toUpperCase() + food.place.slice(1) : null;
  return [food.brand ?? place, food.serving_label].filter(Boolean).join(" · ");
}
