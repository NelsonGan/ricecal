import { dateKey } from '@/data/client'
import type { WorkoutDocument } from '@/data/workout-outbox'
import { Constants, type Enums } from '@/lib/database.types'
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

export type SetKind = Enums<'workout_set_kind'>
export const SET_KINDS: readonly SetKind[] = Constants.public.Enums.workout_set_kind

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
  /**
   * The day a finished workout being edited is filed under, with the start it
   * was filed from. Kept while the start stays put, so renaming a Tokyo
   * morning workout from London does not move it to the day before.
   */
  filed?: { startedAt: number; date: string }
  /**
   * The Apple Watch's part in it. `recorded` is set once the watch has begun
   * a workout session for it, which saves its own copy to Apple Health, so the
   * phone writes none beside it. `appliedSeq` is the last of the watch's
   * commands applied, so a list sent again is applied from where it got to
   * (`watch.ts`). `kcal` is the energy the watch measured, carried by an edit
   * so it is not replaced by an estimate. Absent on every workout the watch
   * never touched.
   */
  watch?: { recorded: boolean; appliedSeq: number; kcal?: number | null }
}

let counter = 0
/** Local keys for list rows. Not ids anything outside this document sees. */
function localKey(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * RFC 4122 v4, for the workout id the server will store. Hermes has no
 * `crypto.getRandomValues` and nothing here adds one, so on a phone these are
 * `Math.random`'s 122 bits from a randomly seeded generator: unique enough,
 * and an id that did collide with another account's is refused by
 * `save_workout` rather than written over.
 */
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
  /** Only for a workout started on the watch, which names its sets itself. */
  id?: string
  kind?: SetKind
  weightKg?: number | null
  reps?: number | null
  durationS?: number | null
  distanceM?: number | null
}

function setFromPlan(set: SetPlan): LiveSet {
  return {
    ...emptySet(set.kind ?? 'normal'),
    ...(set.id ? { id: set.id } : null),
    weightKg: set.weightKg ?? null,
    reps: set.reps ?? null,
    durationS: set.durationS ?? null,
    distanceM: set.distanceM ?? null,
  }
}

