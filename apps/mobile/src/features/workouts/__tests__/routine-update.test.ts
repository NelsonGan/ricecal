import type { RoutineExercise } from '@/data'
import { apply, type LiveWorkout, newWorkout } from '../model'
import { routinePlans } from '../routines'
import { routineChanges, updatedRoutine } from '../routineUpdate'

const bench: RoutineExercise = {
  exercise_id: 'barbell-bench-press',
  exercise_name: 'Bench Press (Barbell)',
  tracking: 'weight_reps',
  rest_s: 90,
  superset: null,
  notes: 'Pause on the chest',
  sets: [
    { kind: 'warmup', weight_kg: 20, reps: 10 },
    { kind: 'normal', weight_kg: 60, reps: 8 },
    { kind: 'normal', weight_kg: 60, reps: 8 },
  ],
}

// Blank on purpose: "whatever I did last time".
const row: RoutineExercise = {
  exercise_id: 'seated-cable-row',
  exercise_name: 'Seated Row (Cable)',
  tracking: 'weight_reps',
  rest_s: null,
  superset: null,
  notes: null,
  sets: [{ kind: 'normal' }, { kind: 'normal' }],
}

const routine = [bench, row]

const start = (exercises = routine): LiveWorkout =>
  newWorkout({ name: 'Push', routineId: 'r1', exercises: routinePlans({ exercises }) })

/** Ticks every set, filling blanks the way the logger does from last time. */
function finishAll(workout: LiveWorkout, fill = { weightKg: 50, reps: 10 }): LiveWorkout {
  let next = workout
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      next = apply(next, { type: 'completeSet', key: exercise.key, setId: set.id, at: 1, fill })
    }
  }
  return next
}

describe('routineChanges', () => {
  it('sees nothing in a workout done as planned', () => {
    expect(routineChanges(routine, finishAll(start()))).toEqual({
      layout: false,
      values: false,
      removes: false,
    })
  })

  it('does not count filling a blank routine field as a change', () => {
    // The row has no numbers, so 50 x 10 there is just today's.
    const changes = routineChanges(routine, finishAll(start(), { weightKg: 50, reps: 10 }))
    expect(changes.values).toBe(false)
  })

  it('counts a different number where the routine holds one', () => {
    let workout = start()
    const key = workout.exercises[0].key
    const setId = workout.exercises[0].sets[1].id
    workout = apply(workout, { type: 'updateSet', key, setId, patch: { weightKg: 62.5 } })
    workout = finishAll(workout)
    expect(routineChanges(routine, workout)).toEqual({
      layout: false,
      values: true,
      removes: false,
    })
  })

  it('ignores numbers on sets that were never finished', () => {
    let workout = start()
    const key = workout.exercises[0].key
    const setId = workout.exercises[0].sets[1].id
    workout = apply(workout, { type: 'updateSet', key, setId, patch: { weightKg: 70 } })
    expect(routineChanges(routine, workout).values).toBe(false)
  })

  it('treats an added set as a layout change that removes nothing', () => {
    let workout = start()
    workout = apply(workout, { type: 'addSet', key: workout.exercises[1].key })
    expect(routineChanges(routine, workout)).toEqual({
      layout: true,
      values: false,
      removes: false,
    })
  })

  it('treats a deleted set or exercise as a change that removes something', () => {
    let workout = start()
    const bench = workout.exercises[0]
    workout = apply(workout, { type: 'removeSet', key: bench.key, setId: bench.sets[2].id })
    expect(routineChanges(routine, workout)).toMatchObject({ layout: true, removes: true })

    const fresh = start()
    const without = apply(fresh, { type: 'removeExercise', key: fresh.exercises[1].key })
    expect(routineChanges(routine, without)).toMatchObject({ layout: true, removes: true })
  })

  it('does not treat skipping the last set as removing it', () => {
    let workout = start()
    const bench = workout.exercises[0]
    for (const set of bench.sets.slice(0, 2)) {
      workout = apply(workout, { type: 'completeSet', key: bench.key, setId: set.id, at: 1 })
    }
    expect(routineChanges(routine, workout).layout).toBe(false)
  })

  it('sees a reorder, a rest and a superset as layout changes', () => {
    const workout = start()
    const [first, second] = workout.exercises
    expect(
      routineChanges(
        routine,
        apply(workout, { type: 'reorderExercises', keys: [second.key, first.key] }),
      ).layout,
    ).toBe(true)
    expect(
      routineChanges(routine, apply(workout, { type: 'exerciseRest', key: first.key, restS: 120 }))
        .layout,
    ).toBe(true)
    expect(
      routineChanges(
        routine,
        apply(workout, { type: 'superset', key: first.key, withKey: second.key }),
      ).layout,
    ).toBe(true)
  })

  it('ignores notes typed during the workout', () => {
    const workout = start()
    const changed = apply(workout, {
      type: 'exerciseNotes',
      key: workout.exercises[0].key,
      notes: 'Shoulder felt off',
    })
    expect(routineChanges(routine, changed).layout).toBe(false)
  })
})

