import type { ImportPlan } from './build'

/**
 * Which planned workouts are already in the history, worked out from what the
 * history holds around the file's dates. Pure, so `useWorkoutImport` and the
 * preview share it and it can be tested without a server.
 */

/** A workout already in the history, as `workout_summaries` gives it. */
export type Logged = { id: string; start: number; name: string; sets: number }

const SAME_SESSION_MS = 60_000
const SHIFT_MAX_MS = 14 * 3_600_000
/** Time-zone offsets come in quarter hours (Nepal's is +5:45). */
const OFFSET_STEP_MS = 15 * 60_000

const nameKey = (name: string) => name.trim().toLowerCase()

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
): Set<string> {
  const sorted = [...logged].sort((a, b) => a.start - b.start)
  const used = new Set<number>()
  const found = new Set<string>()
  // Ids first, so another planned workout cannot take the logged copy of one
  // that is simply already there.
  for (const { document } of plan.workouts) {
    if (!saved.has(document.id)) continue
    found.add(document.id)
    const index = sorted.findIndex((workout) => workout.id === document.id)
    if (index !== -1) used.add(index)
  }
  for (const { document } of plan.workouts) {
    if (found.has(document.id)) continue
    const start = new Date(document.started_at).getTime()
    const name = nameKey(document.name)
    const sets = document.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
    let best = -1
    let bestApart = Number.POSITIVE_INFINITY
    for (let index = firstFrom(sorted, start - SHIFT_MAX_MS); index < sorted.length; index++) {
      const workout = sorted[index]
      if (workout.start > start + SHIFT_MAX_MS) break
      if (used.has(index)) continue
      const apart = Math.abs(workout.start - start)
      const offBy = apart % OFFSET_STEP_MS
      const shifted =
        workout.name === name &&
        workout.sets === sets &&
        Math.min(offBy, OFFSET_STEP_MS - offBy) < SAME_SESSION_MS
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