export type ExercisePlan = {
  /** Only for a workout started on the watch, as `SetPlan.id`. */
  key?: string
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
    key: plan.key ?? localKey(),
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
  /** The watch's, for a workout started there. Minted here otherwise. */
  id?: string
  name: string
  startedAt?: number
  routineId?: string | null
  exercises?: ExercisePlan[]
}): LiveWorkout {
  return {
    id: input.id ?? uuid(),
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
  | { type: 'addSet'; key: string }
  | { type: 'addSets'; key: string; sets: SetPlan[]; atStart?: boolean }
  | { type: 'removeSet'; key: string; setId: string }
  | { type: 'updateSet'; key: string; setId: string; patch: SetPatch }
  | { type: 'completeSet'; key: string; setId: string; at: number; fill?: SetPatch }
  | { type: 'uncompleteSet'; key: string; setId: string }
  | { type: 'startRest'; exerciseKey: string; totalS: number; at: number }
  | { type: 'adjustRest'; byS: number; at: number }
  | { type: 'stopRest' }
  | { type: 'staleAnswered' }
  /** The watch began recording this workout. */
  | { type: 'watchRecorded' }
  /** The watch's commands up to this one have been applied. */
  | { type: 'watchApplied'; seq: number }

const mapExercise = (
  workout: LiveWorkout,
  key: string,
  fn: (exercise: LiveExercise) => LiveExercise,
): LiveWorkout => ({
  ...workout,
  exercises: workout.exercises.map((exercise) => (exercise.key === key ? fn(exercise) : exercise)),
})

/** The exercise with one of its sets changed by `fn`. */
export const mapSet = (
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
      // A different kind of exercise keeps only what it records: a bench set
      // replaced by a plank had saved as a plank holding 60 kg for 8.
      return mapExercise(workout, action.key, (exercise) => {
        const tracking = action.plan.tracking
        const replaced = {
          ...exercise,
          exerciseId: action.plan.exerciseId,
          name: action.plan.name,
          tracking,
        }
        if (tracking === exercise.tracking) return replaced
        const fields = new Set(fieldsFor(tracking))
        return {
          ...replaced,
          sets: exercise.sets.map((set) => {
            const kept: LiveSet = {
              ...set,
              weightKg: fields.has('weight') ? set.weightKg : null,
              reps: fields.has('reps') ? set.reps : null,
              durationS: fields.has('duration') ? set.durationS : null,
              distanceM: fields.has('distance') ? set.distanceM : null,
              // RPE rates reps: a bench set rated 8 that becomes a plank is not.
              rpe: fields.has('reps') ? set.rpe : null,
            }
            return kept.done && !isLoggable(kept, tracking)
              ? { ...kept, done: false, doneAt: null }
              : kept
          }),
        }
      })
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
      return { ...workout, exercises: tidySupersets(exercises) }
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
      // Empty, and offered a figure by `setHints` like any other set: the row
      // above, unless last time had a set here. Copying the row above as typed
      // values hid last time's 100 x 5 under a third set of 100 x 10.
      return mapExercise(workout, action.key, (exercise) => ({
        ...exercise,
        sets: [...exercise.sets, emptySet()],
      }))
    case 'addSets':
      return mapExercise(workout, action.key, (exercise) => {
        const added = action.sets.map(setFromPlan)
        return {
          ...exercise,
          sets: action.atStart ? [...added, ...exercise.sets] : [...exercise.sets, ...added],
        }
      })
    case 'watchRecorded':
      return { ...workout, watch: { appliedSeq: 0, ...workout.watch, recorded: true } }
    case 'watchApplied':
      return {
        ...workout,
        watch: {
          ...workout.watch,
          recorded: workout.watch?.recorded ?? false,
          appliedSeq: Math.max(workout.watch?.appliedSeq ?? 0, action.seq),
        },
      }
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
        mapSet(exercise, action.setId, (set) => tickedSet(set, action.at, action.fill)),
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
 * after the last exercise of the round, not between its members, and a round
 * ends early where the partners after this one have no set that far down: with
 * A at three sets and B at two, A's third set is the end of its round.
 */
export function restAfter(
  workout: LiveWorkout,
  exercise: LiveExercise,
  defaultRestS: number,
  setId: string,
): number {
  if (exercise.superset !== null) {
    const group = workout.exercises.filter((entry) => entry.superset === exercise.superset)
    const after = group.slice(group.findIndex((entry) => entry.key === exercise.key) + 1)
    const index = exercise.sets.findIndex((set) => set.id === setId)
    if (after.some((entry) => entry.sets.length > Math.max(0, index))) return 0
  }
  return exercise.restS ?? defaultRestS
}

/** Which sets pair with which: a warm-up is never a working set's last time, nor a drop set. */
const pairing = (kind: SetKind | undefined) =>
  kind === 'warmup' || kind === 'drop' ? kind : 'work'

/**
 * For each of today's sets, the position of its counterpart in `other`:
 * warm-ups with warm-ups, drop sets with drop sets, the rest with the rest,
 * each in order. Lined up by position, last week's two warm-ups fed this
 * week's first two working sets (40 x 10 offered on a 100 kg day), adding
 * warm-ups today pushed every working set off its own last time, and a drop
 * set was offered the 100 x 5 of the working set it followed.
 *
 * The PREVIOUS column and a routine's update both pair this way.
 */
export function pairSets(
  sets: readonly { kind?: SetKind }[],
  other: readonly ({ kind?: SetKind } | undefined)[],
): (number | undefined)[] {
  const queues = new Map<string, number[]>()
  other.forEach((set, index) => {
    if (!set) return
    const key = pairing(set.kind)
    const queue = queues.get(key) ?? []
    queue.push(index)
    queues.set(key, queue)
  })
  return sets.map((set) => queues.get(pairing(set.kind))?.shift())
}

/** Last time's set for each of today's, paired as `pairSets` pairs them. */
export function matchPrevious<T extends { kind?: SetKind }>(
  sets: readonly { kind: SetKind }[],
  previous: readonly (T | undefined)[] | null | undefined,
): (T | undefined)[] {
  if (!previous) return sets.map(() => undefined)
  return pairSets(sets, previous).map((at) => (at === undefined ? undefined : previous[at]))
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
  /** `matchPrevious(sets, previous)`, for a caller that has already worked it out. */
  matched: readonly (SetPatch | undefined)[] = matchPrevious(sets, previous),
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
    // A set put back to last time's figure ends the change above it, or a 105
    // typed into set 1 went on being offered under a set 2 typed back to 100.
    const own = set[field]
    if (own !== null) carry.typed[field] = own !== (last?.[field] ?? null) ? own : null
    carry.shown[field] = set[field] ?? hint
    return hint
  }
  return sets.map((set, index) => {
    const carry = set.kind === 'warmup' ? above.warmup : above.working
    const last = matched[index]
    return {
      weightKg: column('weightKg', set, carry, last),
      reps: column('reps', set, carry, last),
      durationS: column('durationS', set, carry, last),
      distanceM: column('distanceM', set, carry, last),
    }
  })
}

/**
 * A set as ticking it leaves it, with what it offers in its blanks. Exported so
 * a tick can be tried before it is made: what it fills in decides whether the
 * set can be ticked at all.
 */
export const tickedSet = (set: LiveSet, at: number, fill?: SetPatch): LiveSet => ({
  ...set,
  ...fillBlanks(set, fill),
  done: true,
  doneAt: at,
})

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
 * The cards in the runs they are done in: a superset's neighbouring cards
 * together, every other card alone. The rest timer, the lock screen's next set
 * and the keyboard's Next all walk a workout this way.
 */
export function supersetRuns<T extends { superset: number | null }>(
  exercises: readonly T[],
): T[][] {
  const runs: T[][] = []
  for (let start = 0; start < exercises.length; ) {
    const group = exercises[start].superset
    let end = start + 1
    if (group !== null) while (end < exercises.length && exercises[end].superset === group) end += 1
    runs.push(exercises.slice(start, end))
    start = end
  }
  return runs
}

/**
 * A superset is a run of neighbouring cards sharing a number, and nothing else
 * is. Removing a partner left one card alone under the bracket; reordering, or
 * unlinking the middle of three, left a group split around another card, which
 * the rest timer and the lock screen then each read differently. Every change
 * that can do that ends here: a run of one is unlinked, and a group that comes
 * back after a gap is given a number of its own.
 */
export function tidySupersets<T extends { superset: number | null }>(exercises: readonly T[]): T[] {
  const seen = new Set<number>()
  for (const exercise of exercises) if (exercise.superset !== null) seen.add(exercise.superset)
  let spare = 0
  const fresh = () => {
    while (seen.has(spare)) spare += 1
    seen.add(spare)
    return spare
  }
  const used = new Set<number>()
  const out: T[] = []
  for (const run of supersetRuns(exercises)) {
    const group = run[0].superset
    if (group === null) out.push(...run)
    else if (run.length < 2) out.push({ ...run[0], superset: null })
    else {
      const number = used.has(group) ? fresh() : group
      used.add(number)
      out.push(
        ...run.map((exercise) => (number === group ? exercise : { ...exercise, superset: number })),
      )
    }
  }
  return out
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

/** Whether any field of a set holds a number: what `save_workout` requires of a set. */
export const hasFigures = (set: Pick<LiveSet, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>) =>
  set.weightKg !== null || set.reps !== null || set.durationS !== null || set.distanceM !== null

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
 * plank has none, and "0 kg" under it is a figure about nothing; an empty
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
  // In cents, as Postgres's numeric does it: 95 lb is 43.09 kg, and 43.09 x 5
  // in floating point is 215.45000000000002, a record over a stored 215.45.
  return Math.round(Math.round(set.weightKg * 100) * set.reps) / 100
}

/** Epley, over 1 to 15 reps. Matches `workout_set_details`. */
export function estimatedOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > 15) return null
  if (reps === 1) return weightKg
  // weight x (30 + reps) / 30, in cents, rounded as `workout_set_values` rounds
  // it. Floating point put 56.25 x 4 at 63.75000000000001, a 63.8 the
  // database called 63.7, and a trophy the saved workout did not have.
  return Math.round((Math.round(weightKg * 100) * (30 + reps)) / 300) / 10
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
type PreviousSets = Readonly<Record<string, readonly SetPatch[] | undefined>>

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
 * blanks. "Complete unfinished sets" on a forgotten checkmark.
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

/** Seconds logged against timed sets that were ticked: a run, a plank. */
export function timedSeconds(workout: LiveWorkout): number {
  let total = 0
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) if (set.done) total += set.durationS ?? 0
  }
  return total
}

