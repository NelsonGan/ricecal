import type { MealTime } from '@/data/types'
import { defaultKcal, MIN_KCAL, mealAt } from '../ask'

/**
 * What the ask sheet answers before the user touches it.
 *
 * Both of these are wrong in the way nobody reports: the sheet opens on the
 * wrong sitting or a silly ceiling, the user changes it, and never mentions it.
 */

const times = (over: Partial<Record<string, string>> = {}): MealTime[] =>
  (
    [
      { meal: 'breakfast', at: '08:00:00' },
      { meal: 'lunch', at: '13:00:00' },
      { meal: 'dinner', at: '19:00:00' },
    ] as const
  ).map((row) => ({ ...row, at: over[row.meal] ?? row.at }) as MealTime)

const at = (hours: number, minutes = 0) => new Date(2026, 7, 19, hours, minutes)

it('reads the sitting off the user’s own meal times', () => {
  expect(mealAt(at(8, 15), times())).toBe('breakfast')
  expect(mealAt(at(12, 30), times())).toBe('lunch')
  expect(mealAt(at(19, 45), times())).toBe('dinner')
})

it('follows a meal time that has been moved', () => {
  // Somebody whose dinner is at nine gets dinner at nine, where a table of
  // hardcoded windows would have handed them a snack.
  expect(mealAt(at(21, 15), times({ dinner: '21:30:00' }))).toBe('dinner')
})

it('calls the time between meals a snack', () => {
  expect(mealAt(at(16, 0), times())).toBe('snack')
  expect(mealAt(at(23, 30), times())).toBe('snack')
})

it('says snack rather than guessing, before the meal times have loaded', () => {
  expect(mealAt(at(8, 15), undefined)).toBe('snack')
  expect(mealAt(at(8, 15), [])).toBe('snack')
})

it('measures the distance round the clock, not along it', () => {
  // 00:30 is twenty minutes from a 00:10 supper, not twenty-three hours from it.
  expect(mealAt(at(0, 30), [{ meal: 'dinner', at: '00:10:00' } as MealTime])).toBe('dinner')
})

it('opens the ceiling on a plausible meal, not on the whole day', () => {
  // A fresh morning has the whole budget left, and nobody is asking for a
  // 2,400 kcal breakfast.
  expect(defaultKcal(2400, 'breakfast')).toBe(800)
  expect(defaultKcal(2400, 'snack')).toBe(300)
})

it('follows what is actually left when that is the smaller number', () => {
  expect(defaultKcal(450, 'dinner')).toBe(450)
  expect(defaultKcal(437, 'dinner')).toBe(450)
})

it('never opens on a ceiling that cannot be asked for', () => {
  // A day already over budget still opens on something askable rather than on
  // a dead button.
  expect(defaultKcal(0, 'dinner')).toBe(MIN_KCAL)
  expect(defaultKcal(-800, 'dinner')).toBe(MIN_KCAL)
})
