import { ONBOARDING_STEPS, stepNumber, TOTAL_STEPS } from '../steps'

/**
 * The bar has to be continuous and it has to end where the flow ends.
 *
 * Nine screens across three route groups draw the same progress bar, and before
 * this list they each carried their own hardcoded pair of numbers. That survived
 * exactly until a screen was inserted in the middle: the four questions said "of
 * 4" while the permissions after them said "of 9", and one of them said "step 4"
 * twice. None of it crashed and none of it typechecked as wrong.
 */

it('numbers every step once, from one, with no gaps', () => {
  const numbers = ONBOARDING_STEPS.map(stepNumber)

  expect(numbers).toEqual(Array.from({ length: ONBOARDING_STEPS.length }, (_, i) => i + 1))
})

it('ends on the last screen of the flow, not past it', () => {
  expect(stepNumber('notifications')).toBe(TOTAL_STEPS)
})

it('puts the account after the plan and before the permissions', () => {
  // The order is the argument for the whole flow: the questions are answered and
  // the budget is shown BEFORE an email is asked for, and the two permissions
  // come after the account because both write a row keyed by user.
  expect(stepNumber('target')).toBeLessThan(stepNumber('account'))
  expect(stepNumber('account')).toBeLessThan(stepNumber('health'))
  expect(stepNumber('health')).toBeLessThan(stepNumber('notifications'))
})
