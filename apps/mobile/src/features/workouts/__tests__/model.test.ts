import type { ExerciseBests } from '@/data'
import { EXERCISES, MUSCLES } from '../catalogue'
import { estimateKcal, healthActivityType, totalDistanceM } from '../energy'
import {
  digitsToSeconds,
  distanceField,
  distanceText,
  parseDistance,
  parseWeight,
  secondsToDigits,
  shortClock,
  weightField,
} from '../format'
import {
  apply,
  completeAll,
  type ExercisePlan,
  estimatedOneRepMax,
  isLoggable,
  type LiveWorkout,
  lastActivityAt,
  liveTotals,
  newWorkout,
  setHints,
  showsVolume,
  timedSeconds,
  toPayload,
  unfinishedSets,
} from '../model'
import { recordSets } from '../records'
import { cleanSplit, groupSplit, planFor, searchExercises } from '../search'
import { TEMPLATES, templatePlans } from '../templates'
import { platesFor, warmupSets } from '../warmup'

const bench = {
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press (Barbell)',
  tracking: 'weight_reps' as const,
}

function workoutWith(...plans: ExercisePlan[][]): LiveWorkout {
  return newWorkout({ name: 'Push', startedAt: 1_000_000, exercises: plans.flat() })
}

describe('the workout document', () => {
  it('copies the set above when a set is added, because the next set is usually the same', () => {
    let workout = workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }] }])
    const key = workout.exercises[0].key
    workout = apply(workout, { type: 'addSet', key })
    expect(workout.exercises[0].sets[1]).toMatchObject({ weightKg: 60, reps: 8, done: false })
  })

  it('ticking an empty set takes the hint, but never overwrites what was typed', () => {
    let workout = workoutWith([{ ...bench, sets: [{ reps: 5 }] }])
    const { key, sets } = workout.exercises[0]
    workout = apply(workout, {
      type: 'completeSet',
      key,
      setId: sets[0].id,
      at: 5,
      fill: { weightKg: 60, reps: 8 },
    })
    expect(workout.exercises[0].sets[0]).toMatchObject({
      weightKg: 60,
      reps: 5,
      done: true,
      doneAt: 5,
    })
  })

  it('only saves ticked sets, and leaves out an exercise with none', () => {
    const workout = workoutWith(
      [
        {
          ...bench,
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 60, reps: 8 },
          ],
        },
      ],
      [{ exerciseId: 'plank', name: 'Plank', tracking: 'duration', sets: [{ durationS: 60 }] }],
    )
    const ticked = apply(workout, {
      type: 'completeSet',
      key: workout.exercises[0].key,
      setId: workout.exercises[0].sets[0].id,
      at: 2_000_000,
    })
    const payload = toPayload(ticked, 4_600_000, { kcal: null, healthWorkoutId: null })
    expect(payload.exercises).toHaveLength(1)
    expect(payload.exercises[0].sets).toHaveLength(1)
    expect(payload.started_at).toBe(new Date(1_000_000).toISOString())
  })

  it('stores pounds as kilograms and reads them back unchanged', () => {
    const kg = parseWeight('135', 'lb')
    // Already at the two places the database keeps, so today's 135 lb is
    // exactly last week's and not a record over it.
    expect(kg).toBe(61.23)
    expect(weightField(kg, 'lb')).toBe('135')
  })

  it('knows what makes a set a set', () => {
    expect(
      isLoggable({ weightKg: 60, reps: null, durationS: null, distanceM: null }, 'weight_reps'),
    ).toBe(false)
    expect(
      isLoggable({ weightKg: null, reps: 8, durationS: null, distanceM: null }, 'weighted_reps'),
    ).toBe(true)
    expect(
      isLoggable({ weightKg: null, reps: null, durationS: 30, distanceM: null }, 'duration'),
    ).toBe(true)
  })

  it('finds sets that were typed but not ticked, and ticks them on request', () => {
    // The empty set under a filled one offers its numbers, so it counts too.
    const workout = workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }, {}] }])
    expect(unfinishedSets(workout)).toBe(2)
    const done = completeAll(workout, 9)
    expect(done.exercises[0].sets.map((set) => set.done)).toEqual([true, true])
    expect(lastActivityAt(done)).toBe(9)
  })

  it('sums volume over ticked sets only', () => {
    const workout = completeAll(
      workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }, { kind: 'warmup' }] }]),
      1,
    )
    // The warm-up under a working set offers nothing, so it stays unticked.
    expect(liveTotals(workout)).toEqual({ volumeKg: 480, sets: 2, done: 1 })
  })

  it('ends a rest that is shortened past now', () => {
    let workout = workoutWith([{ ...bench, sets: [{}] }])
    workout = apply(workout, {
      type: 'startRest',
      exerciseKey: workout.exercises[0].key,
      totalS: 30,
      at: 0,
    })
    expect(workout.rest?.endsAt).toBe(30_000)
    workout = apply(workout, { type: 'adjustRest', byS: -15, at: 20_000 })
    expect(workout.rest).toBeNull()
  })

  it('links two exercises into one superset and unlinks them', () => {
    let workout = workoutWith([{ ...bench, sets: [{}] }], [{ ...bench, sets: [{}] }])
    const [a, b] = workout.exercises
    workout = apply(workout, { type: 'superset', key: a.key, withKey: b.key })
    expect(workout.exercises.map((exercise) => exercise.superset)).toEqual([0, 0])
    // Unlinking one leaves the other alone, which is no superset at all.
    workout = apply(workout, { type: 'superset', key: a.key, withKey: null })
    expect(workout.exercises.map((exercise) => exercise.superset)).toEqual([null, null])
  })

  it('dissolves a superset when its partner is removed', () => {
    let workout = workoutWith(
      [{ ...bench, sets: [{}] }],
      [{ ...bench, sets: [{}] }],
      [{ ...bench, sets: [{}] }],
    )
    const [a, b, c] = workout.exercises
    workout = apply(workout, { type: 'superset', key: a.key, withKey: b.key })
    workout = apply(workout, { type: 'superset', key: b.key, withKey: c.key })
    expect(workout.exercises.map((exercise) => exercise.superset)).toEqual([0, 0, 0])
    workout = apply(workout, { type: 'removeExercise', key: c.key })
    workout = apply(workout, { type: 'removeExercise', key: b.key })
    expect(workout.exercises.map((exercise) => exercise.superset)).toEqual([null])
  })

  it('never saves a value its column would refuse', () => {
    const workout = completeAll(
      workoutWith([{ ...bench, sets: [{ weightKg: 1020, reps: 1500 }] }]),
      1_000_000,
    )
    const [set] = toPayload(workout, 2_000_000, { kcal: 12000, healthWorkoutId: null }).exercises[0]
      .sets
    expect(set).toMatchObject({ weight_kg: 1000, reps: 1000 })
  })
})

