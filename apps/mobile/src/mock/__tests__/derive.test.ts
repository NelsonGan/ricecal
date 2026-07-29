import type { DayLog, Entry, Profile } from '@/mock'
import {
  bmi,
  computeTargets,
  entriesForMeal,
  entryMacros,
  FOODS,
  getFood,
  goalDate,
  mealForHour,
  mealKcal,
  progressOf,
  scaleTargets,
  sumMacros,
  weeklyPace,
} from '@/mock'

/**
 * These cover the arithmetic every screen displays. The screens themselves are
 * checked on a simulator; what is worth pinning here is that a number shown to
 * a user cannot silently change when the formula moves behind an API.
 */

const profile: Profile = {
  name: 'Test',
  memberSinceMonth: 'March',
  sex: 'female',
  goal: 'lose',
  heightCm: 164,
  weightKg: 68.4,
  targetWeightKg: 65,
  age: 29,
  activity: 'light',
  foodStyles: [],
  mealTimes: [],
  units: 'metric',
  energy: 'kcal',
  language: 'en',
}

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  foodId: 'roti-canai',
  meal: 'breakfast',
  quantity: 1,
  servingId: 'piece',
  loggedAt: '2026-07-29T08:00:00.000Z',
  ...over,
})

describe('the food catalogue', () => {
  it('gives every food at least one serving', () => {
    for (const food of FOODS) {
      expect(food.servings.length).toBeGreaterThan(0)
    }
  })

  it('makes the first serving the whole portion', () => {
    for (const food of FOODS) {
      expect(food.servings[0].factor).toBe(1)
    }
  })

  it('throws on an unknown id rather than returning a blank food', () => {
    expect(() => getFood('not-a-dish')).toThrow(/Unknown food id/)
  })
})

describe('entryMacros', () => {
  it('scales by serving and quantity', () => {
    const whole = entryMacros(entry())
    const half = entryMacros(entry({ servingId: 'half' }))
    const two = entryMacros(entry({ quantity: 2 }))

    expect(whole.kcal).toBe(301)
    expect(half.kcal).toBe(151)
    expect(two.kcal).toBe(602)
  })

  it('falls back to the first serving when the id is unknown', () => {
    expect(entryMacros(entry({ servingId: 'nonsense' })).kcal).toBe(301)
  })
})

describe('a day', () => {
  const day: DayLog = {
    date: '2026-07-29',
    waterGlasses: 5,
    entries: [
      entry({ id: 'a' }),
      entry({ id: 'b', foodId: 'teh-tarik', servingId: 'cup' }),
      entry({ id: 'c', foodId: 'char-kuey-teow', meal: 'lunch', servingId: 'plate' }),
    ],
  }

  it('totals every entry', () => {
    expect(sumMacros(day.entries).kcal).toBe(301 + 135 + 742)
  })

  it('splits entries by meal', () => {
    expect(entriesForMeal(day, 'breakfast')).toHaveLength(2)
    expect(mealKcal(day, 'lunch')).toBe(742)
    expect(mealKcal(day, 'dinner')).toBe(0)
  })

  it('sorts a meal by the time it was logged', () => {
    const unsorted: DayLog = {
      ...day,
      entries: [
        entry({ id: 'late', loggedAt: '2026-07-29T10:00:00.000Z' }),
        entry({ id: 'early', loggedAt: '2026-07-29T07:00:00.000Z' }),
      ],
    }
    expect(entriesForMeal(unsorted, 'breakfast').map((e) => e.id)).toEqual(['early', 'late'])
  })
})

describe('targets', () => {
  it('puts a losing plan below a maintaining one', () => {
    const losing = computeTargets({ ...profile, goal: 'lose' })
    const maintaining = computeTargets({ ...profile, goal: 'maintain' })
    expect(losing.kcal).toBeLessThan(maintaining.kcal)
  })

  it('rises with activity', () => {
    const desk = computeTargets({ ...profile, activity: 'sedentary' })
    const athlete = computeTargets({ ...profile, activity: 'veryActive' })
    expect(athlete.kcal).toBeGreaterThan(desk.kcal)
  })

  it('splits macros so their energy adds back up to the budget', () => {
    const targets = computeTargets(profile)
    const energy = targets.carbs * 4 + targets.protein * 4 + targets.fat * 9
    // Within a few kcal: the grams are rounded to whole numbers.
    expect(Math.abs(energy - targets.kcal)).toBeLessThan(10)
  })

  it('scales macros with the day budget when exercise adds calories back', () => {
    const targets = computeTargets(profile)
    const scaled = scaleTargets(targets, targets.kcal + 300)

    expect(scaled.kcal).toBe(targets.kcal + 300)
    expect(scaled.carbs).toBeGreaterThan(targets.carbs)
    // Water and steps are not calories and must not move.
    expect(scaled.waterGlasses).toBe(targets.waterGlasses)
    expect(scaled.steps).toBe(targets.steps)
  })

  it('leaves targets alone when the budget has not changed', () => {
    const targets = computeTargets(profile)
    expect(scaleTargets(targets, targets.kcal)).toBe(targets)
  })
})

describe('goals', () => {
  it('projects a date for a plan that moves', () => {
    const from = new Date('2026-07-29T00:00:00.000Z')
    const reached = goalDate(profile, from)
    expect(reached).not.toBeNull()
    expect(reached?.getTime()).toBeGreaterThan(from.getTime())
  })

  it('has no finish line for maintaining', () => {
    expect(goalDate({ ...profile, goal: 'maintain' }, new Date())).toBeNull()
  })

  it('has no finish line once the target is reached', () => {
    expect(goalDate({ ...profile, targetWeightKg: profile.weightKg }, new Date())).toBeNull()
  })

  it('gives maintaining no weekly pace', () => {
    expect(weeklyPace({ ...profile, goal: 'maintain' })).toBe(0)
  })
})

describe('small helpers', () => {
  it('clamps progress to 0..1', () => {
    expect(progressOf(50, 100)).toBe(0.5)
    expect(progressOf(150, 100)).toBe(1)
    expect(progressOf(-5, 100)).toBe(0)
    expect(progressOf(10, 0)).toBe(0)
  })

  it('picks a meal from the clock, never guessing snack', () => {
    expect(mealForHour(8)).toBe('breakfast')
    expect(mealForHour(13)).toBe('lunch')
    expect(mealForHour(20)).toBe('dinner')
  })

  it('computes bmi to one decimal', () => {
    expect(bmi(profile)).toBeCloseTo(25.4, 1)
  })
})
