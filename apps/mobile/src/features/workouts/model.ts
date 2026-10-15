import { dateKey } from '@/data/client'
import type { WorkoutDocument } from '@/data/workout-outbox'
import type { Tracking } from './catalogue'

/**
 * A workout while it is being written: the logger's document.
 *
 * Plain data and pure functions, because two screens drive the same shape. The
 * live logger keeps one on the phone (`store.ts`) for as long as the user is
 * training, and editing a finished workout loads one from the server into local
 * state. Both apply the same `apply` below, so a change to how a set is ticked
 * cannot behave differently in the two.
 *
 * Weights are kilograms whatever the user's unit, converted at the field: the
 * database stores kilograms and a pound value in the store would be converted
 * twice the first time anyone forgot which one it was.
 */

export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure'
export const SET_KINDS: readonly SetKind[] = ['normal', 'warmup', 'drop', 'failure']

export type LiveSet = {
  id: string
  kind: SetKind
  weightKg: number | null
  reps: number | null
  durationS: number | null
  distanceM: number | null
  rpe: number | null
  done: boolean
  /** When it was ticked, so a forgotten workout can end at its last set. */
  doneAt: number | null
}

export type LiveExercise = {
  key: string
  exerciseId: string
  name: string
  tracking: Tracking
  /** Seconds, or null for the user's default. 0 is "no timer". */
  restS: number | null
  /** Exercises sharing a number are a superset. */
  superset: number | null
  notes: string
  sets: LiveSet[]
}

export type LiveWorkout = {
  /** Minted at start; the save is keyed on it. */
  id: string
  name: string
  notes: string
  startedAt: number
  /** Set only when editing a finished workout, whose end is already known. */
  endedAt: number | null
  routineId: string | null
  exercises: LiveExercise[]
  /** The rest countdown in progress, if any. */
  rest: { endsAt: number; totalS: number; exerciseKey: string } | null
  /** The Apple Health copy of a workout being edited, so it can be replaced. */
  healthWorkoutId: string | null
  /**
   * "Still training?" was answered with "keep going". Kept in the document so
   * reopening the logger does not ask again. Absent on documents saved before
   * it existed, which reads as not asked.
   */
  staleAnswered?: boolean
}

