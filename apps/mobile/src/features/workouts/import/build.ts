import type { WorkoutDocument } from '@/data/workout-outbox'
import type { Category, Equipment, Tracking } from '../catalogue'
import { M_PER_MI } from '../format'
import { matchExercise } from './match'
import type {
  DistanceUnit,
  ImportSource,
  LocalTime,
  ParsedExercise,
  ParsedExport,
  ParsedSet,
  WeightUnit,
} from './parse'

/**
 * A parsed export turned into the documents `save_workout` takes, with every
 * exercise matched and every number in kilograms, metres and seconds.
 *
 * Pure: what it cannot know yet, the ids of custom exercises that do not
 * exist until the import makes them, it leaves as a name (`customName`), and
 * `useWorkoutImport` fills them in.
 */

export type ImportUnits = { weight: WeightUnit; distance: 'km' | 'mi' }

/** An exercise the import has to create, because no catalogue entry is that movement. */
export type CustomExercisePlan = {
  name: string
  tracking: Tracking
  equipment: Equipment
  category: Category
}

export type PlannedWorkout = {
  document: WorkoutDocument
  /** The index of each exercise that is a custom one, by the name it is created under. */
  customNames: (string | null)[]
}

export type ImportPlan = {
  source: ImportSource
  workouts: PlannedWorkout[]
  customs: CustomExercisePlan[]
  /** Distinct catalogue exercises the file's names matched. */
  matched: number
  sets: number
  /** From and to, as `yyyy-MM-dd`, or null for a file with no workouts. */
  from: string | null
  to: string | null
  /** Rows the parser could not read, and sets dropped for holding nothing or a broken number. */
  skipped: number
}

/** The database's own limits (`42_workouts.sql`), so a save is never refused for size. */
const LIMIT = {
  exercises: 60,
  sets: 99,
  name: 80,
  exerciseName: 120,
  notes: 2000,
  exerciseNotes: 1000,
  kg: 1000,
  reps: 1000,
  durationS: 86_400,
  metres: 1_000_000,
  restS: 3600,
  workoutS: 24 * 3600,
} as const

const pad = (value: number) => String(value).padStart(2, '0')
const dayOf = (t: LocalTime) => `${t.year}-${pad(t.month)}-${pad(t.day)}`

/**
 * A string cut to a length in characters, as Postgres counts them. Cutting
 * UTF-16 units split an emoji at the limit and left half of it, which the
 * database's JSON reader refuses, so the save of a long "Push Day 💪" failed.
 */
function clip(text: string, length: number): string {
  const characters = Array.from(text)
  return characters.length > length ? characters.slice(0, length).join('').trimEnd() : text
}

/**
 * An id for an imported workout that is the same every time the same person
 * imports the same file, so a second import finds the first one's workouts
 * already there instead of adding them again. A hash (cyrb128, about 96 bits
 * of it independent) of the account and what identifies the workout in its
 * file, written as a UUID (version 8, the RFC's "custom" kind).
 *
 * The account is in it because `workouts.id` is unique across every account:
 * from the file alone, two people with a Hevy "Morning Workout" started in the
 * same minute minted one id, and the second one's save was refused as
 * belonging to another account, on every retry.
 */