/** How many sets were actually done, which is what decides there is anything to save. */
export const doneSets = (workout: LiveWorkout): number => liveTotals(workout).done

// ---------------------------------------------------------------------------
// Saving.
// ---------------------------------------------------------------------------

/**
 * Kilograms to the two places the database keeps, and metres to its one. A
 * number typed, converted or imported goes through these before it is
 * compared or saved: 135 lb unrounded never equals the same 135 lb saved last
 * week, and read as a new record.
 */
export const roundKg = (kg: number) => Math.round(kg * 100) / 100
export const roundMetres = (metres: number) => Math.round(metres * 10) / 10

/** The limits the tables check (`42_workouts.sql`), which every save is held to. */
export const LIMIT = {
  exercises: 60,
  sets: 99,
  name: 80,
  exerciseId: 80,
  exerciseName: 120,
  notes: 2000,
  exerciseNotes: 1000,
  kcal: 10_000,
  superset: 99,
  restS: 3600,
  kg: 1000,
  reps: 1000,
  durationS: 86_400,
  metres: 1_000_000,
  workoutS: 24 * 3600,
} as const

/**
 * A number rounded as its column keeps it and held inside the range it checks,
 * which starts at 0 for every one. The server refuses a whole workout for one
 * value outside it, so a typo (2250 lb for 225) has to become a wrong set
 * rather than a lost session; the set can be edited afterwards.
 */
