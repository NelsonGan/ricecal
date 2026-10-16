/**
 * What crosses between the phone and the Apple Watch app.
 *
 * The phone is the record of a running workout, as it is for the Live
 * Activity: the document in MMKV that the logger edits. The watch draws a copy
 * the phone sends it (`WatchState`) and asks for changes (`WatchCommand`),
 * which the phone applies through the same actions the logger uses. Each
 * command carries an id, and the state names the ids already applied, so the
 * watch can draw its own presses at once and drop each one when the phone's
 * copy has caught up with it.
 *
 * Mirrored in Swift by `watch/ios/WatchProtocol.swift`. A field added here has
 * to be added there, optional on both sides: a watch app and a phone app are
 * updated separately, and each must read what the other's older build sends.
 */

export type WatchTracking =
  | 'weight_reps'
  | 'reps'
  | 'weighted_reps'
  | 'assisted_reps'
  | 'duration'
  | 'distance_duration'
  | 'weight_distance'

export type WatchSetKind = 'normal' | 'warmup' | 'drop' | 'failure'

/** A set's figures, in kilograms, seconds and metres whatever the user reads them in. */
export type WatchFigures = {
  weightKg: number | null
  reps: number | null
  durationS: number | null
  distanceM: number | null
}

/**
 * A set as the watch draws it. Its figures are the ones it shows, typed or
 * offered: an empty set offers what the logger would (`setHints`), a figure
 * above it or last time's, so completing it on the watch saves what the phone
 * would have saved.
 */
export type WatchSet = WatchFigures & {
  id: string
  kind: WatchSetKind
  done: boolean
  /** Seconds of rest completing it starts. 0 between the members of a superset round. */
  restS: number
  /** A routine's own figures, before anything was offered. Only on routines. */
  plan?: WatchFigures
}

export type WatchExercise = {
  key: string
  exerciseId: string
  name: string
  tracking: WatchTracking
  superset: number | null
  /** The exercise's own rest, or null for the account's default. Only on routines. */
  ownRestS?: number | null
  sets: WatchSet[]
}

export type WatchWorkout = {
  id: string
  name: string
  /** Epoch ms. */
  startedAt: number
  rest: { endsAt: number; totalS: number } | null
  /** Whether the watch has said it is recording this workout. */
  recorded: boolean
  /** The watch's commands this copy already includes. */
  applied: string[]
  exercises: WatchExercise[]
}

export type WatchRoutine = {
  id: string
  name: string
  exercises: WatchExercise[]
}

/** A workout that is no longer running, so the watch can end its session. */
export type WatchEnded = { id: string; saved: boolean; at: number }

export type WatchState = {
  v: 1
  /** When the phone made it, so the watch can ignore one older than what it drew. */
  rev: number
  signedIn: boolean
  unit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
  workout: WatchWorkout | null
  ended: WatchEnded[]
  routines: WatchRoutine[]
  /** The watch's words in the phone's language. The watch has English of its own. */
  labels: Record<string, string>
}

type CommandBase = {
  id: string
  workoutId: string
  /** Epoch ms of the press, on the watch's clock. */
  at: number
}

export type WatchStartExercise = {
  key: string
  exerciseId: string
  name: string
  tracking: WatchTracking
  restS: number | null
  superset: number | null
  sets: (WatchFigures & { id: string; kind: WatchSetKind })[]
}

export type WatchCommand = CommandBase &
  (
    | { type: 'start'; routineId: string | null; name: string; exercises: WatchStartExercise[] }
    | ({ type: 'complete'; exerciseKey: string; setId: string; restS: number } & WatchFigures)
    | { type: 'uncomplete'; exerciseKey: string; setId: string }
    | { type: 'addSet'; exerciseKey: string; setId: string }
    | { type: 'restAdjust'; byS: number }
    | { type: 'restSkip' }
    | { type: 'recording' }
    | { type: 'finish'; endedAt: number }
    | { type: 'discard' }
  )

/** The watch's heart rate trace for a workout, sent once its session has ended. */
export type WatchHeartTrace = {
  workoutId: string
  startedAt: number
  intervalS: number
  bpm: (number | null)[]
  activeKcal: number | null
  healthWorkoutId: string | null
}

/** What the watch sent while JS was not there to hear it, in arrival order. */
export type WatchInboxItem =
  | { kind: 'command'; command: WatchCommand }
  | { kind: 'heart'; trace: WatchHeartTrace }

export type WatchStatus = { paired: boolean; installed: boolean; reachable: boolean }

/** The latest reading the watch streamed while the phone could hear it. */
export type WatchPulse = { workoutId: string; bpm: number; at: number }
