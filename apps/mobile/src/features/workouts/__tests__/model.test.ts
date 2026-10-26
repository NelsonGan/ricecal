import type { ExerciseBests } from '@/data'
import { EXERCISES, MUSCLES } from '../catalogue'
import { estimateKcal, healthActivityType, totalDistanceM } from '../energy'
import { walkOrder } from '../fieldOrder'
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
  matchPrevious,
  newWorkout,
  restAfter,
  setHints,
  setLoad,
  setVolume,
  showsVolume,
  timedSeconds,
  toPayload,
  unfinishedSets,
} from '../model'
import { recordSets } from '../records'
import { cleanSplit, groupSplit, planFor, searchExercises } from '../search'
import { TEMPLATES, templatePlans } from '../templates'
import { warmupSets } from '../warmup'

const bench = {
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press (Barbell)',
  tracking: 'weight_reps' as const,
}

function workoutWith(...plans: ExercisePlan[][]): LiveWorkout {
  return newWorkout({ name: 'Push', startedAt: 1_000_000, exercises: plans.flat() })
}

describe("pairing today's sets with last time's", () => {
  it('matches drop sets with drop sets, not the working set they follow', () => {
    const last = [
      { kind: 'normal' as const, weightKg: 100, reps: 5 },
      { kind: 'normal' as const, weightKg: 100, reps: 5 },
      { kind: 'drop' as const, weightKg: 70, reps: 10 },
    ]
    const today = [{ kind: 'normal' as const }, { kind: 'drop' as const }]
    expect(matchPrevious(today, last)).toEqual([last[0], last[2]])
  })

  it('drops RPE when an exercise is replaced by one that has no reps', () => {
    let workout = workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }] }])
    const { key } = workout.exercises[0]
    const setId = workout.exercises[0].sets[0].id
    workout = apply(workout, { type: 'updateSet', key, setId, patch: { rpe: 8 } })
    workout = apply(workout, {
      type: 'replaceExercise',
      key,
      plan: { exerciseId: 'plank', name: 'Plank', tracking: 'duration', sets: [] },
    })
    expect(workout.exercises[0].sets[0].rpe).toBeNull()
  })
})

