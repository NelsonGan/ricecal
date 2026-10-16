import { EXERCISES, type Exercise, exerciseById } from '../catalogue'
import { HEVY_NAMES, STRONG_NAMES } from './names'
import type { ImportSource } from './parse'

/**
 * Which catalogue exercise a name from another app is, or null for one that
 * comes in as the user's own.
 *
 * The app's own table first, where every built-in name of Strong and Hevy is
 * listed, including the ones deliberately left unmatched. Then a name the
 * person made up: matched only when it is a catalogue name or alias with its
 * words in another order ("Barbell Bench Press" is "Bench Press (Barbell)").
 * Nothing looser. Guessing between the barbell and the dumbbell bench press
 * would file years of training under the wrong lift, which is worse than a
 * custom exercise the person can see and rename.
 */

const lower = (table: Readonly<Record<string, string | null>>) =>
  new Map(Object.entries(table).map(([name, id]) => [name.trim().toLowerCase(), id]))

const TABLES: Record<ImportSource, Map<string, string | null>> = {
  strong: lower(STRONG_NAMES),
  hevy: lower(HEVY_NAMES),
}

/** A name as a bag of words: lower case, punctuation as spaces, sorted. */
export function wordKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * Aliases that are search tags rather than another name for one exercise:
 * typing "recovery" in the library should find foam rolling, but a custom
 * exercise someone called "Recovery" is not foam rolling.
 */
const TAGS = new Set(['olympic', 'recovery', 'mobility', 'cooldown', 'circuit', 'interval'])

let byWords: Map<string, string> | null = null

function catalogueByWords(): Map<string, string> {
  if (byWords) return byWords
  const map = new Map<string, string>()
  // Names before aliases, so a name always wins a clash with another entry's alias.
  for (const exercise of EXERCISES) {
    const key = wordKey(exercise.name)
    if (!map.has(key)) map.set(key, exercise.id)
  }
  // An alias two entries share names neither of them.
  const aliases = new Map<string, string | null>()
  for (const exercise of EXERCISES) {
    for (const alias of exercise.aliases ?? []) {
      if (TAGS.has(alias)) continue
      const key = wordKey(alias)
      const seen = aliases.get(key)
      aliases.set(key, seen === undefined || seen === exercise.id ? exercise.id : null)
    }
  }
  for (const [key, id] of aliases) if (id && !map.has(key)) map.set(key, id)
  byWords = map
  return map
}

export function matchExercise(name: string, source: ImportSource): Exercise | null {
  const key = name.trim().toLowerCase()
  const listed = TABLES[source].get(key)
  if (listed !== undefined) return listed === null ? null : (exerciseById(listed) ?? null)

  const id = catalogueByWords().get(wordKey(name))
  if (id) return exerciseById(id) ?? null

  // A Strong file can hold a Hevy name the person typed in, and the other way
  // round; the other app's table only ever adds a match, never blocks one.
  const other = TABLES[source === 'strong' ? 'hevy' : 'strong'].get(key)
  return other ? (exerciseById(other) ?? null) : null
}