let counter = 0
/** Local keys for list rows. Not ids anything outside this document sees. */
function localKey(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** RFC 4122 v4, for the workout id the server will store. */
export function uuid(): string {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function emptySet(kind: SetKind = 'normal'): LiveSet {
  return {
    id: localKey(),
    kind,
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    rpe: null,
    done: false,
    doneAt: null,
  }
}

/** What a set or a plan says to do, before anybody has done it. */
export type SetPlan = {
  kind?: SetKind
  weightKg?: number | null
  reps?: number | null
  durationS?: number | null
  distanceM?: number | null
}

function setFromPlan(set: SetPlan): LiveSet {
  return {
    ...emptySet(set.kind ?? 'normal'),
    weightKg: set.weightKg ?? null,
    reps: set.reps ?? null,
    durationS: set.durationS ?? null,
    distanceM: set.distanceM ?? null,
  }
}

export type ExercisePlan = {
  exerciseId: string
  name: string
  tracking: Tracking
  restS?: number | null
  superset?: number | null
  notes?: string | null
  sets: SetPlan[]
}

export function exerciseFromPlan(plan: ExercisePlan): LiveExercise {
  const sets = plan.sets.length ? plan.sets : [{}]
  return {
    key: localKey(),
    exerciseId: plan.exerciseId,
    name: plan.name,
    tracking: plan.tracking,
    restS: plan.restS ?? null,
    superset: plan.superset ?? null,
    notes: plan.notes ?? '',
    sets: sets.map(setFromPlan),
  }
}

export function newWorkout(input: {
  name: string
  startedAt?: number
  routineId?: string | null
  exercises?: ExercisePlan[]
}): LiveWorkout {
  return {
    id: uuid(),
    name: input.name,
    notes: '',
    startedAt: input.startedAt ?? Date.now(),
    endedAt: null,
    routineId: input.routineId ?? null,
    exercises: (input.exercises ?? []).map(exerciseFromPlan),
    rest: null,
    healthWorkoutId: null,
  }
}

export type SetPatch = Partial<
  Pick<LiveSet, 'kind' | 'weightKg' | 'reps' | 'durationS' | 'distanceM' | 'rpe'>
>

export type Action =
  | { type: 'rename'; name: string }
  | { type: 'notes'; notes: string }
  | { type: 'times'; startedAt: number; endedAt?: number | null }
  | { type: 'addExercises'; plans: ExercisePlan[] }
  | { type: 'replaceExercise'; key: string; plan: ExercisePlan }
  | { type: 'removeExercise'; key: string }
  /** The exercises in this order of keys, as the reorder sheet leaves them. */
  | { type: 'reorderExercises'; keys: readonly string[] }
  | { type: 'exerciseNotes'; key: string; notes: string }
  | { type: 'exerciseRest'; key: string; restS: number | null }
  | { type: 'superset'; key: string; withKey: string | null }
  | { type: 'addSet'; key: string; kind?: SetKind }
  | { type: 'addSets'; key: string; sets: SetPlan[]; atStart?: boolean }
  | { type: 'removeSet'; key: string; setId: string }
  | { type: 'updateSet'; key: string; setId: string; patch: SetPatch }
  | { type: 'completeSet'; key: string; setId: string; at: number; fill?: SetPatch }
  | { type: 'uncompleteSet'; key: string; setId: string }
  | { type: 'startRest'; exerciseKey: string; totalS: number; at: number }
  | { type: 'adjustRest'; byS: number; at: number }
  | { type: 'stopRest' }
  | { type: 'staleAnswered' }

const mapExercise = (
  workout: LiveWorkout,
  key: string,
  fn: (exercise: LiveExercise) => LiveExercise,
): LiveWorkout => ({
  ...workout,
  exercises: workout.exercises.map((exercise) => (exercise.key === key ? fn(exercise) : exercise)),
})

const mapSet = (
  exercise: LiveExercise,
  setId: string,
  fn: (set: LiveSet) => LiveSet,
): LiveExercise => ({
  ...exercise,
  sets: exercise.sets.map((set) => (set.id === setId ? fn(set) : set)),
})

/** The only way a workout document changes. */
export function apply(workout: LiveWorkout, action: Action): LiveWorkout {
  switch (action.type) {
    case 'rename':
      return { ...workout, name: action.name }
    case 'notes':
      return { ...workout, notes: action.notes }
    case 'times':
      return {
        ...workout,
        startedAt: action.startedAt,
        endedAt: action.endedAt === undefined ? workout.endedAt : action.endedAt,
      }
    case 'addExercises':
      return {
        ...workout,
        exercises: [...workout.exercises, ...action.plans.map(exerciseFromPlan)],
      }
    case 'replaceExercise':
      // Swapping the machine for the dumbbell version keeps the sets the user
      // already typed, because the numbers are usually what they meant to keep.
      return mapExercise(workout, action.key, (exercise) => ({
        ...exercise,
        exerciseId: action.plan.exerciseId,
        name: action.plan.name,
        tracking: action.plan.tracking,
      }))
    case 'removeExercise': {
      const rest = workout.rest?.exerciseKey === action.key ? null : workout.rest
      return {
        ...workout,
        rest,
        exercises: tidySupersets(
          workout.exercises.filter((exercise) => exercise.key !== action.key),
        ),
      }
    }
    case 'reorderExercises': {
      const at = new Map(action.keys.map((key, index) => [key, index]))
      // Anything the order does not name keeps its place at the end, so a
      // drag that raced an added exercise cannot lose it.
      const rank = (key: string) => at.get(key) ?? action.keys.length
      const exercises = workout.exercises
        .map((exercise, index) => ({ exercise, index }))
        .sort((a, b) => rank(a.exercise.key) - rank(b.exercise.key) || a.index - b.index)
        .map((entry) => entry.exercise)
      return { ...workout, exercises }
    }
    case 'exerciseNotes':
      return mapExercise(workout, action.key, (exercise) => ({ ...exercise, notes: action.notes }))
    case 'exerciseRest':
      return mapExercise(workout, action.key, (exercise) => ({ ...exercise, restS: action.restS }))
    case 'superset': {
      const linked = linkSuperset(workout, action.key, action.withKey)
      return { ...linked, exercises: tidySupersets(linked.exercises) }
    }
    case 'addSet':
      return mapExercise(workout, action.key, (exercise) => {
        // A new set copies the one above it, which is what the next set nearly
        // always is: the same weight for the same reps.
        const last = exercise.sets[exercise.sets.length - 1]
        const next = emptySet(action.kind ?? 'normal')
        if (last && action.kind !== 'warmup') {
          next.weightKg = last.weightKg
          next.reps = last.reps
          next.durationS = last.durationS
          next.distanceM = last.distanceM
        }
        return { ...exercise, sets: [...exercise.sets, next] }
      })
    case 'addSets':
      return mapExercise(workout, action.key, (exercise) => {
        const added = action.sets.map(setFromPlan)
        return {
          ...exercise,
          sets: action.atStart ? [...added, ...exercise.sets] : [...exercise.sets, ...added],
        }
      })
    case 'removeSet':
      return mapExercise(workout, action.key, (exercise) => ({
        ...exercise,
        sets: exercise.sets.filter((set) => set.id !== action.setId),
      }))
    case 'updateSet':
      return mapExercise(workout, action.key, (exercise) =>
        mapSet(exercise, action.setId, (set) => ({ ...set, ...action.patch })),
      )
    case 'completeSet':
      return mapExercise(workout, action.key, (exercise) =>
        mapSet(exercise, action.setId, (set) => ({
          ...set,
          ...fillBlanks(set, action.fill),
          done: true,
          doneAt: action.at,
        })),
      )
    case 'uncompleteSet':
      return mapExercise(workout, action.key, (exercise) =>
        mapSet(exercise, action.setId, (set) => ({ ...set, done: false, doneAt: null })),
      )
    case 'startRest':
      if (action.totalS <= 0) return { ...workout, rest: null }
      return {
        ...workout,
        rest: {
          endsAt: action.at + action.totalS * 1000,
          totalS: action.totalS,
          exerciseKey: action.exerciseKey,
        },
      }
    case 'adjustRest': {
      if (!workout.rest) return workout
      const endsAt = workout.rest.endsAt + action.byS * 1000
      if (endsAt <= action.at) return { ...workout, rest: null }
      return {
        ...workout,
        rest: { ...workout.rest, endsAt, totalS: Math.max(1, workout.rest.totalS + action.byS) },
      }
    }
    case 'staleAnswered':
      return { ...workout, staleAnswered: true }
    case 'stopRest':
      return { ...workout, rest: null }
  }
}

/**
 * The rest ticking a set of `exercise` starts. In a superset the rest comes
 * after the last exercise of the round, not between its members.
 */
export function restAfter(
  workout: LiveWorkout,
  exercise: LiveExercise,
  defaultRestS: number,
): number {
  if (exercise.superset !== null) {
    const group = workout.exercises.filter((entry) => entry.superset === exercise.superset)
    if (group[group.length - 1]?.key !== exercise.key) return 0
  }
  return exercise.restS ?? defaultRestS
}

/** What an empty field shows and a tick takes. See `setHints`. */
export type SetHint = Required<Pick<SetPatch, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>>

const NO_HINT: SetHint = { weightKg: null, reps: null, durationS: null, distanceM: null }

/**
 * Each set's hints, per column: a figure typed above it, then last time's
 * figure for this set, then whatever the row above shows. Typing 105 into the
 * first set offers 105 to every set under it, the way a column filled in on
 * paper reads, and ticking an empty set takes what it offers.
 *
 * In that order because each answers a different question. A figure changed
 * today is the plan for today, so it beats last time; one that only repeats
 * last time's (a tick takes it) changes nothing. Last time's own set
 * beats a figure merely shown above it, or a 100 x 5 set under a 100 x 10 one
 * was offered 10 reps. And a set last time did not have takes what the row
 * above shows, so a third set is not blank under two that read 60 x 10.
 *
 * Warm-ups only hand down to warm-ups: a 40 kg warm-up is not a working set's
 * weight.
 */
export function setHints(
  sets: readonly Pick<LiveSet, 'kind' | 'weightKg' | 'reps' | 'durationS' | 'distanceM'>[],
  previous: readonly (SetPatch | undefined)[] | null | undefined,
): SetHint[] {
  const fresh = () => ({ typed: { ...NO_HINT }, shown: { ...NO_HINT } })
  const above = { warmup: fresh(), working: fresh() }
  const column = (
    field: keyof SetHint,
    set: (typeof sets)[number],
    carry: ReturnType<typeof fresh>,
    last: SetPatch | undefined,
  ) => {
    const hint = carry.typed[field] ?? last?.[field] ?? carry.shown[field] ?? null
    // A figure that is last time's again (typed, or taken by a tick) is not a
    // change, and the sets under it go on following their own last time.
    const own = set[field]
    if (own !== null && own !== (last?.[field] ?? null)) carry.typed[field] = own
    carry.shown[field] = set[field] ?? hint
    return hint
  }
  return sets.map((set, index) => {
    const carry = set.kind === 'warmup' ? above.warmup : above.working
    const last = previous?.[index]
    return {
      weightKg: column('weightKg', set, carry, last),
      reps: column('reps', set, carry, last),
      durationS: column('durationS', set, carry, last),
      distanceM: column('distanceM', set, carry, last),
    }
  })
}

/** Only the blanks: a value the user typed is never overwritten by a hint. */
function fillBlanks(set: LiveSet, fill: SetPatch | undefined): SetPatch {
  if (!fill) return {}
  return {
    weightKg: set.weightKg ?? fill.weightKg ?? null,
    reps: set.reps ?? fill.reps ?? null,
    durationS: set.durationS ?? fill.durationS ?? null,
    distanceM: set.distanceM ?? fill.distanceM ?? null,
  }
}

/**
 * A superset of one is not a superset. Removing a partner, or moving one into
 * another group, used to leave the other alone under the bracket, and saved
 * that way.
 */
function tidySupersets(exercises: LiveExercise[]): LiveExercise[] {
  const members = new Map<number, number>()
  for (const exercise of exercises) {
    if (exercise.superset !== null) {
      members.set(exercise.superset, (members.get(exercise.superset) ?? 0) + 1)
    }
  }
  return exercises.map((exercise) =>
    exercise.superset !== null && (members.get(exercise.superset) ?? 0) < 2
      ? { ...exercise, superset: null }
      : exercise,
  )
}

/**
 * Links two exercises into one superset, or unlinks one when `withKey` is null.
 * Joining an exercise to one already in a group joins the group.
 */
function linkSuperset(workout: LiveWorkout, key: string, withKey: string | null): LiveWorkout {
  if (withKey === null) {
    return mapExercise(workout, key, (exercise) => ({ ...exercise, superset: null }))
  }
  const self = workout.exercises.find((exercise) => exercise.key === key)
  const partner = workout.exercises.find((exercise) => exercise.key === withKey)
  if (!self || !partner) return workout
  const used = new Set(
    workout.exercises.map((exercise) => exercise.superset).filter((n) => n !== null),
  )
  // "Superset with next" on an exercise already in one extends that group, so
  // three in a row is one giant set rather than two pairs.
  let group = partner.superset ?? self.superset
  if (group === null) {
    group = 0
    while (used.has(group)) group += 1
  }
  const target = group
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) =>
      exercise.key === key || exercise.key === withKey
        ? { ...exercise, superset: target }
        : exercise,
    ),
  }
}