describe('finishing with sets not ticked', () => {
  const workout = () => {
    let w = newWorkout({ name: 'W' })
    w = apply(w, {
      type: 'addExercises',
      plans: [
        {
          exerciseId: 'bench',
          name: 'Bench',
          tracking: 'weight_reps',
          sets: [{ weightKg: 100, reps: 5 }, {}, {}],
        },
      ],
    })
    return w
  }

  it('counts a set that only shows what it offers', () => {
    const w = workout()
    expect(unfinishedSets(w)).toBe(3)
    expect(unfinishedSets(w, {})).toBe(3)
    // With nothing above or from last time, an empty set offers nothing.
    const bare = apply(newWorkout({ name: 'W' }), {
      type: 'addExercises',
      plans: [{ exerciseId: 'bench', name: 'Bench', tracking: 'weight_reps', sets: [{}] }],
    })
    expect(unfinishedSets(bare)).toBe(0)
    expect(unfinishedSets(bare, { bench: [{ weightKg: 60, reps: 8 }] })).toBe(1)
  })

  it('ticks them with what they offer', () => {
    const done = completeAll(workout(), 1000)
    expect(done.exercises[0].sets.map((set) => [set.weightKg, set.reps, set.done])).toEqual([
      [100, 5, true],
      [100, 5, true],
      [100, 5, true],
    ])
  })
})

