import type { CustomExercise } from '@/data/workouts'
import {
  CATEGORIES,
  type Category,
  EQUIPMENT,
  type Equipment,
  type Exercise,
  type Level,
  MUSCLE_GROUP,
  MUSCLES,
  type Muscle,
  type MuscleGroup,
  type MuscleSplit,
  type Tracking,
} from './catalogue'
import type { ExercisePlan } from './model'

/**
 * The exercise library as the screens see it: the built-in catalogue and the
 * user's own exercises, in one list with one shape, and how it is searched.
 *
 * Pure, and importing only types from the data layer, so it can be tested
 * without the native modules the `@/data` barrel brings with it. The hook that
 * reads the user's own exercises is `library.ts`.
 */

export type LibraryExercise = {
  id: string
  name: string
  category: Category
  tracking: Tracking
  equipment: Equipment
  level: Level
  muscles: MuscleSplit
  aliases?: string[]
  custom: boolean
}

/** A stored category or equipment, or the fallback for one this version does not know. */
export const asCategory = (value: string): Category =>
  (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'fullBody'
export const asEquipment = (value: string): Equipment =>
  (EQUIPMENT as readonly string[]).includes(value) ? (value as Equipment) : 'other'

/** Only the muscles the app knows, with shares that add up to one. */
export function cleanSplit(raw: Record<string, number>): MuscleSplit {
  const entries = Object.entries(raw).filter(
    ([muscle, share]) =>
      (MUSCLES as readonly string[]).includes(muscle) && Number.isFinite(share) && share > 0,
  )
  const total = entries.reduce((sum, [, share]) => sum + share, 0)
  if (!total) return {}
  return Object.fromEntries(
    entries.map(([muscle, share]) => [muscle, share / total]),
  ) as MuscleSplit
}

export function fromCatalogue(exercise: Exercise): LibraryExercise {
  return { ...exercise, custom: false }
}

export function fromCustom(exercise: CustomExercise): LibraryExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    category: asCategory(exercise.category),
    tracking: exercise.tracking,
    equipment: asEquipment(exercise.equipment),
    level: 'beginner',
    muscles: cleanSplit(exercise.muscles),
    custom: true,
  }
}

export type LibraryFilters = {
  category?: Category | null
  equipment?: Equipment | null
  level?: Level | null
  muscle?: Muscle | null
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    // Letters and digits in any script, everything else a space. Spelled as a
    // range rather than `\p{L}`, which not every JS engine the app has shipped
    // on understands.
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ')
    .trim()

/**
 * Filters, then ranks by how the query matches: the start of the name first,
 * then the start of a word in it, then anywhere in the name or an alias. Every
 * word of the query has to match somewhere, so "db row" finds the dumbbell row
 * through its alias and "row cable" finds the seated cable row.
 */
export function searchExercises(
  list: readonly LibraryExercise[],
  query: string,
  filters: LibraryFilters = {},
): LibraryExercise[] {
  const filtered = list.filter(
    (exercise) =>
      (!filters.category || exercise.category === filters.category) &&
      (!filters.equipment || exercise.equipment === filters.equipment) &&
      (!filters.level || exercise.level === filters.level) &&
      (!filters.muscle || (exercise.muscles[filters.muscle] ?? 0) > 0),
  )

  const words = normalise(query).split(' ').filter(Boolean)
  if (!words.length) return filtered

  const scored: { exercise: LibraryExercise; score: number }[] = []
  for (const exercise of filtered) {
    const name = normalise(exercise.name)
    const haystack = [name, ...(exercise.aliases ?? []).map(normalise)].join(' | ')
    if (!words.every((word) => haystack.includes(word))) continue
    const phrase = words.join(' ')
    let score = 3
    if (name.startsWith(phrase)) score = 0
    else if (name.split(' ').some((part) => part.startsWith(words[0]))) score = 1
    else if (name.includes(words[0])) score = 2
    scored.push({ exercise, score })
  }
  // Ties keep the list's own order rather than going alphabetical: the user's
  // own exercises come first, and the catalogue lists each body part's main
  // lifts before their variations, so "bench" finds the bench press before
  // the bench dip.
  scored.sort((a, b) => a.score - b.score)
  return scored.map((entry) => entry.exercise)
}

/** The muscle an exercise works most. */
export function primaryMuscle(split: MuscleSplit): Muscle | undefined {
  let best: Muscle | undefined
  let share = 0
  for (const muscle of MUSCLES) {
    const value = split[muscle] ?? 0
    if (value > share) {
      share = value
      best = muscle
    }
  }
  return best
}

/** The split's muscles, largest share first. */
export function rankedMuscles(split: MuscleSplit): { muscle: Muscle; share: number }[] {
  return MUSCLES.map((muscle) => ({ muscle, share: split[muscle] ?? 0 }))
    .filter((entry) => entry.share > 0)
    .sort((a, b) => b.share - a.share)
}

/**
 * Working sets spread across the six muscle groups by each exercise's split.
 * A bench press set is 0.6 of a chest set, a quarter of an arms set and the
 * rest shoulders, which is how a week of pressing reads as mostly chest.
 */
export function groupSplit(
  totals: readonly { exerciseId: string; sets: number }[],
  byId: (id: string) => LibraryExercise | undefined,
): { group: MuscleGroup; sets: number }[] {
  const sums = new Map<MuscleGroup, number>()
  for (const total of totals) {
    const exercise = byId(total.exerciseId)
    if (!exercise) continue
    for (const [muscle, share] of Object.entries(exercise.muscles) as [Muscle, number][]) {
      const group = MUSCLE_GROUP[muscle]
      sums.set(group, (sums.get(group) ?? 0) + share * total.sets)
    }
  }
  return [...sums.entries()]
    .map(([group, sets]) => ({ group, sets }))
    .filter((entry) => entry.sets > 0)
    .sort((a, b) => b.sets - a.sets)
}

/**
 * What adding an exercise to a workout starts it with: three empty sets for
 * lifting, one for something timed, which is what somebody adding it is about
 * to do most of the time.
 *
 * A game or a run gets no rest timer. A badminton set is the whole game, and a
 * "rest is over" ninety seconds after it is a notification about nothing.
 */
export function planFor(exercise: LibraryExercise): ExercisePlan {
  const timed = exercise.tracking === 'duration' || exercise.tracking === 'distance_duration'
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    tracking: exercise.tracking,
    // No timer between holds of a stretch or rounds of a game: the default
    // ninety seconds is for lifting.
    restS:
      exercise.category === 'sports' ||
      exercise.category === 'cardio' ||
      exercise.category === 'mobility'
        ? 0
        : null,
    sets: timed ? [{}] : [{}, {}, {}],
  }
}
