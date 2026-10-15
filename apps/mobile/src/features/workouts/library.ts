import { type CustomExercise, useCustomExercises } from '@/data'
import { EXERCISES } from './catalogue'
import { fromCatalogue, fromCustom, type LibraryExercise } from './search'

export {
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
 *
 * Built once per answer from the server and shared, rather than per caller:
 * every history card and Today row asks for it, and each built its own map.
 */
const BUILT_IN = EXERCISES.map(fromCatalogue)
const NONE: CustomExercise[] = []
const built = new WeakMap<readonly CustomExercise[], ExerciseLibrary>()

export type ExerciseLibrary = {
  all: LibraryExercise[]
  byId: (id: string) => LibraryExercise | undefined
}

export function useExerciseLibrary(): ExerciseLibrary {
  const custom = useCustomExercises().data ?? NONE
  let library = built.get(custom)
  if (!library) {
    const all = [...custom.map(fromCustom), ...BUILT_IN]
    const map = new Map(all.map((exercise) => [exercise.id, exercise]))
    library = { all, byId: (id) => map.get(id) }
    built.set(custom, library)
  }
  return library
}
