import { exerciseById, type Level } from './catalogue'
import type { ExercisePlan, SetPlan } from './model'

/**
 * The routines RiceCal ships: standard programs a beginner can start today and
 * a lifter will recognise, grouped the way they are run.
 *
 * Plans give reps and times, never weights. A weight in a template is somebody
 * else's weight, and the logger already shows the user's own last numbers in
 * the PREVIOUS column, which is the figure they actually lift against.
 *
 * The names and descriptions are copy (`workouts:template.<id>`), translated
 * like any other label. The exercise names inside them are catalogue names,
 * which are not.
 */

export const TEMPLATE_GROUPS = [
  'start',
  'ppl',
  'upperLower',
  'strength',
  'split',
  'noGym',
  'focus',
] as const
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number]

export type Template = {
  id: string
  group: TemplateGroup
  level: Level
  exercises: { id: string; restS: number; sets: SetPlan[] }[]
}

const reps = (count: number, n: number, warmup = 0): SetPlan[] => [
  ...Array.from({ length: warmup }, () => ({ kind: 'warmup' as const, reps: 10 })),
  ...Array.from({ length: count }, () => ({ reps: n })),
]
const hold = (count: number, seconds: number): SetPlan[] =>
  Array.from({ length: count }, () => ({ durationS: seconds }))

