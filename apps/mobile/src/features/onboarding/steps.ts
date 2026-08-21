/**
 * The order of the flow, in one array.
 *
 * The progress bar spans nine screens across three route groups — the questions
 * and the plan in `(onboarding)`, the account in `(auth)` — and every one of them
 * has to agree about which number it is and how many there are in total. Written
 * out per screen, that agreement lasted exactly as long as nobody inserted a
 * step: adding the calculating beat meant editing "4" into "5" in four files and
 * "of 4" into "of 9" in six, and a screen that got the second edit and not the
 * first says "step 3 of 9" twice.
 *
 * So the position is derived from this list and nothing else. Inserting a screen
 * is one line here; deleting one is one line here. A name that is not in the list
 * does not typecheck.
 */
export const ONBOARDING_STEPS = [
  // Language and units, and it is first because everything after it is read in
  // one and measured in the other. The height and weight on `about` are typed
  // in whichever this screen chose.
  'setup',
  'about',
  'activity',
  // No `foodStyle`. The question ("how do you usually makan") fed a
  // `profiles.food_styles` array that ranked nothing: search is the Worker's,
  // and its prior is locale, popularity and verification. A question whose
  // answer changes nothing is a screen between a user and their diary.
  'source',
  'calculating',
  'target',
  'account',
  'health',
  'notifications',
] as const

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number]

/** How many marks the bar draws. */
export const TOTAL_STEPS = ONBOARDING_STEPS.length

/** 1-based, which is what `StepProgress` and the screen-reader label both want. */
export function stepNumber(name: OnboardingStepName): number {
  return ONBOARDING_STEPS.indexOf(name) + 1
}
