import Link from "next/link";

import { FoodIcon, foodMeta } from "@/components/food-icon";
import type { CatalogueFood } from "@/lib/catalogue";

/**
 * The dish table, drawn the way the app draws a food: each dish is a card row
 * with the app's three macro bars under it — carbs kaya, protein hibiscus, fat
 * teh, the same order and colours everywhere in RiceCal.
 *
 * Every row links to that dish's own page, which is where the things that do
 * not fit on a row go: the portion in grams, the fibre and sodium, and the
 * attribution some of these rows require.
 */

/**
 * The bar is the share of the dish's own calories, not of a daily goal — a
 * page has no idea what the reader's goal is. 4 kcal a gram of carbohydrate
 * and of protein, 9 of fat.
 */
const MACROS = [
  { energy: 4, fill: "bg-kaya", key: "carbs_g", label: "Carbs" },
  { energy: 4, fill: "bg-hibiscus", key: "protein_g", label: "Protein" },
  { energy: 9, fill: "bg-teh", key: "fat_g", label: "Fat" },
] as const;

function macrosOf(dish: CatalogueFood) {
  const energies = MACROS.map((macro) => dish[macro.key] * macro.energy);
  const total = energies.reduce((sum, energy) => sum + energy, 0);

  return MACROS.map((macro, index) => ({
    ...macro,
    // Rounded: a decimal gram on a stall portion is false precision.
    grams: Math.round(dish[macro.key]),
    share: total > 0 ? energies[index] / total : 0,
  }));
}

function DishRow({ dish }: { dish: CatalogueFood }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link
        href={`/food/${dish.slug}`}
        className="group block px-5 py-5 transition-colors hover:bg-surface sm:px-6 lg:flex lg:items-center lg:gap-8"
      >
        {/* Name, portion and calories are one block that stays together: on a
            phone they are the row, and the bars sit under them. */}
        <div className="flex items-start justify-between gap-4 lg:min-w-0 lg:flex-1 lg:items-center">
          <div className="flex min-w-0 items-center gap-3.5">
            <FoodIcon food={dish} className="h-[52px] w-[52px]" />
            <div className="min-w-0">
              <h3 className="font-sans text-[16px] font-extrabold text-ink transition-colors group-hover:text-pandan-deep">
                {dish.name}
              </h3>
              <p className="mt-0.5 font-sans text-[13px] text-muted">
                {foodMeta(dish)}
              </p>
            </div>
          </div>
          <p className="shrink-0 text-right lg:w-[70px]">
            <span className="font-display text-[20px] font-extrabold leading-none text-heading">
              {dish.kcal}
            </span>
            <span className="mt-1 block font-sans text-[11px] font-extrabold uppercase tracking-[0.1em] text-faint">
              kcal
            </span>
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-x-3 sm:gap-x-6 lg:mt-0 lg:w-[430px] lg:shrink-0 lg:gap-x-5">
          {macrosOf(dish).map((macro) => (
            <div key={macro.key}>
              <div className="flex items-baseline justify-between gap-1.5">
                <span className="font-sans text-[12px] font-extrabold text-ink sm:text-[13px]">
                  {macro.label}
                </span>
                <span className="font-sans text-[12px] font-extrabold text-muted sm:text-[13px]">
                  {macro.grams} g
                </span>
              </div>
              {/* The figure is already on the row above, so the bar is a shape,
                  not a second reading of the same number. */}
              <div
                aria-hidden
                className="mt-1.5 h-2 overflow-hidden rounded-pill bg-surface-sunk"
              >
                <div
                  className={`h-full rounded-pill ${macro.fill}`}
                  style={{ width: `${Math.round(macro.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Link>
    </li>
  );
}

export function DishList({
  className = "",
  dishes,
}: {
  className?: string;
  dishes: CatalogueFood[];
}) {
  return (
    <ul className={`card overflow-hidden ${className}`}>
      {dishes.map((dish) => (
        <DishRow dish={dish} key={dish.slug} />
      ))}
    </ul>
  );
}