export function importedWorkoutId(owner: string, source: ImportSource, key: string): string {
  const text = `${owner}|${source}|${key}`
  let h1 = 0x6a09e667
  let h2 = 0xbb67ae85
  let h3 = 0x3c6ef372
  let h4 = 0xa54ff53a
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('')
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

type DocumentSet = WorkoutDocument['exercises'][number]['sets'][number]

function convertSet(set: ParsedSet, units: ImportUnits): DocumentSet | null {
  const weightUnit = set.weightUnit ?? units.weight
  const kg =
    set.weight === null
      ? null
      : Math.round((weightUnit === 'lb' ? set.weight / 2.2046226218 : set.weight) * 100) / 100
  const distanceUnit: DistanceUnit = set.distanceUnit ?? units.distance
  const metres =
    set.distance === null
      ? null
      : Math.round(
          (distanceUnit === 'mi'
            ? set.distance * M_PER_MI
            : distanceUnit === 'km'
              ? set.distance * 1000
              : set.distance) * 10,
        ) / 10
  const reps = set.reps === null ? null : Math.round(set.reps)
  const durationS = set.durationS === null ? null : Math.round(set.durationS)

  // A number past these is a broken cell rather than a record, and kept it
  // would stand as an all-time best nobody can beat.
  if (
    (kg !== null && kg > LIMIT.kg) ||
    (reps !== null && reps > LIMIT.reps) ||
    (durationS !== null && durationS > LIMIT.durationS) ||
    (metres !== null && metres > LIMIT.metres)
  ) {
    return null
  }
  const weightKg = kg === 0 ? null : kg
  if (weightKg === null && !reps && !durationS && !metres) return null
  return {
    kind: set.kind,
    weight_kg: weightKg,
    reps: reps || null,
    duration_s: durationS || null,
    distance_m: metres || null,
    rpe: set.rpe,
  }
}

/**
 * What a set of this exercise records. The catalogue's own tracking, unless
 * the file's numbers would not show under it: a sit-up done holding a plate
 * becomes a weighted sit-up rather than losing the plate, and a plank logged
 * as reps keeps its reps. A saved exercise carries its own tracking, so this
 * changes the one workout and not the catalogue.
 */
export function trackingFor(base: Tracking | null, sets: DocumentSet[], name: string): Tracking {
  const any = (pick: (set: DocumentSet) => number | null) => sets.some((set) => !!pick(set))
  const weight = any((set) => set.weight_kg)
  const reps = any((set) => set.reps)
  const duration = any((set) => set.duration_s)
  const distance = any((set) => set.distance_m)

  if (base === 'reps' && weight) return 'weighted_reps'
  if (base === 'duration' && !duration && reps) return weight ? 'weighted_reps' : 'reps'
  if ((base === 'distance_duration' || base === 'weight_distance') && !distance && !duration) {
    return weight ? 'weight_reps' : 'reps'
  }
  if (
    (base === 'weight_reps' ||
      base === 'weighted_reps' ||
      base === 'assisted_reps' ||
      base === 'reps') &&
    !reps &&
    !weight
  ) {
    return distance ? 'distance_duration' : 'duration'
  }
  if (base) return base

  if (distance) return weight ? 'weight_distance' : 'distance_duration'
  if (duration && !reps) return 'duration'
  if (/\bassist/i.test(name)) return 'assisted_reps'
  return weight ? 'weight_reps' : 'reps'
}

/** The equipment a name's brackets name, as both apps write it: "Row (Cable)". */
export function equipmentFor(name: string): Equipment {
  const text = name.toLowerCase()
  if (/barbell|ez bar|trap bar/.test(text)) return 'barbell'
  if (/dumbbell/.test(text)) return 'dumbbell'
  if (/kettlebell/.test(text)) return 'kettlebell'
  if (/cable/.test(text)) return 'cable'
  if (/\bband\b|resistance band/.test(text)) return 'band'
  if (/machine|smith|plate loaded|lever/.test(text)) return 'machine'
  if (/bodyweight|body weight/.test(text)) return 'none'
  return 'other'
}

/**
 * The library category a made-up name belongs under. Order is the rule: the
 * specific word before the broad one, so a leg curl is legs and not arms, and
 * a chest-supported row is back.
 */
// biome-ignore format: one rule per line
const CATEGORY_RULES: [RegExp, Category][] = [
  [/\b(leg curls?|hamstring curls?|nordics?)\b/, 'legs'],
  [/\b(wrist|forearms?|curls?|biceps?|triceps?|skull\w*|pushdowns?|kickbacks?)\b/, 'arms'],
  [/\bchest supported\b/, 'back'],
  [/\b(bench|chest|pecs?|fly|flyes?|flies|crossovers?|dips?|push ?ups?)\b/, 'chest'],
  [/\b(rows?|pulldowns?|pull ?ups?|chin ?ups?|lats?|deadlifts?|shrugs?|back extensions?)\b/, 'back'],
  [/\b(shoulders?|delts?|overhead press|military|lateral raises?|front raises?|face pulls?|arnold)\b/, 'shoulders'],
  [/\b(squats?|lunges?|legs?|glutes?|calf|calves|hip thrusts?|step ?ups?|hamstrings?|quads?)\b/, 'legs'],
  [/\b(ab|abs|core|planks?|crunch(es)?|sit ?ups?|obliques?|twists?|hollow)\b/, 'core'],
  [/\b(run|running|jog|jogging|walk|walking|bike|cycling|rowing|row(ing)? machine|rope|swim|swimming|elliptical|stairs?|sprints?|cardio)\b/, 'cardio'],
  [/\b(yoga|stretch\w*|mobility|pilates|foam)\b/, 'mobility'],
]

export function categoryFor(name: string, tracking: Tracking): Category {
  const text = name.toLowerCase().replace(/[-_/]+/g, ' ')
  for (const [rule, category] of CATEGORY_RULES) if (rule.test(text)) return category
  return tracking === 'distance_duration' ? 'cardio' : 'fullBody'
}

/** The rest Strong timed most often after this exercise, or null for none. */
function restFor(exercise: ParsedExercise): number | null {
  if (!exercise.rests.length) return null
  const counts = new Map<number, number>()
  for (const rest of exercise.rests) counts.set(rest, (counts.get(rest) ?? 0) + 1)
  const [rest] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  return Math.min(LIMIT.restS, Math.round(rest))
}

export function buildImport(
  parsed: ParsedExport,
  units: ImportUnits,
  /** A name for a workout the file left unnamed, from when it started. */
  fallbackName: (startedAt: Date) => string,
  /** The account importing, which every workout id is minted for. */
  owner: string,
): ImportPlan {
  const customs = new Map<string, CustomExercisePlan>()
  /** Every set of each custom exercise across the file, to settle its tracking on. */
  const customSets = new Map<string, DocumentSet[]>()
  const matched = new Set<string>()
  const workouts: PlannedWorkout[] = []
  let sets = 0
  let skipped = parsed.skippedRows

  for (const workout of parsed.workouts) {
    const exercises: WorkoutDocument['exercises'] = []
    const customNames: (string | null)[] = []
    // Hevy's superset labels, renumbered from 0 within the workout.
    const supersets = new Map<string, number>()

    for (const exercise of workout.exercises) {
      const converted: DocumentSet[] = []
      for (const set of exercise.sets) {
        const document = convertSet(set, units)
        if (document) converted.push(document)
        else skipped++
      }
      if (!converted.length) continue
      if (exercises.length === LIMIT.exercises) {
        skipped += converted.length
        continue
      }
      const kept = converted.slice(0, LIMIT.sets)
      skipped += converted.length - kept.length

      const catalogue = matchExercise(exercise.name, parsed.source)
      const name = clip(exercise.name.trim(), LIMIT.exerciseName)
      const tracking = trackingFor(catalogue?.tracking ?? null, kept, name)
      let customName: string | null = null
      if (catalogue) matched.add(catalogue.id)
      else {
        // The custom exercise's name is unique per account, case aside, and
        // limited to 80 characters; a longer one is saved under its first 80.
        customName = clip(name, 80)
        const key = customName.toLowerCase()
        customSets.set(key, [...(customSets.get(key) ?? []), ...kept])
        if (!customs.has(key)) {
          customs.set(key, {
            name: customName,
            tracking,
            equipment: equipmentFor(customName),
            category: categoryFor(customName, tracking),
          })
        }
      }

      let superset: number | null = null
      if (exercise.superset !== null) {
        if (!supersets.has(exercise.superset)) supersets.set(exercise.superset, supersets.size)
        superset = supersets.get(exercise.superset) ?? null
      }

      exercises.push({
        exercise_id: catalogue?.id ?? '',
        exercise_name: catalogue?.name ?? name,
        tracking,
        superset,
        rest_s: restFor(exercise),
        notes: exercise.notes.length ? clip(exercise.notes.join('\n'), LIMIT.exerciseNotes) : null,
        sets: kept,
      })
      customNames.push(customName)
      sets += kept.length
    }
    if (!exercises.length) continue

    // A superset is exercises side by side sharing a label; one left alone
    // after the rest were dropped is just an exercise.
    for (const [index, exercise] of exercises.entries()) {
      if (exercise.superset === null) continue
      const shared = exercises.some(
        (other, at) => at !== index && other.superset === exercise.superset,
      )
      if (!shared) exercise.superset = null
    }

    const { start } = workout
    const startedAt = new Date(
      start.year,
      start.month - 1,
      start.day,
      start.hour,
      start.minute,
      start.second,
    )
    const durationS = Math.min(LIMIT.workoutS, Math.max(0, workout.durationS ?? 0))
    workouts.push({
      customNames,
      document: {
        id: importedWorkoutId(owner, parsed.source, workout.key),
        name: clip(workout.name.trim() || fallbackName(startedAt), LIMIT.name),
        notes: workout.notes ? clip(workout.notes.trim(), LIMIT.notes) : null,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + durationS * 1000).toISOString(),
        log_date: dayOf(start),
        routine_id: null,
        kcal: null,
        health_workout_id: null,
        exercises,
      },
    })
  }

  // A custom exercise is one exercise everywhere it appears, so its tracking
  // comes from all of its sets: dips done bodyweight in one workout and with a
  // plate in the next are weighted dips, and taking the first workout's
  // tracking left the custom exercise with no weight column for the plate.
  for (const [key, custom] of customs) {
    custom.tracking = trackingFor(null, customSets.get(key) ?? [], custom.name)
    custom.category = categoryFor(custom.name, custom.tracking)
  }
  for (const { document, customNames } of workouts) {
    for (const [index, customName] of customNames.entries()) {
      const custom = customName ? customs.get(customName.toLowerCase()) : undefined
      if (custom) document.exercises[index].tracking = custom.tracking
    }
  }

  return {
    source: parsed.source,
    workouts,
    customs: [...customs.values()],
    matched: matched.size,
    sets,
    from: workouts[0]?.document.log_date ?? null,
    to: workouts.at(-1)?.document.log_date ?? null,
    skipped,
  }
}