// ---------------------------------------------------------------------------
// What a set needs before it can be ticked, and what it is worth.
// ---------------------------------------------------------------------------

/** The fields a tracking records, in the order the logger draws them. */
export function fieldsFor(tracking: Tracking): ('weight' | 'reps' | 'duration' | 'distance')[] {
  switch (tracking) {
    case 'weight_reps':
    case 'weighted_reps':
    case 'assisted_reps':
      return ['weight', 'reps']
    case 'reps':
      return ['reps']
    case 'duration':
      return ['duration']
    case 'distance_duration':
      return ['distance', 'duration']
    case 'weight_distance':
      return ['weight', 'distance']
  }
}

/**
 * Whether a set says enough to be a set. A bench press with no reps is not a
 * set, and neither is a plank with no time; the weight of a pull-up is
 * optional, since most of them are done with none added.
 */
export function isLoggable(
  set: Pick<LiveSet, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>,
  tracking: Tracking,
): boolean {
  switch (tracking) {
    case 'weight_reps':
      return (set.reps ?? 0) > 0 && set.weightKg !== null
    case 'reps':
    case 'weighted_reps':
    case 'assisted_reps':
      return (set.reps ?? 0) > 0
    case 'duration':
      return (set.durationS ?? 0) > 0
    case 'distance_duration':
      return (set.durationS ?? 0) > 0 || (set.distanceM ?? 0) > 0
    case 'weight_distance':
      return (set.distanceM ?? 0) > 0
  }
}