describe('reordering exercises', () => {
  it('takes the order of keys, and keeps anything it does not name at the end', () => {
    let workout = newWorkout({ name: 'W' })
    workout = apply(workout, {
      type: 'addExercises',
      plans: ['a', 'b', 'c'].map((id) => ({
        exerciseId: id,
        name: id,
        tracking: 'reps',
        sets: [],
      })),
    })
    const [a, , c] = workout.exercises
    const moved = apply(workout, { type: 'reorderExercises', keys: [c.key, a.key] })
    expect(moved.exercises.map((exercise) => exercise.exerciseId)).toEqual(['c', 'a', 'b'])
  })
})

describe('what an empty set offers', () => {
  const set = (kind: 'normal' | 'warmup', weightKg: number | null, reps: number | null) => ({
    kind,
    weightKg,
    reps,
    durationS: null,
    distanceM: null,
  })

  it('hands a typed figure down its column, over last time', () => {
    const hints = setHints(
      [set('normal', 105, null), set('normal', null, null), set('normal', null, 6)],
      [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ],
    )
    expect(hints.map((hint) => [hint.weightKg, hint.reps])).toEqual([
      [100, 5],
      [105, 5],
      [105, 5],
    ])
  })

  it("prefers a set's own last time to what the row above only shows", () => {
    const hints = setHints(
      [set('normal', null, null), set('normal', null, null), set('normal', null, null)],
      [
        { weightKg: 100, reps: 10 },
        { weightKg: 100, reps: 5 },
      ],
    )
    expect(hints.map((hint) => hint.reps)).toEqual([10, 5, 5])
  })

  it('does not hand down a figure that only repeats last time', () => {
    const hints = setHints(
      [set('normal', 100, 10), set('normal', null, null)],
      [
        { weightKg: 100, reps: 10 },
        { weightKg: 100, reps: 5 },
      ],
    )
    expect(hints[1].reps).toBe(5)
  })

  it('keeps warm-ups to themselves', () => {
    const hints = setHints([set('warmup', 40, 10), set('normal', null, null)], [])
    expect(hints[1]).toEqual({ weightKg: null, reps: null, durationS: null, distanceM: null })
  })

  it('falls back to last time, and hands down what a row shows', () => {
    const hints = setHints(
      [set('normal', null, null), set('normal', null, null)],
      [{ weightKg: 60, reps: 8 }],
    )
    expect(hints[0].weightKg).toBe(60)
    expect(hints[1].weightKg).toBe(60)
    expect(setHints([set('normal', null, null)], [])[0].weightKg).toBeNull()
  })
})

describe('records while training', () => {
  const bests = {
    bestWeightKg: 60,
    bestE1rmKg: 70,
    bestSetVolumeKg: 480,
    bestReps: null,
    bestDurationS: null,
  } as ExerciseBests

  it('marks the heaviest set past the old best, once', () => {
    const workout = completeAll(
      workoutWith([
        {
          ...bench,
          sets: [
            { weightKg: 62.5, reps: 3 },
            { weightKg: 65, reps: 2 },
          ],
        },
      ]),
      1,
    )
    const records = recordSets(workout.exercises[0], bests)
    const heaviest = workout.exercises[0].sets[1].id
    expect(records.get(heaviest)).toContain('weight')
    expect([...records.values()].flat().filter((kind) => kind === 'weight')).toHaveLength(1)
  })

  it('awards nothing on an exercise never done before', () => {
    const workout = completeAll(workoutWith([{ ...bench, sets: [{ weightKg: 100, reps: 5 }] }]), 1)
    expect(recordSets(workout.exercises[0], undefined).size).toBe(0)
  })

  it('never counts a missed rep as the heaviest weight', () => {
    const workout = completeAll(workoutWith([{ ...bench, sets: [{ weightKg: 150, reps: 0 }] }]), 1)
    expect(
      recordSets(workout.exercises[0], bests).get(workout.exercises[0].sets[0].id),
    ).toBeUndefined()
  })

  it('never counts a warm-up', () => {
    const workout = completeAll(
      workoutWith([{ ...bench, sets: [{ kind: 'warmup', weightKg: 100, reps: 1 }] }]),
      1,
    )
    expect(recordSets(workout.exercises[0], bests).size).toBe(0)
  })

  it('estimates a one-rep max the way the database does', () => {
    expect(estimatedOneRepMax(62.5, 5)).toBe(72.9)
    expect(estimatedOneRepMax(100, 1)).toBe(100)
    expect(estimatedOneRepMax(100, 20)).toBeNull()
  })
})

