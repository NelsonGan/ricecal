import type { ReactNode } from "react";

import {
  APP_REVIEWS,
  REVIEW_SOCIAL_PROOF,
  REVIEW_STORES,
} from "@/components/home/reviews-data";
import { SectionIntro } from "@/components/section";

const STAR = "M12 2.5 14.9 8.4 21.4 9.4 16.7 14 17.8 20.5 12 17.4 6.2 20.5 7.3 14 2.6 9.4 9.1 8.4Z";

/** The worldwide score keeps its half star; each review keeps its own stars. */
function Stars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className="inline-flex gap-0.5"
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const filled = Math.min(1, Math.max(0, rating - index));
        return (
          <svg
            key={index}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-3.5 w-3.5"
          >
            <path d={STAR} className="fill-line-strong" />
            <path
              d={STAR}
              className="fill-kaya"
              style={{ clipPath: `inset(0 ${(1 - filled) * 100}% 0 0)` }}
            />
          </svg>
        );
      })}
    </span>
  );
}

/** The same laurel shape as Money2Time, in RiceCal's own data colour. */
function Laurel({ mirror = false }: { mirror?: boolean }) {
  return (
    <svg
      viewBox="1 1 26.4 74.4"
      fill="currentColor"
      aria-hidden="true"
      className={`h-[54px] w-[19px] shrink-0 text-pandan sm:h-[62px] sm:w-[22px] ${mirror ? "-scale-x-100" : ""}`}
    >
      <path
        d="M26 74C7 60 4 30 17 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {[
        [18.85, 67.1, 10.6, 3.9, -170.5],
        [13.58, 58.43, 10.03, 3.67, -157.8],
        [10.38, 48.75, 9.47, 3.45, -147.1],
        [9.12, 38.65, 8.9, 3.22, -138.1],
        [9.56, 28.44, 8.33, 3, -130.5],
        [11.51, 18.41, 7.77, 2.77, -123.6],
        [14.79, 8.82, 7.2, 2.55, -117.3],
        [15.78, 62.65, 8.4, 3.2, -74.8],
        [11.67, 53.51, 7.84, 2.98, -60.4],
        [9.52, 43.69, 7.28, 2.76, -47.8],
        [9.14, 33.59, 6.72, 2.54, -36.8],
        [10.33, 23.54, 6.16, 2.32, -26.7],
        [12.91, 13.8, 5.6, 2.1, -17.3],
      ].map(([x, y, length, width, angle], index) => (
        <path
          key={index}
          d={`M0 0C${length * 0.34} ${-width} ${length * 0.76} ${-width * 0.78} ${length} 0C${length * 0.76} ${width * 0.78} ${length * 0.34} ${width} 0 0Z`}
          transform={`translate(${x} ${y})rotate(${angle})`}
        />
      ))}
    </svg>
  );
}

function ReviewStat({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <Laurel />
      <div className="flex min-w-[70px] flex-col items-center gap-1.5 text-center sm:min-w-[85px]">
        <span className="font-display text-[32px] font-extrabold leading-none tabular-nums text-heading sm:text-[36px]">
          {value}
        </span>
        {children}
      </div>
      <Laurel mirror />
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function Reviews() {
  return (
    <section
      id="reviews"
      className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-16 sm:px-8"
    >
      <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <SectionIntro eyebrow="Reviews" title="What people say about RiceCal" />

        <div className="flex items-center gap-5 sm:gap-9 lg:shrink-0">
          <ReviewStat
            value={Intl.NumberFormat("en", {
              notation: "compact",
              maximumFractionDigits: 0,
            }).format(REVIEW_SOCIAL_PROOF.users)}
          >
            <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">
              Users&apos; choice
            </span>
          </ReviewStat>

          <ReviewStat value={REVIEW_SOCIAL_PROOF.rating.toFixed(1)}>
            <Stars rating={REVIEW_SOCIAL_PROOF.rating} />
          </ReviewStat>
        </div>
      </div>

      <div className="mt-8 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
        {APP_REVIEWS.map((review) => {
          const store = REVIEW_STORES[review.country];
          return (
            <figure key={review.id} className="card break-inside-avoid p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars rating={review.rating} />
                <a
                  href={store.url}
                  aria-label={`View ${store.name} App Store reviews`}
                  className="inline-flex items-center gap-1.5 rounded-sm text-[11px] font-bold text-muted transition-colors hover:text-pandan focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pandan"
                >
                  App Store
                  <span aria-hidden="true" className="text-[14px] leading-none">
                    {store.flag}
                  </span>
                </a>
              </div>
              <h3 className="mt-4 text-[21px]">{review.title}</h3>
              <blockquote cite={store.url} className="mt-2 text-[15px] leading-[1.65] text-body">
                {review.body}
              </blockquote>
              <p className="mt-2 text-[11px] text-muted">Review excerpt</p>
              <figcaption className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-4">
                <span className="min-w-0 break-words text-[13px] font-extrabold text-ink">
                  {review.author}
                </span>
                <time dateTime={review.date} className="text-[12px] text-muted">
                  {DATE_FORMAT.format(new Date(`${review.date}T00:00:00Z`))}
                </time>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
