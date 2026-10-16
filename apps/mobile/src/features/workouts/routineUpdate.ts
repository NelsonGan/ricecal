import type { RoutineExercise, RoutineSet } from '@/data'
import type { ExercisePlan, LiveExercise, LiveWorkout, SetPlan } from './model'
import { tidySupersets } from './model'
import { plansToRoutine } from './routines'

/**
 * Whether a workout started from a routine left it, and the routine it would
 * leave behind. Asked when the workout is saved, the way Strong asks about its
 * templates and Hevy about its routines.
 *
 * Two kinds of change, asked about separately:
 *
 * - The layout: exercises added, removed, swapped or moved, sets added or
 *   removed, a set's kind, a rest, a superset. Only what was edited counts: a
 *   set left unfinished is still in the logger, so skipping the last set is not
 *   removing it, and the routine is not offered a shorter version every time
 *   someone runs out of steam.
 * - The numbers: a finished set that differs from a number the routine itself
 *   holds. A field the routine leaves blank means "what I did last time", and
 *   last time is whatever was done today, so filling it in is not a change;
 *   otherwise a routine kept blank on purpose would ask after every workout.
 *
 * Exercise notes are left out of the comparison: a note typed during a workout
 * is usually about that day.
 */

export type RoutineChanges = {
  /** Exercises or sets added, removed, swapped or moved, or their kind, rest or superset. */
  layout: boolean
  /** A finished set's number differs from one the routine holds. */
  values: boolean
  /** Something in the routine is not in the workout, so updating the layout deletes it. */
  removes: boolean
}

/** How to update: the new layout keeping the routine's numbers, with today's numbers, or the numbers alone. */
export type RoutineUpdate = 'layout' | 'layoutAndValues' | 'values'

const FIELDS = [
  ['weightKg', 'weight_kg'],
  ['reps', 'reps'],
  ['durationS', 'duration_s'],
  ['distanceM', 'distance_m'],
] as const

// A routine with no sets starts the logger with one blank set (`exerciseFromPlan`).
const plannedSets = (exercise: RoutineExercise) => Math.max(1, exercise.sets.length)

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6

/** Superset numbers in order of first appearance, so two numberings of one grouping compare equal. */
function groupings(supersets: readonly (number | null | undefined)[]): (number | null)[] {
  const seen = new Map<number, number>()
  return supersets.map((group) => {
    if (group === null || group === undefined) return null
    if (!seen.has(group)) seen.set(group, seen.size)
    return seen.get(group) ?? null
  })
}

/**
 * Each exercise in the workout paired with the routine exercise it came from,
 * by the order each exercise appears: the second bench press in the logger is
 * the second bench press in the routine. Two copies of one exercise that swap
 * places pair the wrong way round, which can only add a question, and a
 * routine listing an exercise twice is rare.
 */
function pair(routine: readonly RoutineExercise[], exercises: readonly LiveExercise[]) {
  const unclaimed = new Map<string, number[]>()
  routine.forEach((exercise, index) => {
    const list = unclaimed.get(exercise.exercise_id) ?? []
    list.push(index)
    unclaimed.set(exercise.exercise_id, list)
  })
  const matched = exercises.map((exercise) => unclaimed.get(exercise.exerciseId)?.shift() ?? null)
  return { matched, leftOver: [...unclaimed.values()].some((list) => list.length > 0) }
}

export function routineChanges(
  routine: readonly RoutineExercise[],
  workout: Pick<LiveWorkout, 'exercises'>,
): RoutineChanges {
  const exercises = workout.exercises
  const { matched, leftOver } = pair(routine, exercises)

  let removes = leftOver
  let values = false
  exercises.forEach((exercise, index) => {
    const from = matched[index]
    if (from === null) return
    const planned = routine[from]
    if (exercise.sets.length < plannedSets(planned)) removes = true
    exercise.sets.forEach((set, setIndex) => {
      const target = planned.sets[setIndex]
      if (!set.done || !target) return
      for (const [live, stored] of FIELDS) {
        const want = target[stored]
        const did = set[live]
        if (want !== null && want !== undefined && did !== null && !same(want, did)) values = true
      }
    })
  })

  const layout =
    removes ||
    exercises.length !== routine.length ||
    exercises.some((exercise, index) => {
      const planned = routine[index]
      return (
        exercise.exerciseId !== planned.exercise_id ||
        exercise.sets.length !== plannedSets(planned) ||
        exercise.sets.some(
          (set, setIndex) => set.kind !== (planned.sets[setIndex]?.kind ?? 'normal'),
        ) ||
        (exercise.restS ?? null) !== (planned.rest_s ?? null)
      )
    }) ||
    groupings(exercises.map((exercise) => exercise.superset)).join() !==
      groupings(routine.map((exercise) => exercise.superset)).join()

  return { layout, values, removes }
}

const toSetPlan = (set: RoutineSet | undefined): SetPlan => ({
  kind: set?.kind ?? 'normal',
  weightKg: set?.weight_kg ?? null,
  reps: set?.reps ?? null,
  durationS: set?.duration_s ?? null,
  distanceM: set?.distance_m ?? null,
})

/**
 * The routine after an update.
 *
 * `layout` takes the workout's exercises, order, sets, kinds, rests, supersets
 * and notes. A set that was already in the routine keeps the routine's numbers;
 * a new one starts blank, which the logger fills with last time's numbers, and
 * last time is today.
 *
 * `layoutAndValues` is the same layout with today's numbers in every set.
 *
 * `values` keeps the routine's layout and writes today's numbers into the
 * finished sets it pairs with, in the fields the routine already sets.
 */
export function updatedRoutine(
  routine: readonly RoutineExercise[],
  workout: Pick<LiveWorkout, 'exercises'>,
  how: RoutineUpdate,
): RoutineExercise[] {
  const { matched } = pair(routine, workout.exercises)

  if (how === 'values') {
    const next = routine.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    }))
    workout.exercises.forEach((exercise, index) => {
      const from = matched[index]
      if (from === null) return
      exercise.sets.forEach((set, setIndex) => {
        const target = next[from].sets[setIndex]
        if (!set.done || !target) return
        for (const [live, stored] of FIELDS) {
          if (target[stored] !== null && target[stored] !== undefined && set[live] !== null) {
            target[stored] = set[live]
          }
        }
      })
    })
    return next
  }

  const plans = workout.exercises.map(
    (exercise, index): ExercisePlan & { superset: number | null } => {
      const from = matched[index]
      const planned = from === null ? null : routine[from]
      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        tracking: exercise.tracking,
        restS: exercise.restS,
        superset: exercise.superset,
        notes: exercise.notes,
        sets: exercise.sets.map((set, setIndex) =>
          how === 'layoutAndValues'
            ? {
                kind: set.kind,
                weightKg: set.weightKg,
                reps: set.reps,
                durationS: set.durationS,
                distanceM: set.distanceM,
              }
            : { ...toSetPlan(planned?.sets[setIndex]), kind: set.kind },
        ),
      }
    },
  )
  return plansToRoutine(tidySupersets(plans))
}