describe('energy and Apple Health', () => {
  it('prices a sport by its own time and MET, minus resting', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'badminton',
          name: 'Badminton',
          tracking: 'duration',
          sets: [{ durationS: 3600 }],
        },
      ]),
      1,
    )
    // (5.5 - 1) x 70 kg x 1 h
    expect(estimateKcal(workout, 3600, 70)).toBe(315)
    expect(healthActivityType(workout)).toBe(4)
  })

  it('prices a sport by no more time than the workout lasted', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'badminton',
          name: 'Badminton',
          tracking: 'duration',
          sets: [{ durationS: 3600 }],
        },
      ]),
      1,
    )
    // An hour typed into a workout that lasted a minute is priced as a minute.
    expect(estimateKcal(workout, 60, 70)).toBe(5)
  })

  it('refuses to guess without a body weight', () => {
    const workout = completeAll(workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }] }]), 1)
    expect(estimateKcal(workout, 3600, undefined)).toBeNull()
  })

  it('calls lifting strength training', () => {
    const workout = completeAll(workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }] }]), 1)
    expect(healthActivityType(workout)).toBe(50)
  })

  it('totals the distance of distance sets', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'running',
          name: 'Running',
          tracking: 'distance_duration',
          sets: [{ distanceM: 5000, durationS: 1800 }],
        },
      ]),
      1,
    )
    expect(totalDistanceM(workout)).toBe(5000)
  })
})

describe('the library', () => {
  const all = EXERCISES.map((exercise) => ({ ...exercise, custom: false }))

  it('finds by alias and puts the name match first', () => {
    expect(searchExercises(all, 'db row')[0]?.id).toBe('dumbbell-row')
    expect(searchExercises(all, 'bench')[0]?.id).toBe('barbell-bench-press')
  })

  it('narrows by body part, equipment and muscle', () => {
    const found = searchExercises(all, '', {
      category: 'legs',
      equipment: 'machine',
      muscle: 'hamstrings',
    })
    expect(found.length).toBeGreaterThan(0)
    expect(
      found.every((exercise) => exercise.category === 'legs' && exercise.equipment === 'machine'),
    ).toBe(true)
  })

  it("spreads sets across muscle groups by each exercise's split", () => {
    const byId = (id: string) => all.find((exercise) => exercise.id === id)
    const split = groupSplit([{ exerciseId: 'barbell-bench-press', sets: 10 }], byId)
    expect(split[0]).toEqual({ group: 'chest', sets: 6 })
  })

  it('cleans a custom split to known muscles that add up to one', () => {
    expect(cleanSplit({ chest: 2, wings: 5, triceps: 2 })).toEqual({ chest: 0.5, triceps: 0.5 })
  })
})

