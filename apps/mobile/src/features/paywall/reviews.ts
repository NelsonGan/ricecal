/**
 * The rating and user count the paywall quotes, and the reviews under them.
 *
 * Supplied by the owner on 27 November 2026; the 4.8 matches the Google Play
 * listing's rating that day. The website (`apps/web/src/components/home/
 * reviews-data.ts`) and the App Studio's brand panel show the same two figures,
 * so change all three together.
 */
export const SOCIAL_PROOF = { rating: 4.8, users: '5K' } as const

export type PaywallReview = {
  quote: string
  /** The reviewer's store name, exactly as they wrote it. */
  author: string
  stars: number
}

/**
 * Real five-star App Store reviews, read through App Store Connect on
 * 27 November 2026. Each quote is the reviewer's own words, cut to a sentence
 * or two with light grammar edits; never add a claim they did not make. Kept to
 * about three lines on a phone: the cards share the tallest one's height, so a
 * long quote leaves the short ones with a gap above the name. Not
 * translated: a review is quoted in the language it was written in. The
 * website quotes the fuller text of the same reviews.
 */
export const PAYWALL_REVIEWS: readonly PaywallReview[] = [
  {
    quote: "It works really well for local Asian food, which most calorie apps don't handle well.",
    author: 'eggieeesss',
    stars: 5,
  },
  {
    quote: 'The snap feature and AI capabilities make things so quick and intuitive.',
    author: 'Zayydah',
    stars: 5,
  },
  {
    quote: 'The only app I am using now to track nutrition and workouts!',
    author: 'jamesgan99',
    stars: 5,
  },
  {
    quote: 'It is able to detect a lot of the local food that I snap.',
    author: 'minghui2103',
    stars: 5,
  },
  {
    quote: 'It was so easy to get started and use for my diet plan.',
    author: 'Locards Principle',
    stars: 5,
  },
]
