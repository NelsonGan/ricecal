import type { Targets, WeighIn } from '@/data'
import { buildWidgetSnapshot, type SnapshotInput } from '../snapshot'

/**
 * What the home screen is told.
 *
 * Worth testing at this size because a widget cannot be checked by looking at
 * it: it is drawn by another process, minutes or hours after this ran, and
 * every mistake here shows up as a plausible number rather than as an error.
 * The cases below are the ones where "plausible" and "correct" come apart.
 */

const TARGETS: Targets = {
  kcal: 2100,
  carbs: 246,
  protein: 118,
  fat: 70,
  waterMl: 2000,
  isCustom: false,
}

const BASE: SnapshotInput = {
  date: '2026-08-20',
  theme: 'system',
  targets: TARGETS,
  eaten: { kcal: 1847, carbs: 182, protein: 61, fat: 44 },
  burned: 0,
  waterMl: 1250,
  waterGoalMl: 2000,
  entries: [{ name: 'Nasi lemak ayam', kcal: 640 }],
  weighIns: [],
  unit: 'kg',
  now: 1_755_000_000_000,
}

const build = (patch: Partial<SnapshotInput> = {}) => buildWidgetSnapshot({ ...BASE, ...patch })

describe('the calorie figures', () => {
  it('counts movement into the budget, the way the ring does', () => {
    // The invariant the log sheet's header exists to keep: a day with a walk on
    // it must not have two figures for one number. A widget is the surface
    // where that disagreement would last longest, because it is not on screen
    // beside the ring it disagrees with.
    const snapshot = build({ burned: 300 })

    expect(snapshot.kcal.budget).toBe('2,400')
    expect(snapshot.kcal.left).toBe('553')
  })

  it('reports going over as a full bar and a flag, not as a negative', () => {
    const snapshot = build({ eaten: { kcal: 2248, carbs: 246, protein: 118, fat: 70 } })

    expect(snapshot.kcal.over).toBe(true)
    // The absolute value: the widget writes "KCAL OVER" beside it, and a minus
    // sign there would say the same thing twice at 36pt.
    expect(snapshot.kcal.left).toBe('148')
    expect(snapshot.kcal.fraction).toBe(1)
  })

  it('says there is no budget rather than inventing one', () => {
    // A fresh account before onboarding computes a target. Drawn against zero
    // this would be a ring reporting 0 kcal left on a day nobody has eaten on.
    const snapshot = build({ targets: null })

    expect(snapshot.hasBudget).toBe(false)
    expect(snapshot.kcal.fraction).toBe(0)
  })
})

describe('the meal list', () => {
  it('keeps the newest four, which is what the large widget holds', () => {
    const entries = [
      { name: 'Roti canai', kcal: 300 },
      { name: 'Nasi lemak ayam', kcal: 640 },
      { name: 'Teh tarik', kcal: 135 },
      { name: 'Char kuey teow', kcal: 742 },
      { name: 'Kopi O kosong', kcal: 22 },
    ]

    const snapshot = build({ entries })

    // The oldest goes, not the newest. A widget showing breakfast at nine in
    // the evening is a widget nobody looks at twice.
    expect(snapshot.entries.map((entry) => entry.name)).toEqual([
      'Nasi lemak ayam',
      'Teh tarik',
      'Char kuey teow',
      'Kopi O kosong',
    ])
  })
})

describe('the water figures', () => {
  it('carries the raw millilitres, because the widget adds to them itself', () => {
    // The one number the native side reads rather than prints: the +250 button
    // runs in a process with no app behind it and has to move the figure.
    const snapshot = build()

    expect(snapshot.water.ml).toBe(1250)
    expect(snapshot.water.goalMl).toBe(2000)
    expect(snapshot.water.label).toBe('1,250')
    expect(snapshot.water.fraction).toBeCloseTo(0.625)
  })

  it('never draws past full', () => {
    expect(build({ waterMl: 3000 }).water.fraction).toBe(1)
  })
})

describe('the weight widget', () => {
  const weighIn = (daysBack: number, kg: number): WeighIn => {
    const date = new Date(Date.UTC(2026, 7, 20) - daysBack * 86_400_000)
    return { date: date.toISOString().slice(0, 10), kg }
  }

  it('is absent on an account nobody has ever weighed', () => {
    // Not a chart of zeros. There is nothing to draw and the widget says so.
    expect(build({ weighIns: [] }).weight).toBeNull()
  })

  it('averages the week rather than reporting the newest reading', () => {
    // Three mornings in the current week, one of them two kilos out. Reported
    // as the newest number this would be a home screen tile announcing a two
    // kilo gain overnight, which is water.
    const snapshot = build({
      weighIns: [weighIn(2, 68.0), weighIn(1, 70.0), weighIn(0, 68.2)],
    })

    expect(snapshot.weight?.value).toBe('68.7')
  })

  it('scales the bars against each other rather than against zero', () => {
    // Seventy kilograms drawn from zero is eight bars of the same height. The
    // window is what matters, so the lightest week is empty and the heaviest
    // is full.
    const snapshot = build({
      weighIns: [weighIn(21, 70), weighIn(14, 69), weighIn(7, 68), weighIn(0, 67)],
    })

    expect(snapshot.weight?.weeks).toEqual([1, 2 / 3, 1 / 3, 0])
  })

  it('draws a window that has not moved as flat rather than dividing by nothing', () => {
    const snapshot = build({ weighIns: [weighIn(7, 68), weighIn(0, 68)] })

    expect(snapshot.weight?.weeks).toEqual([0.5, 0.5])
    // And says nothing in the pill, rather than "0.0 kg".
    expect(snapshot.weight?.change).toBe('')
  })

  it('carries a missing week forward rather than leaving a gap', () => {
    // A bar chart cannot draw a gap, and dropping the week would space the bars
    // unevenly in time — which misstates the shape of the trend, which is the
    // only thing this chart is for.
    const snapshot = build({ weighIns: [weighIn(21, 70), weighIn(0, 68)] })

    expect(snapshot.weight?.weeks).toHaveLength(4)
    expect(snapshot.weight?.weeks.slice(0, 3)).toEqual([1, 1, 1])
  })

  it('ignores readings older than the window it draws', () => {
    const snapshot = build({ weighIns: [weighIn(200, 90), weighIn(0, 68)] })

    expect(snapshot.weight?.weeks).toHaveLength(1)
    expect(snapshot.weight?.value).toBe('68.0')
  })

  it('reports the change in the unit the account reads in', () => {
    const snapshot = build({
      unit: 'lb',
      weighIns: [weighIn(21, 70), weighIn(0, 68)],
    })

    expect(snapshot.weight?.unit).toBe('lb')
    expect(snapshot.weight?.value).toBe('149.9')
    // A real minus sign, from `showChange`: at display sizes a hyphen beside
    // Baloo 2's numerals reads as a dash between two figures.
    expect(snapshot.weight?.change).toBe('−4.4 lb')
  })
})
