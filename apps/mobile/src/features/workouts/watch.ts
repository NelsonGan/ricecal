import type {
  WatchCommand,
  WatchExercise,
  WatchFigures,
  WatchRoutine,
  WatchWorkout,
} from '@modules/ricecal-watch'
import type { LastSet, Routine } from '@/data'
import {
  type Action,
  fieldsFor,
  isLoggable,
  type LiveExercise,
  type LiveSet,
  type LiveWorkout,
  newWorkout,
  restAfter,
  type SetPatch,
  setHints,
  tickedSet,
} from './model'
import { routinePlans } from './routines'
import type { EndedWorkout } from './store'

/**
 * The phone's half of the Apple Watch app, as pure functions: what the watch
 * is sent, and what a command from it does to the workout.
 *
 * The phone is the record of a running workout and the watch a remote for it,
 * as the Live Activity is. A press on the watch becomes the same actions the
 * logger dispatches, so a set completed on the wrist is saved exactly as one
 * completed on the phone, and `WatchSync` (the effects) only moves the results
 * around.
 */

type Previous = Record<string, LastSet[]> | undefined

/** The most routines the watch is sent: its list is a few rows on a small screen. */
export const WATCH_ROUTINES = 12

/**
 * A start that arrives this long after it was pressed is not acted on. The
 * phone remembers only its last ten endings, and a start the system held back
 * for hours, from a workout long finished, otherwise came back as a workout
 * running on the phone that nobody had started.
 */
const START_LATE_MS = 12 * 60 * 60 * 1000

const FIGURES = ['weightKg', 'reps', 'durationS', 'distanceM'] as const
type Figure = (typeof FIGURES)[number]

const FIELD_OF: Record<'weight' | 'reps' | 'duration' | 'distance', Figure> = {
  weight: 'weightKg',
  reps: 'reps',
  duration: 'durationS',
  distance: 'distanceM',
}

/** The figures a tracking records, the rest null, so the watch draws only those. */
function figuresFor(set: Pick<LiveSet, Figure>, tracking: LiveExercise['tracking']): WatchFigures {
  const kept = new Set(fieldsFor(tracking).map((field) => FIELD_OF[field]))
  return {
    weightKg: kept.has('weightKg') ? set.weightKg : null,
    reps: kept.has('reps') ? set.reps : null,
    durationS: kept.has('durationS') ? set.durationS : null,
    distanceM: kept.has('distanceM') ? set.distanceM : null,
  }
}

/**
 * Each exercise as the watch draws it. A set shows what it holds, or for one
 * not done yet, what ticking it would take (`setHints`), so completing a set
 * on the watch without touching it saves what the phone's tick would have.
 */
export function watchExercises(
  workout: LiveWorkout,
  previous: Previous,
  defaultRestS: number,
  { withPlan = false }: { withPlan?: boolean } = {},
): WatchExercise[] {
  return workout.exercises.map((exercise) => {
    const hints = setHints(exercise.sets, previous?.[exercise.exerciseId])
    return {
      key: exercise.key,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      tracking: exercise.tracking,
      superset: exercise.superset,
      ...(withPlan ? { ownRestS: exercise.restS } : null),
      sets: exercise.sets.map((set, index) => ({
        id: set.id,
        kind: set.kind,
        done: set.done,
        ...figuresFor(set.done ? set : tickedSet(set, 0, hints[index]), exercise.tracking),
        restS: restAfter(workout, exercise, defaultRestS, set.id),
        ...(withPlan ? { plan: figuresFor(set, exercise.tracking) } : null),
      })),
    }
  })
}

export function watchWorkout(
  workout: LiveWorkout,
  previous: Previous,
  defaultRestS: number,
): WatchWorkout {
  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    rest: workout.rest ? { endsAt: workout.rest.endsAt, totalS: workout.rest.totalS } : null,
    recorded: workout.watch?.recorded ?? false,
    appliedSeq: workout.watch?.appliedSeq ?? 0,
    exercises: watchExercises(workout, previous, defaultRestS),
  }
}

/**
 * The routines the watch can start, in the tab's order. Keys and set ids are
 * the routine's own positions so the list sent is the same until the routine
 * changes; the watch mints fresh ones for the workout it starts.
 */
export function watchRoutines(
  routines: readonly Routine[],
  previous: Previous,
  defaultRestS: number,
): WatchRoutine[] {
  return routines
    .filter((routine) => routine.exercises.length > 0)
    .slice(0, WATCH_ROUTINES)
    .map((routine) => {
      const plan = newWorkout({
        id: routine.id,
        name: routine.name,
        exercises: routinePlans(routine),
      })
      const named: LiveWorkout = {
        ...plan,
        exercises: plan.exercises.map((exercise, index) => ({
          ...exercise,
          key: `${routine.id}:${index}`,
          sets: exercise.sets.map((set, at) => ({ ...set, id: `${routine.id}:${index}:${at}` })),
        })),
      }
      return {
        id: routine.id,
        name: routine.name,
        exercises: watchExercises(named, previous, defaultRestS, { withPlan: true }),
      }
    })
}

