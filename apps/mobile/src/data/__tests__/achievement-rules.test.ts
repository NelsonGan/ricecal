// Imported from the rules module rather than the barrel: the barrel reaches
// the Supabase client, which reaches a native module, and none of that is
// needed to check arithmetic.
import {
  BADGE_GOALS,
  bestStreak,
  currentStreak,
  evaluateAchievements,
} from '@/data/achievement-rules'
import type { AchievementRule, DayLog, Entry, Targets } from '@/data/types'

/**
 * The badges are derived from what Postgres returns, so these tests are the
 * only thing standing between a rule and quietly awarding — or quietly
 * withholding — an achievement. Each one pins a boundary: the day a streak
 * breaks, the glass that finishes the goal, the week that is perfect.
 *
 * The catalogue itself comes from the `achievements` table; here it is built
 * from `BADGE_GOALS`, which is the half the database deliberately does not
 * hold — encoding "log seven days in a row" as data would mean an expression
 * language and an evaluator to read it.
 */

/** The rules as the panel receives them, minus the icons the table supplies. */
const RULES: AchievementRule[] = Object.entries(BADGE_GOALS).map(([key, { goal, unit }]) => ({
  id: key,
  labelKey: key as AchievementRule['labelKey'],
  icon: { set: 'system', name: 'trophy' } as AchievementRule['icon'],
  tone: 'pandan',
  unit,
  goal,
}))

const TARGETS: Targets = {
  kcal: 1600,
  carbs: 188,
  protein: 88,
  fat: 55,
  waterGlasses: 8,
  steps: 8000,
  isCustom: false,
}

/** One roti canai, as `food_log_details` would return it. */
const entry = (over: Partial<Entry> = {}): Entry => ({
  id: `e${Math.round(Math.random() * 1e9)}`,
  foodId: 'roti-canai',
  foodName: 'Roti canai',
  icon: { set: 'dishes', name: 'roti-canai' } as Entry['icon'],
  place: 'mamak',
  meal: 'breakfast',
  quantity: 1,
  servingId: 'piece',
  servingLabel: '1 piece',
  servingFactor: 1,
  logDate: '2026-03-02',
  loggedAt: '2026-03-02T09:30:00',
  source: 'search',
  macros: { kcal: 301, carbs: 39, protein: 6, fat: 13 },
  ...over,
})

/**
 * A day with `count` entries, at a time of day given in local hours.
 *
 * The timestamp deliberately carries no `Z`: "before 8am" is a fact about the
 * user's morning, and a UTC timestamp read in Kuala Lumpur is eight hours out.
 */
function day(date: string, count = 1, over: Partial<DayLog> = {}, hour = 9): DayLog {
  return {
    date,
    waterGlasses: 0,
    entries: Array.from({ length: count }, () =>
      entry({ logDate: date, loggedAt: `${date}T${String(hour).padStart(2, '0')}:30:00` }),
    ),
    ...over,
  }
}

function daysFrom(list: DayLog[]): Record<string, DayLog> {
  return Object.fromEntries(list.map((d) => [d.date, d]))
}

/** yyyy-MM-dd in local time. `toISOString` would shift the date east of UTC. */
const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

/** `count` consecutive days ending on 2026-03-10, all logged. */
function run(count: number): Record<string, DayLog> {
  const end = new Date('2026-03-10T00:00:00')
  return daysFrom(
    Array.from({ length: count }, (_, index) => {
      const date = new Date(end)
      date.setDate(date.getDate() - index)
      return day(key(date))
    }),
  )
}

const evaluate = (days: Record<string, DayLog>, todayKey = '2026-03-10', totalDistanceKm = 0) =>
  evaluateAchievements(RULES, { days, todayKey, targets: TARGETS, totalDistanceKm })

const badge = (days: Record<string, DayLog>, id: string, todayKey?: string) => {
  const found = evaluate(days, todayKey).find((item) => item.id === id)
  if (!found) throw new Error(`No badge ${id}`)
  return found
}

describe('currentStreak', () => {
  it('counts an unbroken run ending today', () => {
    expect(currentStreak(run(5), '2026-03-10')).toBe(5)
  })

  it('does not break the streak just because today is not logged yet', () => {
    // Logged through yesterday, nothing today. It is still morning.
    const days = run(4)
    delete days['2026-03-10']
    expect(currentStreak(days, '2026-03-10')).toBe(3)
  })

  it('stops at the first missed day', () => {
    const days = run(6)
    delete days['2026-03-07']
    expect(currentStreak(days, '2026-03-10')).toBe(3)
  })

  it('is zero when nothing has been logged', () => {
    expect(currentStreak({}, '2026-03-10')).toBe(0)
  })

  it('ignores a day that exists but is empty', () => {
    const days = { ...run(3), '2026-03-10': day('2026-03-10', 0) }
    expect(currentStreak(days, '2026-03-10')).toBe(2)
  })
})

