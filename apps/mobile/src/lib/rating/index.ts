/**
 * The rating prompt's logic: when to ask, and what to do with the answer.
 *
 * In `lib` rather than in `features` because the counters are called from the
 * data layer, where a meal is written, and `src/data` does not import a feature.
 * The one piece that IS a screen, `RatePromptSheet`, lives in
 * `features/rating` and talks to this through `subscribeToRatingPrompt`.
 */

export {
  askForRating,
  type RatingRequest,
  ratingDisliked,
  ratingDismissed,
  ratingFeedbackOpened,
  ratingLiked,
  recordMealLogged,
  recordReviewOpened,
  resetRatingStateForTest,
  subscribeToRatingPrompt,
} from './prompt'
export {
  checkRating,
  crossedCheckpoint,
  MEALS_PER_CHECKPOINT,
  MIN_ACTIVE_DAYS,
  MIN_DAYS_BETWEEN_ASKS,
  MIN_DAYS_SINCE_INSTALL,
  MIN_DAYS_SINCE_VERSION_CHANGE,
  type RatingSkipReason,
  type RatingState,
  type RatingTrigger,
  type RatingVerdict,
  reviewWorthAsking,
} from './state'