export type WatchOutcome =
  | { kind: 'ignore' }
  | { kind: 'actions'; actions: Action[] }
  | { kind: 'start'; workout: LiveWorkout }
  | { kind: 'finish'; seq: number; endedAt: number }
  | { kind: 'discard' }

const IGNORE: WatchOutcome = { kind: 'ignore' }

/** A figure from the watch, or null for anything that is not one. */
const figure = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

/**
 * What a command from the watch does to the running workout.
 *
 * The watch sends every command the phone has not confirmed, in order, each
 * time; the workout remembers how far it got (`appliedSeq`), so each is applied
 * once whatever is sent again. A command for a workout that has ended, or that
 * is not the one running, is dropped. A start is the exception, since it makes
 * the workout; one that arrives while another workout runs is dropped too, and
 * the watch, seeing the phone's workout in the next state, follows that one.
 */
export function applyWatchCommand(
  workout: LiveWorkout | null,
  command: WatchCommand,
  { now, ended }: { now: number; ended: readonly EndedWorkout[] },
): WatchOutcome {
  if (ended.some((entry) => entry.id === command.workoutId)) return IGNORE

  if (command.type === 'start') {
    if (workout || now - command.at > START_LATE_MS) return IGNORE
    const started = newWorkout({
      id: command.workoutId,
      name: command.name.trim() || 'Workout',
      // The watch's clock, but never in the phone's future.
      startedAt: Math.min(command.at, now),
      routineId: command.routineId,
      exercises: command.exercises.map((exercise) => ({
        key: exercise.key,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        tracking: exercise.tracking,
        restS: exercise.restS,
        superset: exercise.superset,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          kind: set.kind,
          weightKg: figure(set.weightKg),
          reps: figure(set.reps),
          durationS: figure(set.durationS),
          distanceM: figure(set.distanceM),
        })),
      })),
    })
    return {
      kind: 'start',
      workout: { ...started, watch: { recorded: false, appliedSeq: command.seq } },
    }
  }

  if (!workout || workout.id !== command.workoutId) return IGNORE
  if (command.seq <= (workout.watch?.appliedSeq ?? 0)) return IGNORE
  const applied: Action = { type: 'watchApplied', seq: command.seq }
  const exerciseOf = (key: string) => workout.exercises.find((exercise) => exercise.key === key)

  switch (command.type) {
    case 'complete': {
      const exercise = exerciseOf(command.exerciseKey)
      const set = exercise?.sets.find((entry) => entry.id === command.setId)
      if (!exercise || !set) return { kind: 'actions', actions: [applied] }
      const sent = figuresFor(
        {
          weightKg: figure(command.weightKg),
          reps: figure(command.reps),
          durationS: figure(command.durationS),
          distanceM: figure(command.distanceM),
        },
        exercise.tracking,
      )
      // A figure the set already holds and the watch changed is rewritten; a
      // blank is filled the way the logger's tick fills it.
      const changed: SetPatch = {}
      for (const field of FIGURES) {
        const value = sent[field]
        if (set[field] !== null && value !== null && value !== set[field]) changed[field] = value
      }
      const ticked = tickedSet({ ...set, ...changed }, command.at, sent)
      if (!isLoggable(ticked, exercise.tracking)) return { kind: 'actions', actions: [applied] }
      const actions: Action[] = []
      if (Object.keys(changed).length) {
        actions.push({ type: 'updateSet', key: exercise.key, setId: set.id, patch: changed })
      }
      if (!set.done) {
        actions.push({
          type: 'completeSet',
          key: exercise.key,
          setId: set.id,
          at: command.at,
          fill: sent,
        })
        const restS = Math.max(0, Math.round(command.restS))
        // A press that arrives after its rest would have ended starts none.
        if (restS > 0 && command.at + restS * 1000 > now) {
          actions.push({
            type: 'startRest',
            exerciseKey: exercise.key,
            totalS: restS,
            at: command.at,
          })
        }
      }
      return { kind: 'actions', actions: [...actions, applied] }
    }
    case 'uncomplete': {
      const set = exerciseOf(command.exerciseKey)?.sets.find((entry) => entry.id === command.setId)
      return {
        kind: 'actions',
        actions: set?.done
          ? [{ type: 'uncompleteSet', key: command.exerciseKey, setId: set.id }, applied]
          : [applied],
      }
    }
    case 'addSet': {
      const exercise = exerciseOf(command.exerciseKey)
      if (!exercise || exercise.sets.some((set) => set.id === command.setId)) {
        return { kind: 'actions', actions: [applied] }
      }
      return {
        kind: 'actions',
        actions: [{ type: 'addSets', key: exercise.key, sets: [{ id: command.setId }] }, applied],
      }
    }
    case 'restAdjust':
      return {
        kind: 'actions',
        actions: [{ type: 'adjustRest', byS: Math.round(command.byS), at: now }, applied],
      }
    case 'restSkip':
      return { kind: 'actions', actions: [{ type: 'stopRest' }, applied] }
    case 'recording':
      return { kind: 'actions', actions: [{ type: 'watchRecorded' }, applied] }
    case 'finish':
      return {
        kind: 'finish',
        seq: command.seq,
        endedAt: Math.min(now, Math.max(workout.startedAt, command.endedAt)),
      }
    case 'discard':
      return { kind: 'discard' }
  }
}
