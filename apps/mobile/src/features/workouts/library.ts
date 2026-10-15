import { useMemo } from 'react'

import { useCustomExercises } from '@/data'
import { EXERCISES } from './catalogue'
import { fromCatalogue, fromCustom } from './search'

export {
  cleanSplit,
  groupSplit,
  type LibraryExercise,
  type LibraryFilters,
  planFor,
  primaryMuscle,
  rankedMuscles,
  searchExercises,
} from './search'

/**
 * The library with the user's own exercises in it, first, ahead of the
 * catalogue: somebody who made an exercise is usually looking for it.
 */
const BUILT_IN = EXERCISES.map(fromCatalogue)

export function useExerciseLibrary() {
  const { data: custom } = useCustomExercises()

  return useMemo(() => {
    const all = [...(custom ?? []).map(fromCustom), ...BUILT_IN]
    const map = new Map(all.map((exercise) => [exercise.id, exercise]))
    return { all, byId: (id: string) => map.get(id) }
  }, [custom])
}