/**
 * The running header figures while the workout is still on the phone. The
 * server computes the saved workout's own figures (`workout_summaries`); these
 * are the same definitions, applied to a document that has not been saved yet.
 */
export function liveTotals(workout: LiveWorkout): { volumeKg: number; sets: number; done: number } {
  let volumeKg = 0
  let sets = 0
  let done = 0
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      sets += 1
      if (!set.done) continue
      done += 1
      volumeKg += setVolume(set, exercise.tracking) ?? 0
    }
  }
  return { volumeKg, sets, done }
}

/**
 * Whether a workout has anything in it that volume is counted for. A run or a
 * game has none, and "0 kg" under it is a figure about nothing; an empty
 * workout has not decided yet, so it keeps the figure.
 */
export function showsVolume(trackings: readonly Tracking[]): boolean {
  return (
    trackings.length === 0 ||
    trackings.some((tracking) => tracking === 'weight_reps' || tracking === 'weighted_reps')
  )
}

/** Weight x reps where the weight is load. Matches `workout_set_details`. */
export function setVolume(
  set: Pick<LiveSet, 'weightKg' | 'reps'>,
  tracking: Tracking,
): number | null {
  if (tracking !== 'weight_reps' && tracking !== 'weighted_reps') return null
  if (!set.weightKg || !set.reps) return null
  return set.weightKg * set.reps
}