const within = (value: number | null, max: number, round = (n: number) => n) =>
  value === null || !Number.isFinite(value) ? null : Math.min(max, Math.max(0, round(value)))

/**
 * A string cut to a length in characters, as Postgres counts them, with no
 * space left dangling at the cut. Cutting UTF-16 units split an emoji at the
 * limit and left half of it, which the database's JSON reader refuses, so the
 * save of a long "Push Day 💪" failed.
 */
export function clip(text: string, length: number): string {
  const characters = Array.from(text)
  return characters.length > length ? characters.slice(0, length).join('').trimEnd() : text
}

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
    name: clip(workout.name.trim(), LIMIT.name) || 'Workout',
    notes: clip(workout.notes.trim(), LIMIT.notes) || null,
    started_at: new Date(workout.startedAt).toISOString(),
    ended_at: new Date(Math.max(endedAt, workout.startedAt)).toISOString(),
    // The day it started on, in the phone's own zone.
    log_date:
      workout.filed && workout.filed.startedAt === workout.startedAt
        ? workout.filed.date
        : dateKey(new Date(workout.startedAt)),
    routine_id: workout.routineId,
    kcal: within(extra.kcal, LIMIT.kcal, Math.round),
    health_workout_id: extra.healthWorkoutId,
    // Tidied after the empty ones go: a superset whose partner was never done
    // is a single exercise, not a bracket of one that a repeat brings back.
    exercises: tidySupersets(
      workout.exercises
        .map((exercise) => ({
          exercise_id: clip(exercise.exerciseId, LIMIT.exerciseId),
          exercise_name: clip(exercise.name.trim(), LIMIT.exerciseName) || exercise.exerciseId,
          tracking: exercise.tracking,
          superset: within(exercise.superset, LIMIT.superset),
          rest_s: within(exercise.restS, LIMIT.restS),
          notes: clip(exercise.notes.trim(), LIMIT.exerciseNotes) || null,
          // Ticked and with a number in it: a ticked set's fields stay editable,
          // and one cleared afterwards is refused by `save_workout`, which would
          // turn the whole save into a final refusal.
          sets: exercise.sets
            .filter((set) => set.done && hasFigures(set))
            .slice(0, LIMIT.sets)
            .map((set) => ({
              kind: set.kind,
              weight_kg: within(set.weightKg, LIMIT.kg, roundKg),
              reps: within(set.reps, LIMIT.reps, Math.round),
              duration_s: within(set.durationS, LIMIT.durationS, Math.round),
              distance_m: within(set.distanceM, LIMIT.metres, roundMetres),
              rpe: set.rpe === null || set.rpe < 1 || set.rpe > 10 ? null : set.rpe,
            })),
        }))
        .filter((exercise) => exercise.sets.length > 0)
        .slice(0, LIMIT.exercises),
    ),
  }
}
