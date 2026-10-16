import type { ImportPlan } from './build'

/**
 * Which planned workouts are already in the history, worked out from what the
 * history holds around the file's dates. Pure, so `useWorkoutImport` and the
 * preview share it and it can be tested without a server.
 */

/** A workout already in the history, from `workout_summaries`, its name already through `nameKey`. */
export type Logged = { id: string; start: number; name: string; sets: number }

const SAME_SESSION_MS = 60_000
/** No zone is further than 14 hours from UTC. */
const SHIFT_MAX_MS = 14 * 3_600_000

/** A workout's name as two copies of it are compared: trimmed, any case. */
export const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * How far Hevy's import of a Strong history moved a workout: the phone's UTC
 * offset on that date, since Hevy read Strong's wall-clock times as UTC. On
 * that date rather than today's, so a summer workout carries summer time.
 * Any whole quarter hour up to 14 hours matched too much: a "Push" on
 * Tuesday morning was taken for a "Push" on Monday evening and skipped.
 */
const shiftOn = (at: number) => Math.abs(new Date(at).getTimezoneOffset()) * 60_000

/** The index of the first logged workout starting at or after `at`. */
function firstFrom(logged: Logged[], at: number): number {
  let low = 0
  let high = logged.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (logged[middle].start < at) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Which planned workouts are already in the history. Each logged workout
 * stands for at most one planned one, nearest first: matched freely, one
 * morning run already logged also covered an evening run in the file with the
 * same name and one set, and the new run was skipped.
 */
export function matchLogged(
  plan: ImportPlan,
  logged: Logged[],
  saved: ReadonlySet<string>,
  /** The shift on a date; the phone's own, or a fixed one in tests. */
  shiftAt: (at: number) => number = shiftOn,
): Set<string> {
  const sorted = [...logged].sort((a, b) => a.start - b.start)
  const position = new Map(sorted.map((workout, index) => [workout.id, index]))
  const used = new Set<number>()
  const found = new Set<string>()
  // Ids first, so another planned workout cannot take the logged copy of one
  // that is simply already there.
  for (const { document } of plan.workouts) {
    if (!saved.has(document.id)) continue
    found.add(document.id)
    const index = position.get(document.id)
    if (index !== undefined) used.add(index)
  }
  for (const { document } of plan.workouts) {
    if (found.has(document.id)) continue
    const start = new Date(document.started_at).getTime()
    const name = nameKey(document.name)
    const sets = document.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
    const shift = shiftAt(start)
    let best = -1
    let bestApart = Number.POSITIVE_INFINITY
    for (let index = firstFrom(sorted, start - SHIFT_MAX_MS); index < sorted.length; index++) {
      const workout = sorted[index]
      if (workout.start > start + SHIFT_MAX_MS) break
      if (used.has(index)) continue
      const apart = Math.abs(workout.start - start)
      const shifted =
        shift > 0 &&
        nameKey(workout.name) === name &&
        workout.sets === sets &&
        Math.abs(apart - shift) < SAME_SESSION_MS
      if ((apart < SAME_SESSION_MS || shifted) && apart < bestApart) {
        best = index
        bestApart = apart
      }
    }
    if (best !== -1) {
      used.add(best)
      found.add(document.id)
    }
  }
  return found
}