/** Epley, over 1 to 15 reps. Matches `workout_set_details`. */
export function estimatedOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > 15) return null
  if (reps === 1) return weightKg
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

/** The time of the last ticked set, for "finish when I actually stopped". */
export function lastActivityAt(workout: LiveWorkout): number | null {
  let latest: number | null = null
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.doneAt && (latest === null || set.doneAt > latest)) latest = set.doneAt
    }
  }
  return latest
}

/** Last time's sets for each exercise in a workout, by exercise id and position. */
export type PreviousSets = Readonly<Record<string, readonly SetPatch[] | undefined>>

/**
 * Each unticked set as it would be ticked: its own numbers, and in the blanks
 * what the row offers (`setHints`). The rows show those, so a set that shows
 * numbers counts as one with numbers.
 */
function offered(
  exercise: LiveExercise,
  previous: PreviousSets | undefined,
): { set: LiveSet; filled: LiveSet }[] {
  const hints = setHints(exercise.sets, previous?.[exercise.exerciseId])
  return exercise.sets.map((set, index) => ({
    set,
    filled: { ...set, ...fillBlanks(set, hints[index]) },
  }))
}

/** Sets not ticked that would be loggable if they were. */
export function unfinishedSets(workout: LiveWorkout, previous?: PreviousSets): number {
  let count = 0
  for (const exercise of workout.exercises) {
    for (const { set, filled } of offered(exercise, previous)) {
      if (!set.done && isLoggable(filled, exercise.tracking)) count += 1
    }
  }
  return count
}