describe('the workout document', () => {
  it('adds an empty set, which offers the row above unless last time had one there', () => {
    let workout = workoutWith([
      {
        ...bench,
        sets: [
          { weightKg: 60, reps: 8 },
          { weightKg: 60, reps: 8 },
        ],
      },
    ])
    const key = workout.exercises[0].key
    workout = apply(workout, { type: 'addSet', key })
    const sets = workout.exercises[0].sets
    expect(sets[2]).toMatchObject({ weightKg: null, reps: null, done: false })
    expect(setHints(sets, [])[2]).toMatchObject({ weightKg: 60, reps: 8 })
    const lastTime = [
      { weightKg: 60, reps: 8 },
      { weightKg: 60, reps: 8 },
      { weightKg: 60, reps: 5 },
    ]
    expect(setHints(sets, lastTime)[2].reps).toBe(5)
  })

  it('keeps only what a replacement records, and unticks a set it cannot hold', () => {
    let workout = completeAll(workoutWith([{ ...bench, sets: [{ weightKg: 60, reps: 8 }] }]), 1)
    const key = workout.exercises[0].key
    workout = apply(workout, {
      type: 'replaceExercise',
      key,
      plan: { exerciseId: 'plank', name: 'Plank', tracking: 'duration', sets: [] },
    })
    expect(workout.exercises[0].sets[0]).toMatchObject({
      weightKg: null,
      reps: null,
      done: false,
    })
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

  it('keeps a superset to neighbouring cards, whatever moves', () => {
    let workout = workoutWith(
      [{ ...bench, sets: [{}] }],
      [{ ...bench, sets: [{}] }],
      [{ ...bench, sets: [{}] }],
    )
    const [a, b, c] = workout.exercises
    workout = apply(workout, { type: 'superset', key: a.key, withKey: b.key })
    // A, C, B: the pair is split, so neither half is a superset any more.
    workout = apply(workout, { type: 'reorderExercises', keys: [a.key, c.key, b.key] })
    expect(workout.exercises.map((exercise) => exercise.superset)).toEqual([null, null, null])
  })

  it('rests after the last set of a round, rounds of unequal length included', () => {
    let workout = workoutWith([{ ...bench, sets: [{}, {}, {}] }], [{ ...bench, sets: [{}, {}] }])
    const [a, b] = workout.exercises
    workout = apply(workout, { type: 'superset', key: a.key, withKey: b.key })
    const [first, second] = workout.exercises
    expect(restAfter(workout, first, 90, first.sets[0].id)).toBe(0)
    expect(restAfter(workout, second, 90, second.sets[0].id)).toBe(90)
    // B has no third set, so A's third ends its round.
    expect(restAfter(workout, first, 90, first.sets[2].id)).toBe(90)
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

  it('pairs last time by kind, not by position', () => {
    const lastTime = [
      { kind: 'warmup' as const, weightKg: 40, reps: 10 },
      { kind: 'warmup' as const, weightKg: 60, reps: 5 },
      { kind: 'normal' as const, weightKg: 100, reps: 5 },
      { kind: 'normal' as const, weightKg: 100, reps: 5 },
    ]
    // No warm-ups today: the working sets still get last time's working sets.
    const plain = setHints([set('normal', null, null), set('normal', null, null)], lastTime)
    expect(plain.map((hint) => hint.weightKg)).toEqual([100, 100])
    // Warm-ups added today get last time's warm-ups, in order.
    const warmed = setHints(
      [set('warmup', null, null), set('normal', null, null)],
      [{ kind: 'normal' as const, weightKg: 100, reps: 5 }],
    )
    expect(warmed.map((hint) => hint.weightKg)).toEqual([null, 100])
    expect(matchPrevious([{ kind: 'normal' }, { kind: 'warmup' }], lastTime)).toEqual([
      lastTime[2],
      lastTime[0],
    ])
  })

  it('stops handing a change down once a set goes back to last time', () => {
    const hints = setHints(
      [set('normal', 105, null), set('normal', 100, null), set('normal', null, null)],
      [
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 100, reps: 5 },
      ],
    )
    expect(hints[2].weightKg).toBe(100)
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

  it('scores an exercise done in two cards as one, as the server does', () => {
    const workout = completeAll(
      workoutWith(
        [{ ...bench, sets: [{ weightKg: 110, reps: 3 }] }],
        [{ ...bench, sets: [{ weightKg: 105, reps: 3 }] }],
      ),
      1,
    )
    const records = recordSets(workout.exercises, bests)
    const kinds = [...records.values()].flat()
    // One weight record, on the heavier card's set; the lighter card wins none.
    expect(kinds.filter((kind) => kind === 'weight')).toHaveLength(1)
    expect(records.has(workout.exercises[1].sets[0].id)).toBe(false)
  })

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
    // weight x (30 + reps) / 30 in cents, rounded half up: 63.75 is 63.8 on
    // both sides, where floating point had made it 63.75000000000001.
    expect(estimatedOneRepMax(56.25, 4)).toBe(63.8)
  })

  it('totals a set in cents, as the database does', () => {
    expect(setVolume({ weightKg: 43.09, reps: 5 }, 'weight_reps')).toBe(215.45)
    // With no weigh-in an assisted set has no load to count.
    expect(setVolume({ weightKg: 40, reps: 5 }, 'assisted_reps')).toBeNull()
  })

  it('prices a body weight movement with the body, as workout_set_values does', () => {
    // The body less the machine's help, and plus what hangs from the belt.
    expect(setLoad(30, 'assisted_reps', 80)).toBe(50)
    expect(setVolume({ weightKg: 30, reps: 8 }, 'assisted_reps', 80)).toBe(400)
    expect(setVolume({ weightKg: 10, reps: 5 }, 'weighted_reps', 80)).toBe(450)
    expect(setVolume({ weightKg: null, reps: 6 }, 'weighted_reps', 80)).toBe(480)
    // Help heavier than the body lifts nothing.
    expect(setVolume({ weightKg: 90, reps: 5 }, 'assisted_reps', 80)).toBeNull()
    // Without a weigh-in a weighted set counts what was added.
    expect(setVolume({ weightKg: 10, reps: 5 }, 'weighted_reps')).toBe(50)
    expect(setVolume({ weightKg: 12.5, reps: 3 }, 'assisted_reps', 72.35)).toBe(179.55)
    expect(showsVolume(['assisted_reps'])).toBe(true)
  })

  it('counts the body in the live total and in an assisted volume record', () => {
    const pull = {
      exerciseId: 'assisted-pull-up',
      name: 'Pull Up (Assisted)',
      tracking: 'assisted_reps' as const,
    }
    const workout = completeAll(
      workoutWith([
        {
          ...pull,
          sets: [
            { weightKg: 30, reps: 8 },
            { weightKg: 20, reps: 8 },
          ],
        },
      ]),
      2,
    )
    expect(liveTotals(workout, 80).volumeKg).toBe(400 + 480)
    const records = recordSets(workout.exercises[0], { ...bests, bestSetVolumeKg: 450 }, 80)
    expect(records.get(workout.exercises[0].sets[1].id)).toContain('volume')
    expect(records.get(workout.exercises[0].sets[0].id) ?? []).not.toContain('volume')
  })

  it('gives a tie on weight to the set with more reps', () => {
    const workout = completeAll(
      workoutWith([
        {
          ...bench,
          sets: [
            { weightKg: 105, reps: 3 },
            { weightKg: 105, reps: 5 },
          ],
        },
      ]),
      1,
    )
    const records = recordSets(workout.exercises[0], { ...bests, bestWeightKg: 100 })
    expect(records.get(workout.exercises[0].sets[1].id)).toContain('weight')
    expect(records.get(workout.exercises[0].sets[0].id) ?? []).not.toContain('weight')
  })

  it('marks a run further than the best distance', () => {
    const run = { exerciseId: 'running', name: 'Running', tracking: 'distance_duration' as const }
    const workout = completeAll(
      workoutWith([{ ...run, sets: [{ distanceM: 10000, durationS: 3000 }] }]),
      1,
    )
    const records = recordSets(workout.exercises[0], { ...bests, bestDistanceM: 8000 })
    expect(records.get(workout.exercises[0].sets[0].id)).toContain('distance')
  })
})

describe('energy and Apple Health', () => {
  it('prices a timed activity by its own time and MET, minus resting', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'dance',
          name: 'Dance',
          tracking: 'duration',
          sets: [{ durationS: 3600 }],
        },
      ]),
      1,
    )
    // (5 - 1) x 70 kg x 1 h
    expect(estimateKcal(workout, 3600, { weightKg: 70, restingKcalPerDay: null })).toBe(280)
    expect(healthActivityType(workout)).toBe(78)
  })

  it('prices a timed activity by no more time than the workout lasted', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'dance',
          name: 'Dance',
          tracking: 'duration',
          sets: [{ durationS: 3600 }],
        },
      ]),
      1,
    )
    // An hour typed into a workout that lasted a minute is priced as a minute.
    expect(estimateKcal(workout, 60, { weightKg: 70, restingKcalPerDay: null })).toBe(5)
  })

  it("takes off the person's own resting rate rather than one MET", () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'dance',
          name: 'Dance',
          tracking: 'duration',
          sets: [{ durationS: 3600 }],
        },
      ]),
      1,
    )
    // 5 x 70 kg x 1 h, less 1,440 kcal a day of resting energy for that hour.
    expect(estimateKcal(workout, 3600, { weightKg: 70, restingKcalPerDay: 1440 })).toBe(290)
  })

  it('prices a session of sets no higher than vigorous resistance training', () => {
    const workout = completeAll(
      workoutWith([
        {
          exerciseId: 'pull-up',
          name: 'Pull Up',
          tracking: 'weighted_reps',
          sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
        },
      ]),
      1,
    )
    // Pull-ups are vigorous calisthenics (MET 8) done continuously; an hour
    // of sets with rests between is priced at 6: (6 - 1) x 80 kg x 1 h.
    expect(estimateKcal(workout, 3600, { weightKg: 80, restingKcalPerDay: null })).toBe(400)
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

  it('gives a timed cardio entry one timed set and no rest timer', () => {
    expect(planFor(byId('dance'))).toMatchObject({ restS: 0, sets: [{}] })
  })

  it('counts the time a timed set logs, ticked sets only', () => {
    const workout = workoutWith([
      {
        exerciseId: 'dance',
        name: 'Dance',
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

  it('warms up to the weight a set only offers, and never below the bar', () => {
    const workout = workoutWith([{ ...bench, sets: [{}] }])
    expect(warmupSets(workout.exercises[0], 'kg')).toEqual([])
    const offered = warmupSets(workout.exercises[0], 'kg', { workingKg: 40, barbell: true })
    // 40% of 40 is 15 kg, less than a 20 kg bar.
    expect(offered.map((set) => set.weightKg)).toEqual([22.5, 30])
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

describe('small rules', () => {
  it('walks a superset a round at a time on the pad', () => {
    let workout = workoutWith([{ ...bench, sets: [{}, {}] }], [{ ...bench, sets: [{}, {}] }])
    const [a, b] = workout.exercises
    workout = apply(workout, { type: 'superset', key: a.key, withKey: b.key })
    const sets = walkOrder(workout.exercises)
      .filter((key) => key.endsWith('|weight'))
      .map((key) => key.split('|')[0])
    expect(sets).toEqual([a.key, b.key, a.key, b.key])
  })

  it('rounds a distance typed in miles to what the database keeps', () => {
    expect(parseDistance('3.1', 'mi')).toBe(4989)
  })

  it('gives a stretch no rest timer', () => {
    const yoga = EXERCISES.find((exercise) => exercise.category === 'mobility')
    if (!yoga) throw new Error('no mobility entry')
    expect(planFor({ ...yoga, custom: false }).restS).toBe(0)
  })
})

describe('the catalogue without sports', () => {
  it('holds gym exercises, cardio and mobility, and no sports', () => {
    // Every exercise Strong ships but its four sports, plus the app's own.
    expect(EXERCISES).toHaveLength(278)
    expect(new Set(EXERCISES.map((exercise) => exercise.id)).size).toBe(EXERCISES.length)
    expect(EXERCISES.some((exercise) => (exercise.category as string) === 'sports')).toBe(false)
    expect(EXERCISES.some((exercise) => exercise.id === 'badminton')).toBe(false)
  })
})
