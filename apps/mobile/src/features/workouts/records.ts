import type { ExerciseBests } from '@/data'
import { estimatedOneRepMax, type LiveExercise, setVolume } from './model'

/**
 * Which ticked sets of a workout in progress would be personal records.
 *
 * The saved workout's records are Postgres's (`workout_set_details`), and this
 * applies the same rule to a workout the server has not seen yet, so the
 * trophy can appear the moment the set is ticked rather than after saving: a
 * record beats the best of every earlier workout and is the best of its kind
 * in this one. An exercise never done before has nothing to beat, so its first
 * workout sets the baseline and wins nothing, exactly as on the server.
 */

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration' | 'distance'

export function recordSets(
  exercise: LiveExercise,
  bests: ExerciseBests | undefined,
): Map<string, RecordKind[]> {
  const out = new Map<string, RecordKind[]>()
  if (!bests) return out

  const working = exercise.sets.filter((set) => set.done && set.kind !== 'warmup')
  const mark = (id: string | undefined, kind: RecordKind) => {
    if (!id) return
    out.set(id, [...(out.get(id) ?? []), kind])
  }

  // The first set with the highest score, or with `tie` the one ahead on it,
  // which is the order `workout_set_details` ranks a workout's sets in.
  const best = (
    score: (set: (typeof working)[number]) => number | null,
    tie?: (set: (typeof working)[number]) => number,
  ) => {
    let winner: (typeof working)[number] | undefined
    let value = -Infinity
    for (const set of working) {
      const next = score(set)
      if (next === null) continue
      if (next > value || (next === value && winner && tie && tie(set) > tie(winner))) {
        value = next
        winner = set
      }
    }
    return winner ? { id: winner.id, value } : undefined
  }

  const tracking = exercise.tracking
  if (
    tracking === 'weight_reps' ||
    tracking === 'weighted_reps' ||
    tracking === 'weight_distance'
  ) {
    // Lifted, not just loaded: a missed rep (150 x 0) or a carry that went
    // nowhere is not the heaviest anything. `weight_counts` on the server.
    const lifted = (set: (typeof working)[number]) =>
      tracking === 'weight_distance' ? (set.distanceM ?? 0) > 0 : (set.reps ?? 0) >= 1
    // Two sets at the same weight: the one with more reps holds it.
    const heaviest = best(
      (set) => (set.weightKg && set.weightKg > 0 && lifted(set) ? set.weightKg : null),
      (set) => set.reps ?? 0,
    )
    if (heaviest && bests.bestWeightKg !== null && heaviest.value > bests.bestWeightKg) {
      mark(heaviest.id, 'weight')
    }
  }
  if (tracking === 'weight_reps') {
    const strongest = best((set) => estimatedOneRepMax(set.weightKg, set.reps))
    if (strongest && bests.bestE1rmKg !== null && strongest.value > bests.bestE1rmKg) {
      mark(strongest.id, 'e1rm')
    }
  }
  if (tracking === 'weight_reps' || tracking === 'weighted_reps') {
    const biggest = best((set) => setVolume(set, tracking))
    if (biggest && bests.bestSetVolumeKg !== null && biggest.value > bests.bestSetVolumeKg) {
      mark(biggest.id, 'volume')
    }
  }
  if (tracking === 'reps' || tracking === 'weighted_reps' || tracking === 'assisted_reps') {
    const most = best((set) => set.reps)
    if (most && bests.bestReps !== null && most.value > bests.bestReps) mark(most.id, 'reps')
  }
  if (tracking === 'duration' || tracking === 'distance_duration') {
    const longest = best((set) => set.durationS)
    if (longest && bests.bestDurationS !== null && longest.value > bests.bestDurationS) {
      mark(longest.id, 'duration')
    }
  }
  if (tracking === 'distance_duration' || tracking === 'weight_distance') {
    // To the tenth of a metre the database keeps: a run typed in miles is
    // otherwise a hair longer than the same run saved last week.
    const furthest = best((set) =>
      set.distanceM && set.distanceM > 0 ? Math.round(set.distanceM * 10) / 10 : null,
    )
    if (furthest && bests.bestDistanceM !== null && furthest.value > bests.bestDistanceM) {
      mark(furthest.id, 'distance')
    }
  }
  return out
}
