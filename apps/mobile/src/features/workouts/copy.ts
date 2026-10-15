import type { Category, Equipment, Level, Muscle, MuscleGroup, Tracking } from './catalogue'
import type { SetKind } from './model'
import type { RecordKind } from './records'
import type { TemplateGroup } from './templates'

/**
 * Copy keys for the catalogue's vocabularies, as maps rather than assembled
 * strings, so renaming one is a compile error instead of a label that renders
 * its own key. Same reason as `WORKOUT_KIND_KEY` in the activity feature.
 */

export const CATEGORY_KEY = {
  chest: 'workouts:category.chest',
  back: 'workouts:category.back',
  shoulders: 'workouts:category.shoulders',
  arms: 'workouts:category.arms',
  legs: 'workouts:category.legs',
  core: 'workouts:category.core',
  fullBody: 'workouts:category.fullBody',
  cardio: 'workouts:category.cardio',
  sports: 'workouts:category.sports',
  mobility: 'workouts:category.mobility',
} as const satisfies Record<Category, string>

export const EQUIPMENT_KEY = {
  none: 'workouts:equipment.none',
  barbell: 'workouts:equipment.barbell',
  dumbbell: 'workouts:equipment.dumbbell',
  kettlebell: 'workouts:equipment.kettlebell',
  machine: 'workouts:equipment.machine',
  cable: 'workouts:equipment.cable',
  band: 'workouts:equipment.band',
  other: 'workouts:equipment.other',
} as const satisfies Record<Equipment, string>

export const LEVEL_KEY = {
  beginner: 'workouts:level.beginner',
  intermediate: 'workouts:level.intermediate',
  advanced: 'workouts:level.advanced',
} as const satisfies Record<Level, string>

export const MUSCLE_KEY = {
  chest: 'workouts:muscle.chest',
  shoulders: 'workouts:muscle.shoulders',
  triceps: 'workouts:muscle.triceps',
  biceps: 'workouts:muscle.biceps',
  forearms: 'workouts:muscle.forearms',
  lats: 'workouts:muscle.lats',
  upperBack: 'workouts:muscle.upperBack',
  traps: 'workouts:muscle.traps',
  lowerBack: 'workouts:muscle.lowerBack',
  abs: 'workouts:muscle.abs',
  obliques: 'workouts:muscle.obliques',
  glutes: 'workouts:muscle.glutes',
  quads: 'workouts:muscle.quads',
  hamstrings: 'workouts:muscle.hamstrings',
  calves: 'workouts:muscle.calves',
  adductors: 'workouts:muscle.adductors',
  abductors: 'workouts:muscle.abductors',
} as const satisfies Record<Muscle, string>

export const MUSCLE_GROUP_KEY = {
  chest: 'workouts:muscleGroup.chest',
  back: 'workouts:muscleGroup.back',
  shoulders: 'workouts:muscleGroup.shoulders',
  arms: 'workouts:muscleGroup.arms',
  legs: 'workouts:muscleGroup.legs',
  core: 'workouts:muscleGroup.core',
} as const satisfies Record<MuscleGroup, string>

export const TRACKING_KEY = {
  weight_reps: 'workouts:tracking.weight_reps',
  reps: 'workouts:tracking.reps',
  weighted_reps: 'workouts:tracking.weighted_reps',
  assisted_reps: 'workouts:tracking.assisted_reps',
  duration: 'workouts:tracking.duration',
  distance_duration: 'workouts:tracking.distance_duration',
  weight_distance: 'workouts:tracking.weight_distance',
} as const satisfies Record<Tracking, string>

export const SET_KIND_KEY = {
  normal: 'workouts:logger.kind.normal',
  warmup: 'workouts:logger.kind.warmup',
  drop: 'workouts:logger.kind.drop',
  failure: 'workouts:logger.kind.failure',
} as const satisfies Record<SetKind, string>

export const SET_BADGE_KEY = {
  warmup: 'workouts:logger.kindBadge.warmup',
  drop: 'workouts:logger.kindBadge.drop',
  failure: 'workouts:logger.kindBadge.failure',
} as const satisfies Record<Exclude<SetKind, 'normal'>, string>

/** What a record is called, in the toast and on the exercise page alike. */
export const RECORD_KEY = {
  weight: 'workouts:exercise.bestWeight',
  e1rm: 'workouts:exercise.bestE1rm',
  volume: 'workouts:exercise.bestSetVolume',
  reps: 'workouts:exercise.bestReps',
  duration: 'workouts:exercise.bestDuration',
} as const satisfies Record<RecordKind, string>

/** A set kind's letter colour, everywhere a set is listed. */
export const SET_BADGE_TONE = {
  normal: 'text-ink',
  warmup: 'text-kaya-ink',
  drop: 'text-water-ink',
  failure: 'text-hibiscus-ink',
} as const satisfies Record<SetKind, string>

/**
 * Each set's badge, in order. Working sets are numbered 1, 2, 3 and warm-ups,
 * drops and failures wear a letter, which is how every gym log writes them.
 * A drop or failure still counts towards the numbering; a warm-up does not.
 */
export function setBadges(
  sets: readonly { kind: SetKind }[],
  t: (key: (typeof SET_BADGE_KEY)[keyof typeof SET_BADGE_KEY]) => string,
): { label: string; number: number; tone: string }[] {
  let working = 0
  return sets.map((set) => {
    if (set.kind !== 'warmup') working += 1
    return {
      label: set.kind === 'normal' ? String(working) : t(SET_BADGE_KEY[set.kind]),
      number: working,
      tone: SET_BADGE_TONE[set.kind],
    }
  })
}

export const TEMPLATE_GROUP_KEY = {
  start: 'workouts:explore.group.start',
  ppl: 'workouts:explore.group.ppl',
  upperLower: 'workouts:explore.group.upperLower',
  strength: 'workouts:explore.group.strength',
  split: 'workouts:explore.group.split',
  noGym: 'workouts:explore.group.noGym',
  focus: 'workouts:explore.group.focus',
} as const satisfies Record<TemplateGroup, string>

/**
 * A template's name and description. The ids are data, so this one is
 * assembled, and `templates.test.ts` checks every template has both keys.
 */
export const templateNameKey = (id: string) =>
  `workouts:template.${id}.name` as 'workouts:template.push.name'
export const templateDescriptionKey = (id: string) =>
  `workouts:template.${id}.description` as 'workouts:template.push.description'