export const TEMPLATES: readonly Template[] = [
  // Start here: two full-body days alternated three times a week, the program
  // every beginner's guide converges on.
  {
    id: 'full-body-a',
    group: 'start',
    level: 'beginner',
    exercises: [
      { id: 'goblet-squat', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-bench-press', restS: 90, sets: reps(3, 10) },
      { id: 'seated-cable-row', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-shoulder-press', restS: 90, sets: reps(3, 10) },
      { id: 'plank', restS: 60, sets: hold(3, 30) },
    ],
  },
  {
    id: 'full-body-b',
    group: 'start',
    level: 'beginner',
    exercises: [
      { id: 'leg-press', restS: 90, sets: reps(3, 10) },
      { id: 'lat-pulldown', restS: 90, sets: reps(3, 10) },
      { id: 'machine-chest-press', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-romanian-deadlift', restS: 90, sets: reps(3, 10) },
      { id: 'crunch', restS: 60, sets: reps(3, 15) },
    ],
  },

  // Push, pull, legs.
  {
    id: 'push',
    group: 'ppl',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-bench-press', restS: 150, sets: reps(4, 8, 1) },
      { id: 'incline-dumbbell-press', restS: 120, sets: reps(3, 10) },
      { id: 'dumbbell-shoulder-press', restS: 120, sets: reps(3, 10) },
      { id: 'lateral-raise', restS: 60, sets: reps(3, 15) },
      { id: 'triceps-rope-pushdown', restS: 60, sets: reps(3, 12) },
      { id: 'overhead-triceps-extension', restS: 60, sets: reps(3, 12) },
    ],
  },
  {
    id: 'pull',
    group: 'ppl',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-row', restS: 150, sets: reps(4, 8, 1) },
      { id: 'lat-pulldown', restS: 120, sets: reps(3, 10) },
      { id: 'seated-cable-row', restS: 90, sets: reps(3, 10) },
      { id: 'face-pull', restS: 60, sets: reps(3, 15) },
      { id: 'barbell-curl', restS: 60, sets: reps(3, 10) },
      { id: 'hammer-curl', restS: 60, sets: reps(3, 12) },
    ],
  },
  {
    id: 'legs',
    group: 'ppl',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-squat', restS: 180, sets: reps(4, 6, 2) },
      { id: 'romanian-deadlift', restS: 150, sets: reps(3, 8) },
      { id: 'leg-press', restS: 120, sets: reps(3, 10) },
      { id: 'lying-leg-curl', restS: 90, sets: reps(3, 12) },
      { id: 'standing-calf-raise', restS: 60, sets: reps(4, 12) },
      { id: 'hanging-knee-raise', restS: 60, sets: reps(3, 12) },
    ],
  },

  // Upper and lower, four days a week.
  {
    id: 'upper',
    group: 'upperLower',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-bench-press', restS: 150, sets: reps(4, 6, 1) },
      { id: 'barbell-row', restS: 150, sets: reps(4, 8) },
      { id: 'overhead-press', restS: 120, sets: reps(3, 8) },
      { id: 'lat-pulldown', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-curl', restS: 60, sets: reps(2, 12) },
      { id: 'triceps-pushdown', restS: 60, sets: reps(2, 12) },
    ],
  },
  {
    id: 'lower',
    group: 'upperLower',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-squat', restS: 180, sets: reps(4, 6, 2) },
      { id: 'romanian-deadlift', restS: 150, sets: reps(3, 8) },
      { id: 'bulgarian-split-squat', restS: 90, sets: reps(3, 10) },
      { id: 'seated-leg-curl', restS: 90, sets: reps(3, 12) },
      { id: 'standing-calf-raise', restS: 60, sets: reps(4, 12) },
      { id: 'plank', restS: 60, sets: hold(3, 45) },
    ],
  },

  // Five by five: two days alternated, adding weight every session.
  {
    id: 'strength-a',
    group: 'strength',
    level: 'beginner',
    exercises: [
      { id: 'barbell-squat', restS: 180, sets: reps(5, 5, 2) },
      { id: 'barbell-bench-press', restS: 180, sets: reps(5, 5, 1) },
      { id: 'barbell-row', restS: 180, sets: reps(5, 5) },
    ],
  },
  {
    id: 'strength-b',
    group: 'strength',
    level: 'beginner',
    exercises: [
      { id: 'barbell-squat', restS: 180, sets: reps(5, 5, 2) },
      { id: 'overhead-press', restS: 180, sets: reps(5, 5, 1) },
      { id: 'deadlift', restS: 240, sets: reps(1, 5, 2) },
    ],
  },

  // One body part a day.
  {
    id: 'chest-day',
    group: 'split',
    level: 'intermediate',
    exercises: [
      { id: 'barbell-bench-press', restS: 150, sets: reps(4, 8, 1) },
      { id: 'incline-dumbbell-press', restS: 120, sets: reps(3, 10) },
      { id: 'pec-deck', restS: 60, sets: reps(3, 12) },
      { id: 'cable-crossover', restS: 60, sets: reps(3, 15) },
      { id: 'chest-dip', restS: 90, sets: reps(3, 10) },
    ],
  },
  {
    id: 'back-day',
    group: 'split',
    level: 'intermediate',
    exercises: [
      { id: 'deadlift', restS: 180, sets: reps(3, 5, 1) },
      { id: 'pull-up', restS: 120, sets: reps(3, 8) },
      { id: 'dumbbell-row', restS: 90, sets: reps(3, 10) },
      { id: 'seated-cable-row', restS: 90, sets: reps(3, 12) },
      { id: 'straight-arm-pulldown', restS: 60, sets: reps(3, 15) },
    ],
  },
  {
    id: 'shoulder-day',
    group: 'split',
    level: 'intermediate',
    exercises: [
      { id: 'overhead-press', restS: 150, sets: reps(4, 8, 1) },
      { id: 'arnold-press', restS: 90, sets: reps(3, 10) },
      { id: 'lateral-raise', restS: 60, sets: reps(4, 15) },
      { id: 'rear-delt-fly', restS: 60, sets: reps(3, 15) },
      { id: 'dumbbell-shrug', restS: 60, sets: reps(3, 12) },
    ],
  },
  {
    id: 'arm-day',
    group: 'split',
    level: 'intermediate',
    exercises: [
      { id: 'close-grip-bench-press', restS: 120, sets: reps(3, 8) },
      { id: 'barbell-curl', restS: 90, sets: reps(3, 10) },
      { id: 'skull-crusher', restS: 90, sets: reps(3, 10) },
      { id: 'incline-dumbbell-curl', restS: 60, sets: reps(3, 12) },
      { id: 'triceps-rope-pushdown', restS: 60, sets: reps(3, 15) },
      { id: 'hammer-curl', restS: 60, sets: reps(3, 12) },
    ],
  },

  // No gym needed.
  {
    id: 'home-bodyweight',
    group: 'noGym',
    level: 'beginner',
    exercises: [
      { id: 'push-up', restS: 60, sets: reps(3, 12) },
      { id: 'bodyweight-squat', restS: 60, sets: reps(3, 20) },
      { id: 'lunge', restS: 60, sets: reps(3, 10) },
      { id: 'glute-bridge', restS: 45, sets: reps(3, 15) },
      { id: 'superman', restS: 45, sets: reps(3, 12) },
      { id: 'plank', restS: 45, sets: hold(3, 45) },
    ],
  },
  {
    id: 'dumbbells-only',
    group: 'noGym',
    level: 'beginner',
    exercises: [
      { id: 'goblet-squat', restS: 90, sets: reps(3, 12) },
      { id: 'dumbbell-bench-press', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-row', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-shoulder-press', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-romanian-deadlift', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-curl', restS: 60, sets: reps(2, 12) },
    ],
  },

  // Short sessions with one job.
  {
    id: 'core',
    group: 'focus',
    level: 'beginner',
    exercises: [
      { id: 'crunch', restS: 45, sets: reps(3, 15) },
      { id: 'bicycle-crunch', restS: 45, sets: reps(3, 20) },
      { id: 'lying-leg-raise', restS: 45, sets: reps(3, 12) },
      { id: 'russian-twist', restS: 45, sets: reps(3, 20) },
      { id: 'plank', restS: 45, sets: hold(3, 45) },
      { id: 'side-plank', restS: 30, sets: hold(2, 30) },
    ],
  },
  {
    id: 'glutes',
    group: 'focus',
    level: 'intermediate',
    exercises: [
      { id: 'hip-thrust', restS: 120, sets: reps(4, 10, 1) },
      { id: 'bulgarian-split-squat', restS: 90, sets: reps(3, 10) },
      { id: 'dumbbell-romanian-deadlift', restS: 90, sets: reps(3, 10) },
      { id: 'cable-kickback', restS: 60, sets: reps(3, 12) },
      { id: 'hip-abduction', restS: 60, sets: reps(3, 15) },
    ],
  },
  {
    id: 'hiit',
    group: 'focus',
    level: 'intermediate',
    exercises: [
      { id: 'burpee', restS: 30, sets: reps(4, 10) },
      { id: 'mountain-climber', restS: 30, sets: reps(4, 20) },
      { id: 'jump-squat', restS: 30, sets: reps(4, 12) },
      { id: 'kettlebell-swing', restS: 30, sets: reps(4, 15) },
      { id: 'high-knees', restS: 30, sets: hold(4, 30) },
    ],
  },
  {
    id: 'mobility',
    group: 'focus',
    level: 'beginner',
    exercises: [
      { id: 'foam-rolling', restS: 0, sets: hold(1, 600) },
      { id: 'stretching', restS: 0, sets: hold(1, 900) },
      { id: 'yoga', restS: 0, sets: hold(1, 1200) },
    ],
  },
]

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id)
}

/** A template as the logger's plan, with the catalogue's names filled in. */
export function templatePlans(template: Template): ExercisePlan[] {
  return template.exercises.flatMap((entry) => {
    const exercise = exerciseById(entry.id)
    if (!exercise) return []
    return [
      {
        exerciseId: exercise.id,
        name: exercise.name,
        tracking: exercise.tracking,
        restS: entry.restS,
        sets: entry.sets,
      },
    ]
  })
}