describe('updatedRoutine', () => {
  it('keeps the routine numbers on a layout update and leaves new sets blank', () => {
    let workout = start()
    workout = apply(workout, { type: 'addSet', key: workout.exercises[0].key })
    workout = finishAll(workout, { weightKg: 65, reps: 6 })
    const next = updatedRoutine(routine, workout, 'layout')
    expect(next[0].sets).toHaveLength(4)
    expect(next[0].sets[1]).toMatchObject({ weight_kg: 60, reps: 8 })
    expect(next[0].sets[3]).toMatchObject({ weight_kg: null, reps: null })
    // The blank routine stays blank.
    expect(next[1].sets.every((set) => set.weight_kg === null && set.reps === null)).toBe(true)
    expect(next[0].notes).toBe('Pause on the chest')
  })

  it('writes every number on a layout and values update', () => {
    let workout = start()
    const key = workout.exercises[0].key
    workout = apply(workout, {
      type: 'updateSet',
      key,
      setId: workout.exercises[0].sets[1].id,
      patch: { weightKg: 62.5 },
    })
    workout = finishAll(workout)
    const next = updatedRoutine(routine, workout, 'layoutAndValues')
    expect(next[0].sets[1]).toMatchObject({ weight_kg: 62.5, reps: 8 })
    expect(next[1].sets[0]).toMatchObject({ weight_kg: 50, reps: 10 })
  })

  it('updates only the numbers the routine holds on a values update', () => {
    let workout = start()
    const key = workout.exercises[0].key
    workout = apply(workout, {
      type: 'updateSet',
      key,
      setId: workout.exercises[0].sets[1].id,
      patch: { weightKg: 62.5 },
    })
    workout = apply(workout, { type: 'addSet', key })
    workout = finishAll(workout)
    const next = updatedRoutine(routine, workout, 'values')
    // The added set is not added: the layout stays.
    expect(next[0].sets).toHaveLength(3)
    expect(next[0].sets[1]).toMatchObject({ weight_kg: 62.5, reps: 8 })
    // Nor is a blank field filled.
    expect(next[1].sets[0].weight_kg ?? null).toBeNull()
    // And the routine passed in is untouched.
    expect(bench.sets[1].weight_kg).toBe(60)
  })

  it('pairs sets by kind, so warm-ups added at the start shift nothing', () => {
    const working: RoutineExercise = {
      ...bench,
      sets: [
        { kind: 'normal', weight_kg: 100, reps: 5 },
        { kind: 'normal', weight_kg: 100, reps: 5 },
      ],
    }
    let workout = start([working])
    const key = workout.exercises[0].key
    workout = apply(workout, {
      type: 'addSets',
      key,
      atStart: true,
      sets: [{ kind: 'warmup', weightKg: 40, reps: 10 }],
    })
    workout = finishAll(workout)
    const changes = routineChanges([working], workout)
    // A warm-up was added (a layout change); the working sets are as planned.
    expect(changes).toEqual({ layout: true, values: false, removes: false })
    const next = updatedRoutine([working], workout, 'layout')
    expect(next[0].sets.map((set) => [set.kind, set.weight_kg, set.reps])).toEqual([
      ['warmup', null, null],
      ['normal', 100, 5],
      ['normal', 100, 5],
    ])
  })

  it("keeps the routine's own notes on an update", () => {
    let workout = start()
    workout = apply(workout, {
      type: 'exerciseNotes',
      key: workout.exercises[0].key,
      notes: 'Shoulder felt off',
    })
    workout = apply(workout, { type: 'addSet', key: workout.exercises[1].key })
    const next = updatedRoutine(routine, finishAll(workout), 'layout')
    expect(next[0].notes).toBe('Pause on the chest')
  })

  it('pairs a repeated exercise by its order', () => {
    const twice = [
      bench,
      { ...bench, sets: [{ kind: 'normal' as const, weight_kg: 40, reps: 12 }] },
    ]
    const workout = finishAll(start(twice))
    expect(routineChanges(twice, workout)).toEqual({ layout: false, values: false, removes: false })
    const next = updatedRoutine(twice, workout, 'layout')
    expect(next[1].sets).toEqual([
      { kind: 'normal', weight_kg: 40, reps: 12, duration_s: null, distance_m: null },
    ])
  })
})
