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

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration'

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

  const best = (score: (set: (typeof working)[number]) => number | null) => {
    let winner: (typeof working)[number] | undefined
    let value = -Infinity
    for (const set of working) {
      const next = score(set)
      if (next !== null && next > value) {
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
    const heaviest = best((set) =>
      set.weightKg && set.weightKg > 0 && lifted(set) ? set.weightKg : null,
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
  return out
}
