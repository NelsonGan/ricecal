import { Countries } from "@/components/home/countries";
import { DishMarquee } from "@/components/home/dish-marquee";
import { Features } from "@/components/home/features";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { PlanComparison } from "@/components/home/plan-comparison";
import { Pricing } from "@/components/home/pricing";
import { Reviews } from "@/components/home/reviews";
import { Stats } from "@/components/home/stats";
import { Why } from "@/components/home/why";
import type { Country } from "@/lib/countries";

/**
 * The home page's body, shared by `/` and by every `/{code}`.
 *
 * One layout, two ways of deciding whose food is in it: on `/` the marquee and
 * the feature cards ask the browser, and on `/my` they are pinned by
 * `RegionLock` in the page above, with `country` localising the hero. Keeping
 * it one component is what stops the fifteen pages drifting apart.
 */
export function HomeMain({ country }: { country?: Country }) {
  return (
    <main className="flex-1">
      {/*
        A flex column around just these two, so the marquee can move.

        On a phone the dishes come first, because the fastest way to say what
        the app is for is to show a plate of food and a phone shows one thing
        at a time. On a wide screen the headline and the search already fill
        the first screen, so the marquee reads better under them. DOM order is
        the wide-screen order, and `order-first` lifts the marquee below `lg`.

        The wrapper stays small on purpose: making `main` the flex container
        pushed the whole document sideways on a 375px screen, because a flex
        item's `min-width` defaults to its min-content width and sections built
        around something wider than the screen stop shrinking to fit.

        The top padding travels with the order, since whatever comes first has
        to clear the fixed header.
      */}
      <div className="flex flex-col [&>*]:min-w-0">
        <Hero country={country} />
        <DishMarquee className="order-first pt-24 lg:order-none lg:pt-6" />
      </div>

      <Why />
      <Stats />
      <Features />
      <Reviews />
      <Countries />
      <Pricing />
      <PlanComparison />
      <FinalCta />
    </main>
  );
}
