
type ReviewBase = {
  /** The store's own review ID, kept so the edited copy can be checked against it. */
  id: string;
  author: string;
  body: string;
  rating: number;
  date: string;
};

/** App Store reviews carry a title and a storefront; Google Play reviews have neither. */
export type AppReview =
  | (ReviewBase & { store: "appStore"; title: string; country: "sg" | "my" })
  | (ReviewBase & { store: "playStore" });

/**
 * Selected store reviews, read on 27 November 2026: the App Store's through
 * App Store Connect (`asc reviews list`), Google Play's from the listing.
 *
 * Bodies are the reviewers' own words with light punctuation and grammar
 * edits, and emoji dropped. Titles keep their wording, with capitalisation
 * tidied. Names and stars are unchanged. Dates are the review's UTC day.
 * Never add a claim the original reviewer did not make. These are baked in,
 * not fetched on visits. The paywall quotes some of the same reviews
 * (`apps/mobile/src/features/paywall/reviews.ts`), so refresh both together.
 */
export const APP_REVIEWS: AppReview[] = [
  {
    id: "00000195-0bfe-c303-666f-8c2b00000000",
    store: "appStore",
    author: "Zayydah",
    title: "Best cal tracker I've used!",
    body: "I've tried many trackers before and they were all difficult in some way, but this app's UX is really smooth and adaptable! The snap feature and AI capabilities make things so quick and intuitive. App design is really cute too.",
    rating: 5,
    date: "2026-09-28",
    country: "sg",
  },
  {
    id: "00000195-0bfe-c303-71c8-4e9900000000",
    store: "appStore",
    author: "jamesgan99",
    title: "All in one nutrition + fitness tracking",
    body: "I love how integrated the different features in the app are. The only app I am using now to track nutrition and workouts!",
    rating: 5,
    date: "2026-11-15",
    country: "my",
  },
  {
    id: "00000195-0bfe-c303-63e1-949400000000",
    store: "appStore",
    author: "eggieeesss",
    title: "Super handy calorie tracker!",
    body: "I can log my daily meals effortlessly and check my full eating history easily. It works really well for local Asian food, which most calorie apps don't handle well.",
    rating: 5,
    date: "2026-09-17",
    country: "sg",
  },
  {
    id: "00000195-0bfe-c303-6178-245300000000",
    store: "appStore",
    author: "minghui2103",
    title: "Easy to use",
    body: "This app is really easy to use. I like that it is localised properly for Asian food, which other calorie tracking apps lack. It is able to detect a lot of the local food that I snap.",
    rating: 5,
    date: "2026-09-07",
    country: "my",
  },
  {
    id: "00000195-0bfe-c303-6672-acfd00000000",
    store: "appStore",
    author: "Locards Principle",
    title: "Best calorie tracker",
    body: "Stumbled upon this app by chance, and it was so easy to get started with for my diet plan. It also tracks my step count and updates my calorie limit, allowing me to eat a bit more.",
    rating: 5,
    date: "2026-09-28",
    country: "sg",
  },
  {
    id: "7492ce82-6c25-473d-b235-cc0de2ad1d00",
    store: "playStore",
    author: "Chen Xin Lau",
    body: "Good app. I can record my meals for more than a week without subscribing to any plan.",
    rating: 5,
    date: "2026-11-04",
  },
  {
    id: "00000195-0bfe-c303-64f7-4cd500000000",
    store: "appStore",
    author: "syk4321",
    title: "Good free calorie tracking app!",
    body: "Good app, it helps me keep track of my food calories and be healthy! I also like that it integrates Apple Health.",
    rating: 5,
    date: "2026-09-22",
    country: "my",
  },
  {
    id: "00000195-0bfe-c303-6919-d6ea00000000",
    store: "appStore",
    author: "Alexxxxxxxlllllll320",
    title: "Good and simple!",
    body: "Able to log in and navigate easily, and the interface is easy to understand.",
    rating: 5,
    date: "2026-10-10",
    country: "my",
  },
];

/**
 * Supplied by the owner on 27 November 2026. The 4.8 matches the Google Play
 * listing's rating that day. The app's paywall and the App Studio's gallery
 * show the same two figures; change all three together, and reconfirm both
 * with the owner when refreshing this snapshot.
 */
export const REVIEW_SOCIAL_PROOF = { users: 5_000, rating: 4.8 };

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
