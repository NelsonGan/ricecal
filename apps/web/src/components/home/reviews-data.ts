export type AppReview = {
  /** Apple's review ID, retained so the edited copy can be checked in the feed. */
  id: string;
  author: string;
  title: string;
  body: string;
  rating: number;
  date: string;
  country: "sg" | "my";
};

/**
 * Selected App Store reviews, read on 2 October 2026 from Apple's public feeds:
 * https://itunes.apple.com/sg/rss/customerreviews/id=6795558595/sortBy=mostRecent/json
 * https://itunes.apple.com/my/rss/customerreviews/id=6795558595/sortBy=mostRecent/json
 *
 * Bodies are excerpts in the reviewers' own words, with light punctuation and
 * grammar edits. Titles keep their wording, with capitalisation tidied.
 * Names and stars are unchanged.
 * Dates use the feed's UTC day, matching the dates shown on the store listings.
 * Keep the section's excerpt note when editing these, and never add a claim
 * the original reviewer did not make. These are baked in, not fetched on visits.
 */
export const APP_REVIEWS: AppReview[] = [
  {
    id: "14603488299",
    author: "Zayydah",
    title: "Best cal tracker I've used!",
    body: "The snap feature and AI capabilities make things so quick and intuitive. App design is really cute too.",
    rating: 5,
    date: "2026-09-28",
    country: "sg",
  },
  {
    id: "14520165459",
    author: "minghui2103",
    title: "Easy to use",
    body: "This app is really easy to use. It is able to detect a lot of the local food that I snap.",
    rating: 5,
    date: "2026-09-07",
    country: "my",
  },
  {
    id: "14603693309",
    author: "Locards Principle",
    title: "Best calorie tracker",
    body: "It also tracks my step count and updates my calorie limit, allowing me to eat a bit more.",
    rating: 5,
    date: "2026-09-28",
    country: "sg",
  },
  {
    id: "14578830549",
    author: "syk4321",
    title: "Good free calorie tracking app!",
    body: "Good app, helps me keep track of my food calories. I also like that it integrates Apple Health.",
    rating: 5,
    date: "2026-09-22",
    country: "my",
  },
  {
    id: "14560629908",
    author: "eggieeesss",
    title: "Super handy calorie tracker!",
    body: "It works really well for local Asian food, which most calorie apps don't handle well.",
    rating: 5,
    date: "2026-09-17",
    country: "sg",
  },
];

/**
 * Supplied by the owner on 2 October 2026. The 4.5 is the worldwide App Store
 * rating confirmed from App Store Connect, not either storefront's average.
 * Reconfirm both figures with the owner when refreshing this snapshot.
 */
export const REVIEW_SOCIAL_PROOF = { users: 2_000, rating: 4.5 };

export const REVIEW_STORES = {
  sg: {
    name: "Singapore",
    flag: "🇸🇬",
    url: "https://apps.apple.com/sg/app/ricecal-asia-calorie-tracker/id6795558595",
  },
  my: {
    name: "Malaysia",
    flag: "🇲🇾",
    url: "https://apps.apple.com/my/app/ricecal-asia-calorie-tracker/id6795558595",
  },
};