describe('what adding an exercise starts with', () => {
  const byId = (id: string) => {
    const found = EXERCISES.find((exercise) => exercise.id === id)
    if (!found) throw new Error(id)
    return { ...found, custom: false }
  }

  it('gives lifting three sets and the default rest', () => {
    expect(planFor(byId('barbell-bench-press'))).toMatchObject({ restS: null, sets: [{}, {}, {}] })
  })

  it('gives a sport one timed set and no rest timer', () => {
    expect(planFor(byId('badminton'))).toMatchObject({ restS: 0, sets: [{}] })
  })

  it('counts the time a sport set logs, ticked sets only', () => {
    const workout = workoutWith([
      {
        exerciseId: 'badminton',
        name: 'Badminton',
        tracking: 'duration',
        sets: [{ durationS: 3600 }, { durationS: 600 }],
      },
    ])
    const ticked = apply(workout, {
      type: 'completeSet',
      key: workout.exercises[0].key,
      setId: workout.exercises[0].sets[0].id,
      at: 1,
    })
    expect(timedSeconds(ticked)).toBe(3600)
  })

  it('shows volume only where something is lifted', () => {
    expect(showsVolume([])).toBe(true)
    expect(showsVolume(['duration', 'distance_duration'])).toBe(false)
    expect(showsVolume(['duration', 'weight_reps'])).toBe(true)
  })

  it("reads a carry in metres and a run in the user's unit", () => {
    expect(distanceText(40, 'km', 'weight_distance')).toBe('40 m')
    expect(distanceText(5200, 'km', 'distance_duration')).toBe('5.2 km')
  })
})

describe('the catalogue', () => {
  it('has unique ids and splits that add up to one', () => {
    const ids = EXERCISES.map((exercise) => exercise.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const exercise of EXERCISES) {
      const total = Object.values(exercise.muscles).reduce((sum, share) => sum + (share ?? 0), 0)
      expect([exercise.id, Math.round(total * 1000) / 1000]).toEqual([exercise.id, 1])
      for (const muscle of Object.keys(exercise.muscles)) expect(MUSCLES).toContain(muscle)
    }
  })

  it('has a template plan for every exercise each template names', () => {
    for (const template of TEMPLATES) {
      expect([template.id, templatePlans(template).length]).toEqual([
        template.id,
        template.exercises.length,
      ])
    }
  })
})

describe('numbers', () => {
  it('reads a typed duration the way a microwave does', () => {
    expect(digitsToSeconds('130')).toBe(90)
    expect(digitsToSeconds('4500')).toBe(2700)
    expect(secondsToDigits(90)).toBe('130')
    expect(shortClock(90)).toBe('1:30')
  })

  it('converts distances both ways', () => {
    expect(parseDistance('5', 'km')).toBe(5000)
    expect(distanceField(1609.344, 'mi')).toBe('1')
  })

  it('builds warm-ups up to the first working weight, in loadable steps', () => {
    const workout = workoutWith([{ ...bench, sets: [{ weightKg: 100, reps: 5 }] }])
    expect(warmupSets(workout.exercises[0], 'kg').map((set) => set.weightKg)).toEqual([40, 60, 80])
  })

  it('loads a bar from the heaviest plate down', () => {
    expect(platesFor(100, 20, 'kg')).toEqual([25, 15])
    expect(platesFor(20, 20, 'kg')).toEqual([])
    expect(platesFor(101, 20, 'kg')).toBeNull()
  })
})

describe('what ships with the catalogue', () => {
  it('names and describes every template in the copy', () => {
    const { workouts } = require('@/i18n/en/workouts') as typeof import('@/i18n/en/workouts')
    for (const template of TEMPLATES) {
      expect(workouts.template).toHaveProperty([template.id, 'name'])
      expect(workouts.template).toHaveProperty([template.id, 'description'])
    }
  })

  it('has a drawing for every exercise', () => {
    // Read as text, because the map itself is a list of image requires.
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { resolve } = require('node:path') as typeof import('node:path')
    const registry = readFileSync(resolve(__dirname, '../exerciseArt.generated.ts'), 'utf8')
    const missing = EXERCISES.filter(
      (exercise) =>
        !registry.includes(`'${exercise.id}':`) && !registry.includes(`  ${exercise.id}:`),
    )
    expect(missing.map((exercise) => exercise.id)).toEqual([])
  })
})