describe('bestStreak', () => {
  it('finds the longest run, not the most recent', () => {
    const days = daysFrom([
      day('2026-01-01'),
      day('2026-01-02'),
      day('2026-01-03'),
      day('2026-01-04'),
      // gap
      day('2026-03-09'),
      day('2026-03-10'),
    ])
    expect(bestStreak(days)).toBe(4)
  })
})

describe('evaluateAchievements', () => {
  it('returns every badge, earned or not', () => {
    expect(evaluate({})).toHaveLength(RULES.length)
  })

  it('earns the seven-day badge on the seventh day, not the sixth', () => {
    expect(badge(run(6), 'sevenDays').earned).toBe(false)
    expect(badge(run(7), 'sevenDays').earned).toBe(true)
  })

  it('reports how far off a locked badge is', () => {
    const locked = badge(run(3), 'sevenDays')
    expect(locked).toMatchObject({ earned: false, value: 3, goal: 7 })
    expect(locked.progress).toBeCloseTo(3 / 7)
  })

  it('clamps progress at 1 once the goal is passed', () => {
    expect(badge(run(40), 'sevenDays').progress).toBe(1)
  })

  it('keeps a streak badge earned after the streak breaks', () => {
    // Seven days logged, then a week off. The badge was earned in the past and
    // stays earned — that is the difference between a badge and a counter.
    const days = run(7)
    expect(badge(days, 'sevenDays', '2026-03-20').earned).toBe(true)
    expect(badge(days, 'sevenDays', '2026-03-20').value).toBe(7)
  })

  it('earns the water badge from the best day, not from today', () => {
    const days = daysFrom([day('2026-03-09', 1, { waterGlasses: 8 }), day('2026-03-10')])
    expect(badge(days, 'eightGlasses').earned).toBe(true)
  })

  it('counts photos across every day', () => {
    const withPhoto = (date: string) =>
      day(date, 0, { entries: [entry({ photoPath: 'user/plate.jpg' }), entry()] })
    const days = daysFrom([withPhoto('2026-03-09'), withPhoto('2026-03-10')])
    const photos = badge(days, 'photoPro')
    expect(photos).toMatchObject({ value: 2, earned: false })
  })

  it('counts a morning as early only before eight', () => {
    const early = daysFrom([day('2026-03-10', 1, {}, 7)])
    const late = daysFrom([day('2026-03-10', 1, {}, 8)])
    expect(badge(early, 'earlyBird').value).toBe(1)
    expect(badge(late, 'earlyBird').value).toBe(0)
  })

  it('needs both days of a weekend', () => {
    // 2026-03-07 is a Saturday, 2026-03-08 the Sunday after it.
    const saturdayOnly = daysFrom([day('2026-03-07')])
    const both = daysFrom([day('2026-03-07'), day('2026-03-08')])
    expect(badge(saturdayOnly, 'weekend').earned).toBe(false)
    expect(badge(both, 'weekend').earned).toBe(true)
  })

  it('measures the marathon badge in kilometres run', () => {
    const marathon = evaluate({}, '2026-03-10', 42.4).find((item) => item.id === 'marathon')
    expect(marathon).toMatchObject({ value: 42, earned: true })
  })

  it('earns a perfect week only when seven days in a row stay within budget', () => {
    // Seven days, each one entry of roti canai (301 kcal) — well inside 1600.
    expect(badge(run(7), 'perfectWeek').earned).toBe(true)
    expect(badge(run(6), 'perfectWeek').earned).toBe(false)
  })

  it('does not count a week where one day went over', () => {
    const days = run(7)
    // Six roti canai is 1806 kcal, over the 1600 target.
    days['2026-03-08'] = day('2026-03-08', 6)
    expect(badge(days, 'perfectWeek').earned).toBe(false)
  })

  it('holds every rule to a positive goal', () => {
    // A goal of zero would make its badge earned for everybody on day one, and
    // the division in `progress` meaningless.
    for (const rule of RULES) expect(rule.goal).toBeGreaterThan(0)
  })

  it('agrees with the targets it is given', () => {
    // The protein rule reads the target rather than a constant, so a user on a
    // different budget is measured against their own number.
    const days = daysFrom([day('2026-03-10', 1)])
    const generous = evaluateAchievements(RULES, {
      days,
      todayKey: '2026-03-10',
      targets: { ...TARGETS, protein: 1 },
      totalDistanceKm: 0,
    }).find((item) => item.id === 'protein')
    expect(generous?.value).toBe(1)
  })

  it('withholds every target-based badge when there is no budget yet', () => {
    // A new account has no `daily_goals` row until onboarding computes one.
    // Measuring against a target that does not exist would earn "perfect week"
    // for a week nobody planned.
    const none = evaluateAchievements(RULES, {
      days: run(8),
      todayKey: '2026-03-10',
      targets: null,
      totalDistanceKm: 0,
    })
    expect(none.find((item) => item.id === 'perfectWeek')?.value).toBe(0)
    expect(none.find((item) => item.id === 'protein')?.value).toBe(0)
  })
})