/**
 * Ticks every set that says enough to be one, with what it offers in its
 * blanks. "Tick them and save" on a forgotten checkmark.
 */
export function completeAll(
  workout: LiveWorkout,
  at: number,
  previous?: PreviousSets,
): LiveWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: offered(exercise, previous).map(({ set, filled }) =>
        !set.done && isLoggable(filled, exercise.tracking)
          ? { ...filled, done: true, doneAt: at }
          : set,
      ),
    })),
  }
}

/** Seconds logged against timed sets that were ticked: a game, a run, a plank. */
export function timedSeconds(workout: LiveWorkout): number {
  let total = 0
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) if (set.done) total += set.durationS ?? 0
  }
  return total
}

/** How many sets were actually done, which is what decides there is anything to save. */
export function doneSets(workout: LiveWorkout): number {
  return workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.done).length,
    0,
  )
}

// ---------------------------------------------------------------------------
// Saving.
// ---------------------------------------------------------------------------

const round = (value: number | null, places: number) =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places

/**
 * A number held inside the range its column checks. The server refuses a whole
 * workout for one value outside it, so a typo (2250 lb for 225) has to become a
 * wrong set rather than a lost session; the set can be edited afterwards.
 */
const within = (value: number | null, min: number, max: number) =>
  value === null || !Number.isFinite(value) ? null : Math.min(max, Math.max(min, value))

const clip = (text: string, length: number) => text.slice(0, length)

/**
 * The document `save_workout` takes. Only ticked sets are saved, and an
 * exercise none of whose sets were ticked is left out: the plan said squats,
 * but if nobody squatted, the workout had no squats in it.
 *
 * Every value is held to the limits the tables check (42_workouts.sql).
 */
export function toPayload(
  workout: LiveWorkout,
  endedAt: number,
  extra: { kcal: number | null; healthWorkoutId: string | null },
): WorkoutDocument {
  return {
    id: workout.id,
    name: clip(workout.name.trim(), 80) || 'Workout',
    notes: clip(workout.notes.trim(), 2000) || null,
    started_at: new Date(workout.startedAt).toISOString(),
    ended_at: new Date(Math.max(endedAt, workout.startedAt)).toISOString(),
    // The day it started on, in the phone's own zone.
    log_date: dateKey(new Date(workout.startedAt)),
    routine_id: workout.routineId,
    kcal: within(extra.kcal === null ? null : Math.round(extra.kcal), 0, 10000),
    health_workout_id: extra.healthWorkoutId,
    exercises: workout.exercises
      .map((exercise) => ({
        exercise_id: clip(exercise.exerciseId, 80),
        exercise_name: clip(exercise.name.trim(), 120) || exercise.exerciseId,
        tracking: exercise.tracking,
        superset: within(exercise.superset, 0, 99),
        rest_s: within(exercise.restS, 0, 3600),
        notes: clip(exercise.notes.trim(), 1000) || null,
        sets: exercise.sets
          .filter((set) => set.done)
          .slice(0, 99)
          .map((set) => ({
            kind: set.kind,
            weight_kg: within(round(set.weightKg, 2), 0, 1000),
            reps: within(set.reps === null ? null : Math.round(set.reps), 0, 1000),
            duration_s: within(set.durationS === null ? null : Math.round(set.durationS), 0, 86400),
            distance_m: within(round(set.distanceM, 1), 0, 1_000_000),
            rpe: set.rpe === null || set.rpe < 1 || set.rpe > 10 ? null : set.rpe,
          })),
      }))
      .filter((exercise) => exercise.sets.length > 0)
      .slice(0, 60),
  }
}
