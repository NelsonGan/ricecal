/**
 * Every exercise and activity the logger knows, hard-coded.
 *
 * Hard-coded rather than a table, because the list is the app's own design
 * rather than user data: each entry has a drawing made for it, which
 * `model.test.ts` holds it to, and an entry the server could add would arrive
 * with no picture. Anything missing is a custom
 * exercise (`custom_exercises`), which the user names and describes.
 *
 * Names are English and stay English in every language, the way a dish name
 * does. "Lat Pulldown" is what the machine is called in a Kuala Lumpur gym, a
 * Jakarta one and a Tokyo one, and a translated name is one nobody can match to
 * the machine in front of them. The words AROUND the names (muscles, equipment,
 * categories, every label) are translated.
 *
 * This file imports nothing, because `scripts/exercise-art/generate.mjs` reads
 * it straight from Node to know what to draw. Keep it that way.
 *
 * The `id` is what a saved workout stores, so it is permanent: renaming an
 * entry is changing `name`, and removing one strands every set logged against
 * it (a saved exercise keeps its own name, so it still reads, but loses its
 * picture and its muscles). Never reuse an id for a different movement.
 */

/**
 * What a set of this exercise records, which decides the columns in the logger.
 *
 *   weight_reps        kg and reps               bench press
 *   reps               reps                      push-up
 *   weighted_reps      added kg (optional), reps pull-up, dip
 *   assisted_reps      assistance kg, reps       assisted pull-up machine
 *   duration           time                      plank, wall sit
 *   distance_duration  distance and time         running, rowing machine
 *   weight_distance    kg and distance           farmer's walk, sled push
 */
export const TRACKINGS = [
  'weight_reps',
  'reps',
  'weighted_reps',
  'assisted_reps',
  'duration',
  'distance_duration',
  'weight_distance',
] as const
export type Tracking = (typeof TRACKINGS)[number]

/** The filter chips. One per exercise: the thing the movement is done with. */
export const EQUIPMENT = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'band',
  'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

export const CATEGORIES = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'fullBody',
  'cardio',
  'mobility',
] as const
export type Category = (typeof CATEGORIES)[number]

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type Level = (typeof LEVELS)[number]

/**
 * The muscles a split is drawn over. Fine enough that "back day" can say lats
 * from upper back, coarse enough that each one is a muscle people train by
 * name.
 */
export const MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'upperBack',
  'traps',
  'lowerBack',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'adductors',
  'abductors',
] as const
export type Muscle = (typeof MUSCLES)[number]

/**
 * Which part of the body each muscle is grouped under on the split chart. Six
 * groups, because a bar per muscle is seventeen bars and nobody reads past the
 * eighth.
 */
const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const MUSCLE_GROUP: Record<Muscle, MuscleGroup> = {
  chest: 'chest',
  shoulders: 'shoulders',
  triceps: 'arms',
  biceps: 'arms',
  forearms: 'arms',
  lats: 'back',
  upperBack: 'back',
  traps: 'back',
  lowerBack: 'back',
  abs: 'core',
  obliques: 'core',
  glutes: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
}

/** How an exercise's work divides between muscles. The shares add up to 1. */
export type MuscleSplit = Partial<Record<Muscle, number>>

export type Exercise = {
  id: string
  name: string
  category: Category
  tracking: Tracking
  equipment: Equipment
  level: Level
  /** Primary first. Every share is a fraction of one set's work. */
  muscles: MuscleSplit
  /**
   * The Compendium of Physical Activities' MET for the movement, which is all a
   * calorie estimate can honestly be built on. Used for the figure saved to
   * Apple Health; see `estimateKcal`.
   */
  met: number
  /**
   * `HKWorkoutActivityType` when the exercise IS the session (a run, a swim, a
   * yoga class). Strength work leaves it out and the workout is saved as
   * strength training.
   */
  health?: number
  /** Other words people search by. Lower case. */
  aliases?: string[]
}

type Row = [
  id: string,
  name: string,
  tracking: Tracking,
  equipment: Equipment,
  level: Level,
  muscles: MuscleSplit,
  met: number,
  extra?: { health?: number; aliases?: string[] },
]

const rows = (category: Category, list: Row[]): Exercise[] =>
  list.map(([id, name, tracking, equipment, level, muscles, met, extra]) => ({
    id,
    name,
    category,
    tracking,
    equipment,
    level,
    muscles,
    met,
    ...extra,
  }))

// MET values: compound barbell lifting 5-6, isolation and machines 3.5,
// calisthenics 3.8 (moderate) to 8 (vigorous). Cardio uses the Compendium's
// general entry for the activity, not its competitive one.

// biome-ignore format: one exercise per line reads as a table
const CHEST = rows('chest', [
  ['barbell-bench-press', 'Bench Press (Barbell)', 'weight_reps', 'barbell', 'beginner', { chest: 0.6, triceps: 0.25, shoulders: 0.15 }, 5, { aliases: ['flat bench', 'bp'] }],
  ['incline-bench-press', 'Incline Bench Press (Barbell)', 'weight_reps', 'barbell', 'intermediate', { chest: 0.55, shoulders: 0.25, triceps: 0.2 }, 5],
  ['decline-bench-press', 'Decline Bench Press (Barbell)', 'weight_reps', 'barbell', 'intermediate', { chest: 0.65, triceps: 0.25, shoulders: 0.1 }, 5],
  ['dumbbell-bench-press', 'Bench Press (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { chest: 0.6, triceps: 0.2, shoulders: 0.2 }, 5, { aliases: ['db press'] }],
  ['incline-dumbbell-press', 'Incline Bench Press (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { chest: 0.55, shoulders: 0.25, triceps: 0.2 }, 5],
  ['smith-bench-press', 'Bench Press (Smith Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.6, triceps: 0.25, shoulders: 0.15 }, 4],
  ['machine-chest-press', 'Chest Press (Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.65, triceps: 0.2, shoulders: 0.15 }, 3.5],
  ['dumbbell-fly', 'Chest Fly (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { chest: 0.85, shoulders: 0.15 }, 3.5, { aliases: ['flye'] }],
  ['incline-dumbbell-fly', 'Incline Chest Fly (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { chest: 0.8, shoulders: 0.2 }, 3.5],
  ['pec-deck', 'Pec Deck (Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.9, shoulders: 0.1 }, 3.5, { aliases: ['chest fly (machine)', 'pec deck', 'butterfly'] }],
  ['cable-crossover', 'Cable Crossover', 'weight_reps', 'cable', 'intermediate', { chest: 0.85, shoulders: 0.15 }, 3.5, { aliases: ['cable fly'] }],
  ['low-cable-fly', 'Low to High Cable Fly', 'weight_reps', 'cable', 'intermediate', { chest: 0.75, shoulders: 0.25 }, 3.5],
  ['dumbbell-pullover', 'Pullover (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { chest: 0.5, lats: 0.35, triceps: 0.15 }, 3.5],
  ['push-up', 'Push Up', 'reps', 'none', 'beginner', { chest: 0.55, triceps: 0.25, shoulders: 0.1, abs: 0.1 }, 3.8, { aliases: ['push-up', 'press up', 'pushup', 'tekan tubi'] }],
  ['knee-push-up', 'Push Up (Knees)', 'reps', 'none', 'beginner', { chest: 0.6, triceps: 0.25, shoulders: 0.15 }, 3.8, { aliases: ['knee push-up'] }],
  ['incline-push-up', 'Incline Push-Up', 'reps', 'none', 'beginner', { chest: 0.55, triceps: 0.25, shoulders: 0.2 }, 3.8],
  ['decline-push-up', 'Decline Push-Up', 'reps', 'none', 'intermediate', { chest: 0.5, shoulders: 0.25, triceps: 0.25 }, 3.8],
  ['chest-dip', 'Chest Dip', 'weighted_reps', 'none', 'intermediate', { chest: 0.55, triceps: 0.3, shoulders: 0.15 }, 5, { aliases: ['dips'] }],
  ['around-the-world', 'Around the World', 'weight_reps', 'dumbbell', 'intermediate', { chest: 0.6, shoulders: 0.3, lats: 0.1 }, 3.5],
  ['cable-bench-press', 'Bench Press (Cable)', 'weight_reps', 'cable', 'intermediate', { chest: 0.6, triceps: 0.25, shoulders: 0.15 }, 3.5],
  ['wide-grip-bench-press', 'Bench Press - Wide Grip (Barbell)', 'weight_reps', 'barbell', 'intermediate', { chest: 0.7, shoulders: 0.2, triceps: 0.1 }, 5],
  ['band-chest-fly', 'Chest Fly (Band)', 'weight_reps', 'band', 'beginner', { chest: 0.85, shoulders: 0.15 }, 3],
  ['band-chest-press', 'Chest Press (Band)', 'weight_reps', 'band', 'beginner', { chest: 0.6, triceps: 0.25, shoulders: 0.15 }, 3],
  ['assisted-chest-dip', 'Chest Dip (Assisted)', 'assisted_reps', 'machine', 'beginner', { chest: 0.55, triceps: 0.3, shoulders: 0.15 }, 4],
  ['decline-dumbbell-press', 'Decline Bench Press (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { chest: 0.65, triceps: 0.25, shoulders: 0.1 }, 5],
  ['smith-decline-press', 'Decline Bench Press (Smith Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.65, triceps: 0.25, shoulders: 0.1 }, 4],
  ['floor-press', 'Floor Press (Barbell)', 'weight_reps', 'barbell', 'intermediate', { chest: 0.5, triceps: 0.35, shoulders: 0.15 }, 5],
  ['cable-incline-press', 'Incline Bench Press (Cable)', 'weight_reps', 'cable', 'intermediate', { chest: 0.55, shoulders: 0.25, triceps: 0.2 }, 3.5],
  ['smith-incline-press', 'Incline Bench Press (Smith Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.55, shoulders: 0.25, triceps: 0.2 }, 4],
  ['incline-machine-press', 'Incline Chest Press (Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.55, shoulders: 0.25, triceps: 0.2 }, 3.5],
  ['iso-lateral-chest-press', 'Iso-Lateral Chest Press (Machine)', 'weight_reps', 'machine', 'beginner', { chest: 0.65, triceps: 0.2, shoulders: 0.15 }, 3.5, { aliases: ['hammer strength chest press'] }],
  ['banded-push-up', 'Push Up (Band)', 'reps', 'band', 'intermediate', { chest: 0.55, triceps: 0.25, shoulders: 0.1, abs: 0.1 }, 3.8],
])

// biome-ignore format: one exercise per line reads as a table
const BACK = rows('back', [
  ['deadlift', 'Deadlift (Barbell)', 'weight_reps', 'barbell', 'intermediate', { hamstrings: 0.25, glutes: 0.25, lowerBack: 0.2, traps: 0.1, quads: 0.1, forearms: 0.1 }, 6, { aliases: ['dl', 'conventional'] }],
  ['sumo-deadlift', 'Sumo Deadlift (Barbell)', 'weight_reps', 'barbell', 'intermediate', { glutes: 0.3, quads: 0.2, hamstrings: 0.2, adductors: 0.15, lowerBack: 0.15 }, 6],
  ['trap-bar-deadlift', 'Trap Bar Deadlift', 'weight_reps', 'barbell', 'beginner', { quads: 0.3, glutes: 0.25, hamstrings: 0.2, lowerBack: 0.15, traps: 0.1 }, 6, { aliases: ['hex bar'] }],
  ['rack-pull', 'Rack Pull (Barbell)', 'weight_reps', 'barbell', 'intermediate', { lowerBack: 0.3, traps: 0.25, glutes: 0.2, hamstrings: 0.15, forearms: 0.1 }, 6, { aliases: ['rack pull'] }],
  ['barbell-row', 'Bent Over Row (Barbell)', 'weight_reps', 'barbell', 'intermediate', { lats: 0.35, upperBack: 0.3, biceps: 0.15, lowerBack: 0.1, shoulders: 0.1 }, 5, { aliases: ['bb row'] }],
  ['dumbbell-row', 'Bent Over One Arm Row (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { lats: 0.45, upperBack: 0.3, biceps: 0.15, shoulders: 0.1 }, 4.5, { aliases: ['single arm row (dumbbell)', 'db row', 'one arm row'] }],
  ['chest-supported-row', 'Incline Row (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { upperBack: 0.45, lats: 0.3, biceps: 0.15, shoulders: 0.1 }, 4, { aliases: ['chest supported row (dumbbell)'] }],
  ['t-bar-row', 'T Bar Row', 'weight_reps', 'barbell', 'intermediate', { upperBack: 0.4, lats: 0.35, biceps: 0.15, lowerBack: 0.1 }, 5, { aliases: ['t-bar row', 'landmine row'] }],
  ['seated-cable-row', 'Seated Row (Cable)', 'weight_reps', 'cable', 'beginner', { lats: 0.4, upperBack: 0.35, biceps: 0.15, shoulders: 0.1 }, 3.5, { aliases: ['seated cable row'] }],
  ['machine-row', 'Seated Row (Machine)', 'weight_reps', 'machine', 'beginner', { upperBack: 0.45, lats: 0.35, biceps: 0.2 }, 3.5],
  ['lat-pulldown', 'Lat Pulldown (Cable)', 'weight_reps', 'cable', 'beginner', { lats: 0.65, biceps: 0.2, upperBack: 0.15 }, 3.5, { aliases: ['pulldown'] }],
  ['close-grip-pulldown', 'Close Grip Lat Pulldown', 'weight_reps', 'cable', 'beginner', { lats: 0.6, biceps: 0.25, upperBack: 0.15 }, 3.5],
  ['straight-arm-pulldown', 'Straight Arm Pulldown', 'weight_reps', 'cable', 'intermediate', { lats: 0.8, triceps: 0.1, abs: 0.1 }, 3.5],
  ['pull-up', 'Pull Up', 'weighted_reps', 'none', 'intermediate', { lats: 0.6, biceps: 0.2, upperBack: 0.15, forearms: 0.05 }, 8, { aliases: ['pull-up', 'pullup'] }],
  ['chin-up', 'Chin Up', 'weighted_reps', 'none', 'intermediate', { lats: 0.5, biceps: 0.35, upperBack: 0.15 }, 8, { aliases: ['chin-up', 'chinup'] }],
  ['assisted-pull-up', 'Pull Up (Assisted)', 'assisted_reps', 'machine', 'beginner', { lats: 0.6, biceps: 0.25, upperBack: 0.15 }, 4, { aliases: ['pull-up (assisted)'] }],
  ['inverted-row', 'Inverted Row (Bodyweight)', 'reps', 'none', 'beginner', { upperBack: 0.45, lats: 0.3, biceps: 0.2, abs: 0.05 }, 3.8, { aliases: ['inverted row', 'australian pull up'] }],
  ['back-extension', 'Back Extension', 'weighted_reps', 'other', 'beginner', { lowerBack: 0.5, glutes: 0.3, hamstrings: 0.2 }, 3.5, { aliases: ['hyperextension'] }],
  ['good-morning', 'Good Morning (Barbell)', 'weight_reps', 'barbell', 'intermediate', { hamstrings: 0.45, lowerBack: 0.35, glutes: 0.2 }, 5],
  ['barbell-shrug', 'Shrug (Barbell)', 'weight_reps', 'barbell', 'beginner', { traps: 0.9, forearms: 0.1 }, 3.5],
  ['dumbbell-shrug', 'Shrug (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { traps: 0.9, forearms: 0.1 }, 3.5],
  ['superman', 'Superman', 'reps', 'none', 'beginner', { lowerBack: 0.6, glutes: 0.3, shoulders: 0.1 }, 3],
  ['band-pull-apart', 'Band Pull-Apart', 'reps', 'band', 'beginner', { upperBack: 0.5, shoulders: 0.4, traps: 0.1 }, 3],
  ['machine-back-extension', 'Back Extension (Machine)', 'weight_reps', 'machine', 'beginner', { lowerBack: 0.6, glutes: 0.25, hamstrings: 0.15 }, 3.5],
  ['band-row', 'Bent Over Row (Band)', 'weight_reps', 'band', 'beginner', { lats: 0.35, upperBack: 0.35, biceps: 0.2, shoulders: 0.1 }, 3],
  ['dumbbell-bent-over-row', 'Bent Over Row (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { lats: 0.35, upperBack: 0.3, biceps: 0.15, lowerBack: 0.1, shoulders: 0.1 }, 4.5],
  ['underhand-barbell-row', 'Bent Over Row - Underhand (Barbell)', 'weight_reps', 'barbell', 'intermediate', { lats: 0.4, upperBack: 0.25, biceps: 0.2, lowerBack: 0.1, shoulders: 0.05 }, 5, { aliases: ['yates row', 'reverse grip row'] }],
  ['assisted-chin-up', 'Chin Up (Assisted)', 'assisted_reps', 'machine', 'beginner', { lats: 0.5, biceps: 0.35, upperBack: 0.15 }, 4],
  ['band-deadlift', 'Deadlift (Band)', 'weight_reps', 'band', 'beginner', { glutes: 0.35, hamstrings: 0.3, lowerBack: 0.2, quads: 0.15 }, 3.5],
  ['dumbbell-deadlift', 'Deadlift (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { glutes: 0.3, hamstrings: 0.25, lowerBack: 0.2, quads: 0.15, forearms: 0.1 }, 5],
  ['smith-deadlift', 'Deadlift (Smith Machine)', 'weight_reps', 'machine', 'beginner', { glutes: 0.3, hamstrings: 0.25, lowerBack: 0.2, quads: 0.15, traps: 0.1 }, 5],
  ['deficit-deadlift', 'Deficit Deadlift (Barbell)', 'weight_reps', 'barbell', 'advanced', { hamstrings: 0.25, glutes: 0.25, lowerBack: 0.2, quads: 0.15, traps: 0.1, forearms: 0.05 }, 6],
  ['iso-lateral-row', 'Iso-Lateral Row (Machine)', 'weight_reps', 'machine', 'beginner', { lats: 0.4, upperBack: 0.4, biceps: 0.2 }, 3.5, { aliases: ['hammer strength row'] }],
  ['band-kneeling-pulldown', 'Kneeling Pulldown (Band)', 'weight_reps', 'band', 'beginner', { lats: 0.65, biceps: 0.2, upperBack: 0.15 }, 3],
  ['machine-lat-pulldown', 'Lat Pulldown (Machine)', 'weight_reps', 'machine', 'beginner', { lats: 0.65, biceps: 0.2, upperBack: 0.15 }, 3.5],
  ['single-arm-pulldown', 'Lat Pulldown (Single Arm)', 'weight_reps', 'cable', 'intermediate', { lats: 0.7, biceps: 0.15, upperBack: 0.15 }, 3.5],
  ['band-underhand-pulldown', 'Lat Pulldown - Underhand (Band)', 'weight_reps', 'band', 'beginner', { lats: 0.55, biceps: 0.3, upperBack: 0.15 }, 3],
  ['underhand-pulldown', 'Lat Pulldown - Underhand (Cable)', 'weight_reps', 'cable', 'beginner', { lats: 0.55, biceps: 0.3, upperBack: 0.15 }, 3.5, { aliases: ['reverse grip lat pulldown'] }],
  ['wide-grip-pulldown', 'Lat Pulldown - Wide Grip (Cable)', 'weight_reps', 'cable', 'beginner', { lats: 0.7, upperBack: 0.2, biceps: 0.1 }, 3.5],
  ['pendlay-row', 'Pendlay Row (Barbell)', 'weight_reps', 'barbell', 'intermediate', { lats: 0.35, upperBack: 0.35, biceps: 0.15, lowerBack: 0.15 }, 5],
  ['band-assisted-pull-up', 'Pull Up (Band)', 'assisted_reps', 'band', 'beginner', { lats: 0.6, biceps: 0.25, upperBack: 0.15 }, 4],
  ['machine-pullover', 'Pullover (Machine)', 'weight_reps', 'machine', 'beginner', { lats: 0.7, chest: 0.2, triceps: 0.1 }, 3.5],
  ['wide-grip-cable-row', 'Seated Wide-Grip Row (Cable)', 'weight_reps', 'cable', 'beginner', { upperBack: 0.5, lats: 0.3, shoulders: 0.1, biceps: 0.1 }, 3.5],
  ['machine-shrug', 'Shrug (Machine)', 'weight_reps', 'machine', 'beginner', { traps: 0.9, forearms: 0.1 }, 3.5],
  ['smith-shrug', 'Shrug (Smith Machine)', 'weight_reps', 'machine', 'beginner', { traps: 0.9, forearms: 0.1 }, 3.5],
  ['wide-pull-up', 'Wide Pull Up', 'weighted_reps', 'none', 'advanced', { lats: 0.7, upperBack: 0.2, biceps: 0.1 }, 8],
  ['kipping-pull-up', 'Kipping Pull Up', 'reps', 'none', 'advanced', { lats: 0.5, biceps: 0.15, abs: 0.15, shoulders: 0.1, upperBack: 0.1 }, 8],
  ['muscle-up', 'Muscle Up', 'reps', 'none', 'advanced', { lats: 0.35, chest: 0.2, triceps: 0.2, shoulders: 0.15, biceps: 0.1 }, 8],
])

// biome-ignore format: one exercise per line reads as a table
const SHOULDERS = rows('shoulders', [
  ['overhead-press', 'Overhead Press (Barbell)', 'weight_reps', 'barbell', 'intermediate', { shoulders: 0.6, triceps: 0.25, abs: 0.1, traps: 0.05 }, 5, { aliases: ['ohp', 'military press'] }],
  ['dumbbell-shoulder-press', 'Seated Overhead Press (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.65, triceps: 0.25, traps: 0.1 }, 4.5, { aliases: ['shoulder press (dumbbell)'] }],
  ['arnold-press', 'Arnold Press (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { shoulders: 0.7, triceps: 0.2, traps: 0.1 }, 4.5],
  ['machine-shoulder-press', 'Shoulder Press (Machine)', 'weight_reps', 'machine', 'beginner', { shoulders: 0.65, triceps: 0.25, traps: 0.1 }, 3.5],
  ['lateral-raise', 'Lateral Raise (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.9, traps: 0.1 }, 3.5, { aliases: ['side raise'] }],
  ['cable-lateral-raise', 'Lateral Raise (Cable)', 'weight_reps', 'cable', 'intermediate', { shoulders: 0.9, traps: 0.1 }, 3.5],
  ['front-raise', 'Front Raise (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.85, chest: 0.15 }, 3.5],
  ['rear-delt-fly', 'Reverse Fly (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.6, upperBack: 0.3, traps: 0.1 }, 3.5, { aliases: ['rear delt fly (dumbbell)', 'reverse fly'] }],
  ['reverse-pec-deck', 'Reverse Fly (Machine)', 'weight_reps', 'machine', 'beginner', { shoulders: 0.6, upperBack: 0.4 }, 3.5],
  ['face-pull', 'Face Pull (Cable)', 'weight_reps', 'cable', 'beginner', { shoulders: 0.5, upperBack: 0.35, traps: 0.15 }, 3.5, { aliases: ['face pull'] }],
  ['upright-row', 'Upright Row (Barbell)', 'weight_reps', 'barbell', 'intermediate', { shoulders: 0.5, traps: 0.4, biceps: 0.1 }, 4],
  ['landmine-press', 'Landmine Press', 'weight_reps', 'barbell', 'intermediate', { shoulders: 0.5, chest: 0.3, triceps: 0.2 }, 4.5],
  ['pike-push-up', 'Pike Push-Up', 'reps', 'none', 'intermediate', { shoulders: 0.6, triceps: 0.3, chest: 0.1 }, 3.8],
  ['handstand-push-up', 'Handstand Push Up', 'reps', 'none', 'advanced', { shoulders: 0.6, triceps: 0.3, traps: 0.1 }, 8, { aliases: ['handstand push-up'] }],
  ['band-front-raise', 'Front Raise (Band)', 'weight_reps', 'band', 'beginner', { shoulders: 0.85, chest: 0.15 }, 3],
  ['barbell-front-raise', 'Front Raise (Barbell)', 'weight_reps', 'barbell', 'beginner', { shoulders: 0.85, chest: 0.15 }, 3.5],
  ['cable-front-raise', 'Front Raise (Cable)', 'weight_reps', 'cable', 'beginner', { shoulders: 0.85, chest: 0.15 }, 3.5],
  ['plate-front-raise', 'Front Raise (Plate)', 'weight_reps', 'other', 'beginner', { shoulders: 0.85, chest: 0.15 }, 3.5],
  ['band-lateral-raise', 'Lateral Raise (Band)', 'weight_reps', 'band', 'beginner', { shoulders: 0.9, traps: 0.1 }, 3],
  ['machine-lateral-raise', 'Lateral Raise (Machine)', 'weight_reps', 'machine', 'beginner', { shoulders: 0.9, traps: 0.1 }, 3.5],
  ['cable-overhead-press', 'Overhead Press (Cable)', 'weight_reps', 'cable', 'intermediate', { shoulders: 0.65, triceps: 0.25, traps: 0.1 }, 3.5],
  ['standing-dumbbell-press', 'Overhead Press (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.6, triceps: 0.25, abs: 0.05, traps: 0.1 }, 4.5],
  ['smith-overhead-press', 'Overhead Press (Smith Machine)', 'weight_reps', 'machine', 'beginner', { shoulders: 0.65, triceps: 0.25, traps: 0.1 }, 4],
  ['seated-barbell-press', 'Seated Overhead Press (Barbell)', 'weight_reps', 'barbell', 'intermediate', { shoulders: 0.65, triceps: 0.25, traps: 0.1 }, 5],
  ['cable-reverse-fly', 'Reverse Fly (Cable)', 'weight_reps', 'cable', 'intermediate', { shoulders: 0.6, upperBack: 0.4 }, 3.5],
  ['push-press', 'Push Press', 'weight_reps', 'barbell', 'intermediate', { shoulders: 0.5, triceps: 0.2, quads: 0.2, glutes: 0.1 }, 6],
  ['cable-upright-row', 'Upright Row (Cable)', 'weight_reps', 'cable', 'beginner', { shoulders: 0.5, traps: 0.4, biceps: 0.1 }, 3.5],
  ['dumbbell-upright-row', 'Upright Row (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { shoulders: 0.5, traps: 0.4, biceps: 0.1 }, 3.5],
])

// biome-ignore format: one exercise per line reads as a table
const ARMS = rows('arms', [
  ['barbell-curl', 'Bicep Curl (Barbell)', 'weight_reps', 'barbell', 'beginner', { biceps: 0.85, forearms: 0.15 }, 3.5],
  ['dumbbell-curl', 'Bicep Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { biceps: 0.85, forearms: 0.15 }, 3.5, { aliases: ['biceps curl'] }],
  ['hammer-curl', 'Hammer Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { biceps: 0.55, forearms: 0.45 }, 3.5],
  ['ez-bar-curl', 'Bicep Curl (EZ Bar)', 'weight_reps', 'barbell', 'beginner', { biceps: 0.85, forearms: 0.15 }, 3.5],
  ['preacher-curl', 'Preacher Curl (Barbell)', 'weight_reps', 'barbell', 'beginner', { biceps: 0.9, forearms: 0.1 }, 3.5, { aliases: ['preacher curl (ez bar)'] }],
  ['incline-dumbbell-curl', 'Incline Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { biceps: 0.9, forearms: 0.1 }, 3.5],
  ['concentration-curl', 'Concentration Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { biceps: 0.9, forearms: 0.1 }, 3.5],
  ['cable-curl', 'Bicep Curl (Cable)', 'weight_reps', 'cable', 'beginner', { biceps: 0.85, forearms: 0.15 }, 3.5],
  ['reverse-curl', 'Reverse Curl (Barbell)', 'weight_reps', 'barbell', 'intermediate', { forearms: 0.55, biceps: 0.45 }, 3.5, { aliases: ['reverse curl (ez bar)'] }],
  ['wrist-curl', 'Seated Palms Up Wrist Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { forearms: 1 }, 3, { aliases: ['wrist curl (dumbbell)'] }],
  ['triceps-rope-pushdown', 'Triceps Rope Pushdown', 'weight_reps', 'cable', 'beginner', { triceps: 1 }, 3.5],
  ['triceps-pushdown', 'Triceps Pushdown (Cable - Straight Bar)', 'weight_reps', 'cable', 'beginner', { triceps: 1 }, 3.5, { aliases: ['triceps pushdown (bar)'] }],
  ['overhead-triceps-extension', 'Triceps Extension (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { triceps: 0.95, shoulders: 0.05 }, 3.5, { aliases: ['overhead triceps extension (dumbbell)'] }],
  ['cable-overhead-extension', 'Triceps Extension (Cable)', 'weight_reps', 'cable', 'intermediate', { triceps: 0.95, shoulders: 0.05 }, 3.5, { aliases: ['overhead triceps extension (cable)'] }],
  ['skull-crusher', 'Skullcrusher (Barbell)', 'weight_reps', 'barbell', 'intermediate', { triceps: 1 }, 3.5, { aliases: ['skull crusher (ez bar)', 'lying triceps extension'] }],
  ['close-grip-bench-press', 'Bench Press - Close Grip (Barbell)', 'weight_reps', 'barbell', 'intermediate', { triceps: 0.5, chest: 0.35, shoulders: 0.15 }, 5, { aliases: ['close grip bench press'] }],
  ['triceps-kickback', 'Triceps Kickback (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { triceps: 1 }, 3.5],
  ['bench-dip', 'Bench Dip', 'reps', 'none', 'beginner', { triceps: 0.75, chest: 0.15, shoulders: 0.1 }, 3.8],
  ['triceps-dip', 'Triceps Dip', 'weighted_reps', 'none', 'intermediate', { triceps: 0.6, chest: 0.25, shoulders: 0.15 }, 5],
  ['diamond-push-up', 'Diamond Push-Up', 'reps', 'none', 'intermediate', { triceps: 0.55, chest: 0.35, shoulders: 0.1 }, 3.8],
  ['machine-curl', 'Bicep Curl (Machine)', 'weight_reps', 'machine', 'beginner', { biceps: 0.9, forearms: 0.1 }, 3.5],
  ['band-hammer-curl', 'Hammer Curl (Band)', 'weight_reps', 'band', 'beginner', { biceps: 0.55, forearms: 0.45 }, 3],
  ['cable-hammer-curl', 'Hammer Curl (Cable)', 'weight_reps', 'cable', 'beginner', { biceps: 0.55, forearms: 0.45 }, 3.5, { aliases: ['rope curl'] }],
  ['dumbbell-preacher-curl', 'Preacher Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { biceps: 0.9, forearms: 0.1 }, 3.5],
  ['machine-preacher-curl', 'Preacher Curl (Machine)', 'weight_reps', 'machine', 'beginner', { biceps: 0.9, forearms: 0.1 }, 3.5],
  ['band-reverse-curl', 'Reverse Curl (Band)', 'weight_reps', 'band', 'beginner', { forearms: 0.55, biceps: 0.45 }, 3],
  ['dumbbell-reverse-curl', 'Reverse Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { forearms: 0.55, biceps: 0.45 }, 3.5],
  ['reverse-concentration-curl', 'Reverse Grip Concentration Curl (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { biceps: 0.5, forearms: 0.5 }, 3.5],
  ['dumbbell-skullcrusher', 'Skullcrusher (Dumbbell)', 'weight_reps', 'dumbbell', 'intermediate', { triceps: 1 }, 3.5],
  ['assisted-dip', 'Triceps Dip (Assisted)', 'assisted_reps', 'machine', 'beginner', { triceps: 0.6, chest: 0.25, shoulders: 0.15 }, 4],
  ['barbell-triceps-extension', 'Triceps Extension (Barbell)', 'weight_reps', 'barbell', 'intermediate', { triceps: 0.95, shoulders: 0.05 }, 3.5],
  ['machine-triceps-extension', 'Triceps Extension (Machine)', 'weight_reps', 'machine', 'beginner', { triceps: 1 }, 3.5],
  ['cable-triceps-kickback', 'Triceps Kickback (Cable)', 'weight_reps', 'cable', 'beginner', { triceps: 1 }, 3.5, { aliases: ['cable kickback'] }],
  ['wrist-roller', 'Wrist Roller', 'weight_reps', 'other', 'beginner', { forearms: 0.9, shoulders: 0.1 }, 3],
])

// biome-ignore format: one exercise per line reads as a table
const LEGS = rows('legs', [
  ['barbell-squat', 'Squat (Barbell)', 'weight_reps', 'barbell', 'intermediate', { quads: 0.45, glutes: 0.3, hamstrings: 0.1, lowerBack: 0.1, abs: 0.05 }, 5, { aliases: ['back squat'] }],
  ['front-squat', 'Front Squat (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.55, glutes: 0.25, abs: 0.1, upperBack: 0.1 }, 5],
  ['goblet-squat', 'Goblet Squat (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { quads: 0.5, glutes: 0.3, abs: 0.1, adductors: 0.1 }, 5],
  ['smith-squat', 'Squat (Smith Machine)', 'weight_reps', 'machine', 'beginner', { quads: 0.5, glutes: 0.3, hamstrings: 0.1, adductors: 0.1 }, 4],
  ['hack-squat', 'Hack Squat', 'weight_reps', 'machine', 'beginner', { quads: 0.7, glutes: 0.25, hamstrings: 0.05 }, 4, { aliases: ['hack squat (machine)'] }],
  ['leg-press', 'Leg Press', 'weight_reps', 'machine', 'beginner', { quads: 0.6, glutes: 0.25, hamstrings: 0.1, adductors: 0.05 }, 4, { aliases: ['leg press (machine)'] }],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'weight_reps', 'dumbbell', 'intermediate', { quads: 0.45, glutes: 0.4, hamstrings: 0.1, adductors: 0.05 }, 5, { aliases: ['bulgarian split squat (dumbbell)'] }],
  ['walking-lunge', 'Walking Lunge (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { quads: 0.45, glutes: 0.35, hamstrings: 0.15, calves: 0.05 }, 5],
  ['lunge', 'Lunge (Bodyweight)', 'reps', 'none', 'beginner', { quads: 0.45, glutes: 0.35, hamstrings: 0.15, calves: 0.05 }, 3.8, { aliases: ['lunge'] }],
  ['step-up', 'Step-up', 'weight_reps', 'dumbbell', 'beginner', { quads: 0.45, glutes: 0.45, hamstrings: 0.1 }, 5, { aliases: ['step-up (dumbbell)'] }],
  ['leg-extension', 'Leg Extension (Machine)', 'weight_reps', 'machine', 'beginner', { quads: 1 }, 3.5],
  ['lying-leg-curl', 'Lying Leg Curl (Machine)', 'weight_reps', 'machine', 'beginner', { hamstrings: 0.9, calves: 0.1 }, 3.5],
  ['seated-leg-curl', 'Seated Leg Curl (Machine)', 'weight_reps', 'machine', 'beginner', { hamstrings: 1 }, 3.5],
  ['romanian-deadlift', 'Romanian Deadlift (Barbell)', 'weight_reps', 'barbell', 'intermediate', { hamstrings: 0.5, glutes: 0.3, lowerBack: 0.2 }, 5, { aliases: ['rdl'] }],
  ['dumbbell-romanian-deadlift', 'Romanian Deadlift (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { hamstrings: 0.5, glutes: 0.3, lowerBack: 0.2 }, 5, { aliases: ['db rdl'] }],
  ['hip-thrust', 'Hip Thrust (Barbell)', 'weight_reps', 'barbell', 'intermediate', { glutes: 0.7, hamstrings: 0.2, quads: 0.1 }, 4.5],
  ['glute-bridge', 'Glute Bridge', 'reps', 'none', 'beginner', { glutes: 0.7, hamstrings: 0.2, abs: 0.1 }, 3.5],
  ['cable-kickback', 'Glute Kickback (Cable)', 'weight_reps', 'cable', 'beginner', { glutes: 0.85, hamstrings: 0.15 }, 3.5],
  ['hip-abduction', 'Hip Abductor (Machine)', 'weight_reps', 'machine', 'beginner', { abductors: 0.7, glutes: 0.3 }, 3.5, { aliases: ['hip abduction (machine)'] }],
  ['hip-adduction', 'Hip Adductor (Machine)', 'weight_reps', 'machine', 'beginner', { adductors: 1 }, 3.5, { aliases: ['hip adduction (machine)'] }],
  ['banded-lateral-walk', 'Lateral Band Walk', 'reps', 'band', 'beginner', { abductors: 0.6, glutes: 0.4 }, 3.5, { aliases: ['monster walk'] }],
  ['standing-calf-raise', 'Standing Calf Raise (Machine)', 'weight_reps', 'machine', 'beginner', { calves: 1 }, 3.5],
  ['seated-calf-raise', 'Seated Calf Raise (Machine)', 'weight_reps', 'machine', 'beginner', { calves: 1 }, 3],
  ['bodyweight-squat', 'Squat (Bodyweight)', 'reps', 'none', 'beginner', { quads: 0.5, glutes: 0.35, hamstrings: 0.15 }, 5, { aliases: ['air squat', 'bodyweight squat'] }],
  ['jump-squat', 'Jump Squat', 'reps', 'none', 'intermediate', { quads: 0.5, glutes: 0.35, calves: 0.15 }, 8],
  ['pistol-squat', 'Pistol Squat', 'reps', 'none', 'advanced', { quads: 0.6, glutes: 0.3, abs: 0.1 }, 5],
  ['box-jump', 'Box Jump', 'reps', 'other', 'intermediate', { quads: 0.45, glutes: 0.3, calves: 0.25 }, 8],
  ['wall-sit', 'Wall Sit', 'duration', 'none', 'beginner', { quads: 0.8, glutes: 0.2 }, 3.5],
  ['nordic-curl', 'Nordic Hamstring Curl', 'reps', 'none', 'advanced', { hamstrings: 0.9, glutes: 0.1 }, 3.8],
  ['box-squat', 'Box Squat (Barbell)', 'weight_reps', 'barbell', 'intermediate', { glutes: 0.35, quads: 0.35, hamstrings: 0.15, lowerBack: 0.1, adductors: 0.05 }, 5],
  ['calf-press', 'Calf Press on Leg Press', 'weight_reps', 'machine', 'beginner', { calves: 1 }, 3.5, { aliases: ['calf press on seated leg press', 'calf press (machine)'] }],
  ['cable-pull-through', 'Cable Pull Through', 'weight_reps', 'cable', 'beginner', { glutes: 0.6, hamstrings: 0.3, lowerBack: 0.1 }, 3.5],
  ['glute-ham-raise', 'Glute Ham Raise', 'reps', 'other', 'advanced', { hamstrings: 0.7, glutes: 0.2, calves: 0.1 }, 3.8, { aliases: ['ghr', 'ghd'] }],
  ['machine-glute-kickback', 'Glute Kickback (Machine)', 'weight_reps', 'machine', 'beginner', { glutes: 0.85, hamstrings: 0.15 }, 3.5, { aliases: ['rear kick'] }],
  ['kettlebell-goblet-squat', 'Goblet Squat (Kettlebell)', 'weight_reps', 'kettlebell', 'beginner', { quads: 0.5, glutes: 0.3, abs: 0.1, adductors: 0.1 }, 5],
  ['barbell-hack-squat', 'Hack Squat (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.6, glutes: 0.2, hamstrings: 0.1, forearms: 0.1 }, 5],
  ['bodyweight-hip-thrust', 'Hip Thrust (Bodyweight)', 'reps', 'none', 'beginner', { glutes: 0.7, hamstrings: 0.2, quads: 0.1 }, 3.5],
  ['lateral-box-jump', 'Lateral Box Jump', 'reps', 'other', 'intermediate', { quads: 0.4, glutes: 0.3, calves: 0.2, abductors: 0.1 }, 8],
  ['barbell-lunge', 'Lunge (Barbell)', 'weight_reps', 'barbell', 'intermediate', { quads: 0.45, glutes: 0.35, hamstrings: 0.15, calves: 0.05 }, 5],
  ['dumbbell-lunge', 'Lunge (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { quads: 0.45, glutes: 0.35, hamstrings: 0.15, calves: 0.05 }, 5],
  ['overhead-squat', 'Overhead Squat (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.4, glutes: 0.25, shoulders: 0.15, abs: 0.1, upperBack: 0.1 }, 6],
  ['single-leg-bridge', 'Single Leg Bridge', 'reps', 'none', 'beginner', { glutes: 0.7, hamstrings: 0.2, abs: 0.1 }, 3.5],
  ['band-squat', 'Squat (Band)', 'weight_reps', 'band', 'beginner', { quads: 0.5, glutes: 0.35, hamstrings: 0.15 }, 4],
  ['dumbbell-squat', 'Squat (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { quads: 0.5, glutes: 0.3, hamstrings: 0.1, forearms: 0.1 }, 5],
  ['machine-squat', 'Squat (Machine)', 'weight_reps', 'machine', 'beginner', { quads: 0.6, glutes: 0.3, hamstrings: 0.1 }, 4, { aliases: ['pendulum squat', 'v squat'] }],
  ['barbell-calf-raise', 'Standing Calf Raise (Barbell)', 'weight_reps', 'barbell', 'beginner', { calves: 1 }, 3.5],
  ['bodyweight-calf-raise', 'Standing Calf Raise (Bodyweight)', 'reps', 'none', 'beginner', { calves: 1 }, 3],
  ['dumbbell-calf-raise', 'Standing Calf Raise (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { calves: 1 }, 3.5],
  ['smith-calf-raise', 'Standing Calf Raise (Smith Machine)', 'weight_reps', 'machine', 'beginner', { calves: 1 }, 3.5],
  ['stiff-leg-deadlift', 'Stiff Leg Deadlift (Barbell)', 'weight_reps', 'barbell', 'intermediate', { hamstrings: 0.55, glutes: 0.25, lowerBack: 0.2 }, 5, { aliases: ['straight leg deadlift'] }],
  ['dumbbell-stiff-leg-deadlift', 'Stiff Leg Deadlift (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { hamstrings: 0.55, glutes: 0.25, lowerBack: 0.2 }, 5],
  ['band-straight-leg-deadlift', 'Straight Leg Deadlift (Band)', 'weight_reps', 'band', 'beginner', { hamstrings: 0.55, glutes: 0.3, lowerBack: 0.15 }, 3],
  ['zercher-squat', 'Zercher Squat (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.45, glutes: 0.25, abs: 0.1, upperBack: 0.1, biceps: 0.1 }, 5],
])

// biome-ignore format: one exercise per line reads as a table
const CORE = rows('core', [
  ['crunch', 'Crunch', 'reps', 'none', 'beginner', { abs: 1 }, 3.8],
  ['sit-up', 'Sit Up', 'reps', 'none', 'beginner', { abs: 0.85, obliques: 0.15 }, 3.8, { aliases: ['sit-up', 'situp', 'bangkit tubi'] }],
  ['decline-crunch', 'Decline Crunch', 'reps', 'none', 'intermediate', { abs: 1 }, 3.8],
  ['cable-crunch', 'Cable Crunch', 'weight_reps', 'cable', 'intermediate', { abs: 1 }, 3.5],
  ['bicycle-crunch', 'Bicycle Crunch', 'reps', 'none', 'beginner', { abs: 0.6, obliques: 0.4 }, 3.8],
  ['russian-twist', 'Russian Twist', 'reps', 'none', 'beginner', { obliques: 0.6, abs: 0.4 }, 3.8],
  ['plank', 'Plank', 'duration', 'none', 'beginner', { abs: 0.7, obliques: 0.15, shoulders: 0.15 }, 3.8],
  ['side-plank', 'Side Plank', 'duration', 'none', 'beginner', { obliques: 0.7, abs: 0.2, shoulders: 0.1 }, 3.8],
  ['hollow-hold', 'Hollow Body Hold', 'duration', 'none', 'intermediate', { abs: 1 }, 3.8],
  ['lying-leg-raise', 'Flat Leg Raise', 'reps', 'none', 'beginner', { abs: 0.9, obliques: 0.1 }, 3.8, { aliases: ['lying leg raise'] }],
  ['hanging-knee-raise', 'Hanging Knee Raise', 'reps', 'none', 'beginner', { abs: 0.8, obliques: 0.1, forearms: 0.1 }, 3.8],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'reps', 'none', 'intermediate', { abs: 0.75, obliques: 0.15, forearms: 0.1 }, 3.8],
  ['toes-to-bar', 'Toes To Bar', 'reps', 'none', 'advanced', { abs: 0.7, obliques: 0.1, lats: 0.1, forearms: 0.1 }, 5],
  ['v-up', 'V Up', 'reps', 'none', 'intermediate', { abs: 0.9, obliques: 0.1 }, 3.8, { aliases: ['v-up'] }],
  ['flutter-kicks', 'Flutter Kicks', 'reps', 'none', 'beginner', { abs: 0.9, obliques: 0.1 }, 3.8],
  ['dead-bug', 'Dead Bug', 'reps', 'none', 'beginner', { abs: 0.9, obliques: 0.1 }, 3],
  ['bird-dog', 'Bird Dog', 'reps', 'none', 'beginner', { lowerBack: 0.4, abs: 0.3, glutes: 0.3 }, 3],
  ['mountain-climber', 'Mountain Climber', 'reps', 'none', 'beginner', { abs: 0.5, shoulders: 0.2, quads: 0.3 }, 8],
  ['ab-wheel', 'Ab Wheel', 'reps', 'other', 'intermediate', { abs: 0.8, lats: 0.1, shoulders: 0.1 }, 3.8, { aliases: ['ab wheel rollout'] }],
  ['pallof-press', 'Pallof Press', 'weight_reps', 'cable', 'intermediate', { obliques: 0.7, abs: 0.3 }, 3.5],
  ['cable-twist', 'Cable Twist', 'weight_reps', 'cable', 'intermediate', { obliques: 0.7, abs: 0.3 }, 3.5, { aliases: ['woodchop', 'wood chop'] }],
  ['cross-body-crunch', 'Cross Body Crunch', 'reps', 'none', 'beginner', { obliques: 0.6, abs: 0.4 }, 3.8],
  ['machine-crunch', 'Crunch (Machine)', 'weight_reps', 'machine', 'beginner', { abs: 1 }, 3.5],
  ['stability-ball-crunch', 'Crunch (Stability Ball)', 'reps', 'other', 'beginner', { abs: 0.9, obliques: 0.1 }, 3.8, { aliases: ['swiss ball crunch'] }],
  ['flat-knee-raise', 'Flat Knee Raise', 'reps', 'none', 'beginner', { abs: 0.9, obliques: 0.1 }, 3.8, { aliases: ['lying knee raise'] }],
  ['jackknife-sit-up', 'Jackknife Sit Up', 'reps', 'none', 'intermediate', { abs: 0.9, obliques: 0.1 }, 3.8],
  ['captains-chair-knee-raise', "Knee Raise (Captain's Chair)", 'reps', 'other', 'beginner', { abs: 0.85, obliques: 0.15 }, 3.8, { aliases: ['knee raise parallel bars'] }],
  ['knees-to-elbows', 'Knees to Elbows', 'reps', 'none', 'intermediate', { abs: 0.7, obliques: 0.1, lats: 0.1, forearms: 0.1 }, 5],
  ['oblique-crunch', 'Oblique Crunch', 'reps', 'none', 'beginner', { obliques: 0.8, abs: 0.2 }, 3.8],
  ['reverse-crunch', 'Reverse Crunch', 'reps', 'none', 'beginner', { abs: 0.9, obliques: 0.1 }, 3.8],
  ['reverse-plank', 'Reverse Plank', 'duration', 'none', 'beginner', { glutes: 0.3, hamstrings: 0.2, lowerBack: 0.2, shoulders: 0.15, abs: 0.15 }, 3.5],
  ['band-side-bend', 'Side Bend (Band)', 'weight_reps', 'band', 'beginner', { obliques: 0.85, abs: 0.15 }, 3],
  ['cable-side-bend', 'Side Bend (Cable)', 'weight_reps', 'cable', 'beginner', { obliques: 0.85, abs: 0.15 }, 3.5],
  ['dumbbell-side-bend', 'Side Bend (Dumbbell)', 'weight_reps', 'dumbbell', 'beginner', { obliques: 0.85, abs: 0.15 }, 3.5],
  ['torso-rotation', 'Torso Rotation (Machine)', 'weight_reps', 'machine', 'beginner', { obliques: 0.8, abs: 0.2 }, 3.5],
])

// biome-ignore format: one exercise per line reads as a table
const FULL_BODY = rows('fullBody', [
  ['power-clean', 'Power Clean', 'weight_reps', 'barbell', 'advanced', { quads: 0.2, glutes: 0.2, hamstrings: 0.2, traps: 0.2, shoulders: 0.1, calves: 0.1 }, 6, { aliases: ['olympic'] }],
  ['clean-and-jerk', 'Clean and Jerk (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.25, glutes: 0.2, shoulders: 0.2, traps: 0.15, triceps: 0.1, hamstrings: 0.1 }, 6, { aliases: ['clean and jerk', 'olympic'] }],
  ['snatch', 'Snatch (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.25, glutes: 0.2, shoulders: 0.2, traps: 0.15, hamstrings: 0.1, upperBack: 0.1 }, 6, { aliases: ['snatch', 'olympic'] }],
  ['thruster', 'Thruster (Barbell)', 'weight_reps', 'barbell', 'intermediate', { quads: 0.35, shoulders: 0.3, glutes: 0.2, triceps: 0.15 }, 8],
  ['kettlebell-swing', 'Kettlebell Swing', 'weight_reps', 'kettlebell', 'beginner', { glutes: 0.4, hamstrings: 0.3, lowerBack: 0.15, shoulders: 0.1, abs: 0.05 }, 8, { aliases: ['kb swing'] }],
  ['turkish-get-up', 'Kettlebell Turkish Get Up', 'weight_reps', 'kettlebell', 'advanced', { shoulders: 0.35, abs: 0.3, glutes: 0.2, quads: 0.15 }, 5, { aliases: ['turkish get-up'] }],
  ['burpee', 'Burpee', 'reps', 'none', 'beginner', { quads: 0.3, chest: 0.2, glutes: 0.2, shoulders: 0.15, abs: 0.15 }, 8],
  ['wall-ball', 'Wall Ball', 'weight_reps', 'other', 'intermediate', { quads: 0.45, shoulders: 0.3, glutes: 0.25 }, 8],
  ['medicine-ball-slam', 'Ball Slams', 'weight_reps', 'other', 'beginner', { shoulders: 0.35, abs: 0.35, lats: 0.3 }, 8, { aliases: ['medicine ball slam', 'ball slam'] }],
  ['farmers-walk', "Farmer's Walk", 'weight_distance', 'dumbbell', 'beginner', { forearms: 0.35, traps: 0.35, abs: 0.15, quads: 0.15 }, 6, { aliases: ['farmers carry'] }],
  ['sled-push', 'Sled Push', 'weight_distance', 'other', 'intermediate', { quads: 0.5, glutes: 0.3, calves: 0.2 }, 8],
  ['battle-ropes', 'Battle Ropes', 'duration', 'other', 'beginner', { shoulders: 0.5, abs: 0.2, forearms: 0.15, biceps: 0.15 }, 8],
  ['bear-crawl', 'Bear Crawl', 'duration', 'none', 'beginner', { shoulders: 0.3, abs: 0.3, quads: 0.4 }, 5],
  ['jumping-jacks', 'Jumping Jack', 'reps', 'none', 'beginner', { calves: 0.3, shoulders: 0.3, quads: 0.4 }, 8, { aliases: ['jumping jacks'] }],
  ['high-knees', 'High Knees', 'duration', 'none', 'beginner', { quads: 0.4, abs: 0.3, calves: 0.3 }, 8],
  ['clean', 'Clean (Barbell)', 'weight_reps', 'barbell', 'advanced', { quads: 0.25, glutes: 0.2, hamstrings: 0.2, traps: 0.15, shoulders: 0.1, upperBack: 0.1 }, 6, { aliases: ['squat clean', 'olympic'] }],
  ['deadlift-high-pull', 'Deadlift High Pull (Barbell)', 'weight_reps', 'barbell', 'intermediate', { traps: 0.3, hamstrings: 0.2, glutes: 0.2, shoulders: 0.2, quads: 0.1 }, 6],
  ['hang-clean', 'Hang Clean (Barbell)', 'weight_reps', 'barbell', 'advanced', { traps: 0.25, quads: 0.2, glutes: 0.2, hamstrings: 0.15, shoulders: 0.1, upperBack: 0.1 }, 6, { aliases: ['olympic'] }],
  ['hang-snatch', 'Hang Snatch (Barbell)', 'weight_reps', 'barbell', 'advanced', { shoulders: 0.25, traps: 0.2, quads: 0.2, glutes: 0.15, hamstrings: 0.1, upperBack: 0.1 }, 6, { aliases: ['olympic'] }],
  ['jump-shrug', 'Jump Shrug (Barbell)', 'weight_reps', 'barbell', 'intermediate', { traps: 0.5, calves: 0.2, quads: 0.15, glutes: 0.15 }, 6],
  ['power-snatch', 'Power Snatch (Barbell)', 'weight_reps', 'barbell', 'advanced', { shoulders: 0.25, traps: 0.2, quads: 0.2, glutes: 0.15, hamstrings: 0.1, upperBack: 0.1 }, 6, { aliases: ['olympic'] }],
  ['press-under', 'Press Under (Barbell)', 'weight_reps', 'barbell', 'advanced', { shoulders: 0.5, triceps: 0.2, quads: 0.2, abs: 0.1 }, 5],
  ['snatch-pull', 'Snatch Pull (Barbell)', 'weight_reps', 'barbell', 'advanced', { hamstrings: 0.25, glutes: 0.25, traps: 0.25, lowerBack: 0.15, quads: 0.1 }, 6],
  ['split-jerk', 'Split Jerk (Barbell)', 'weight_reps', 'barbell', 'advanced', { shoulders: 0.35, quads: 0.25, triceps: 0.2, glutes: 0.2 }, 6, { aliases: ['olympic'] }],
  ['sumo-high-pull', 'Sumo Deadlift High Pull (Barbell)', 'weight_reps', 'barbell', 'intermediate', { traps: 0.3, glutes: 0.2, quads: 0.2, shoulders: 0.2, adductors: 0.1 }, 6, { aliases: ['sdhp'] }],
  ['kettlebell-thruster', 'Thruster (Kettlebell)', 'weight_reps', 'kettlebell', 'intermediate', { quads: 0.35, shoulders: 0.3, glutes: 0.2, triceps: 0.15 }, 8],
  ['band-squat-row', 'Squat Row (Band)', 'weight_reps', 'band', 'beginner', { upperBack: 0.35, lats: 0.25, quads: 0.25, glutes: 0.15 }, 3.5],
])

// biome-ignore format: one exercise per line reads as a table
const CARDIO = rows('cardio', [
  ['running', 'Running', 'distance_duration', 'none', 'beginner', { quads: 0.35, calves: 0.25, hamstrings: 0.2, glutes: 0.2 }, 9.3, { health: 37, aliases: ['run', 'jogging', 'lari'] }],
  ['treadmill', 'Running (Treadmill)', 'distance_duration', 'machine', 'beginner', { quads: 0.35, calves: 0.25, hamstrings: 0.2, glutes: 0.2 }, 9, { health: 37, aliases: ['treadmill', 'treadmill run'] }],
  ['walking', 'Walking', 'distance_duration', 'none', 'beginner', { quads: 0.35, calves: 0.35, glutes: 0.3 }, 3.8, { health: 52, aliases: ['walk', 'jalan'] }],
  ['hiking', 'Hiking', 'distance_duration', 'none', 'beginner', { quads: 0.4, glutes: 0.3, calves: 0.3 }, 6, { health: 24, aliases: ['hike'] }],
  ['cycling', 'Cycling', 'distance_duration', 'other', 'beginner', { quads: 0.5, glutes: 0.2, hamstrings: 0.15, calves: 0.15 }, 7.5, { health: 13, aliases: ['bike', 'basikal'] }],
  ['stationary-bike', 'Cycling (Indoor)', 'distance_duration', 'machine', 'beginner', { quads: 0.5, glutes: 0.2, hamstrings: 0.15, calves: 0.15 }, 6.8, { health: 13, aliases: ['stationary bike', 'spin', 'exercise bike'] }],
  ['air-bike', 'Air Bike', 'duration', 'machine', 'intermediate', { quads: 0.4, shoulders: 0.2, glutes: 0.2, hamstrings: 0.2 }, 9, { health: 13, aliases: ['assault bike', 'fan bike'] }],
  ['rowing-machine', 'Rowing (Machine)', 'distance_duration', 'machine', 'beginner', { lats: 0.3, quads: 0.3, upperBack: 0.15, biceps: 0.1, glutes: 0.15 }, 7, { health: 35, aliases: ['rowing machine', 'rower', 'erg'] }],
  ['elliptical', 'Elliptical Machine', 'distance_duration', 'machine', 'beginner', { quads: 0.4, glutes: 0.3, calves: 0.15, shoulders: 0.15 }, 5, { health: 16, aliases: ['elliptical', 'cross trainer'] }],
  ['stair-climber', 'Stair Climber', 'duration', 'machine', 'beginner', { quads: 0.4, glutes: 0.4, calves: 0.2 }, 9.3, { health: 44, aliases: ['stairmaster'] }],
  ['jump-rope', 'Jump Rope', 'duration', 'other', 'beginner', { calves: 0.6, shoulders: 0.2, quads: 0.2 }, 11, { health: 64, aliases: ['skipping'] }],
  ['swimming', 'Swimming', 'distance_duration', 'none', 'beginner', { lats: 0.3, shoulders: 0.3, triceps: 0.1, quads: 0.15, abs: 0.15 }, 7, { health: 46, aliases: ['swim', 'renang'] }],
  ['hiit', 'HIIT', 'duration', 'none', 'intermediate', { quads: 0.3, glutes: 0.2, abs: 0.2, shoulders: 0.15, chest: 0.15 }, 8, { health: 63, aliases: ['circuit', 'interval'] }],
  ['zumba', 'Zumba', 'duration', 'none', 'beginner', { quads: 0.3, glutes: 0.3, calves: 0.2, abs: 0.2 }, 6.5, { health: 77 }],
  ['dance', 'Dance', 'duration', 'none', 'beginner', { quads: 0.3, glutes: 0.3, calves: 0.2, abs: 0.2 }, 5, { health: 78, aliases: ['dancing', 'menari'] }],
  ['aerobics', 'Aerobics', 'duration', 'none', 'beginner', { quads: 0.3, glutes: 0.25, calves: 0.25, shoulders: 0.2 }, 7.3, { health: 73, aliases: ['aerobic class', 'step aerobics'] }],
])

// biome-ignore format: one exercise per line reads as a table
const MOBILITY = rows('mobility', [
  ['yoga', 'Yoga', 'duration', 'none', 'beginner', { abs: 0.25, hamstrings: 0.25, shoulders: 0.2, glutes: 0.15, lowerBack: 0.15 }, 2.3, { health: 57 }],
  ['pilates', 'Pilates', 'duration', 'none', 'beginner', { abs: 0.45, obliques: 0.2, glutes: 0.2, lowerBack: 0.15 }, 2.8, { health: 66 }],
  ['stretching', 'Stretching', 'duration', 'none', 'beginner', { hamstrings: 0.3, quads: 0.2, lowerBack: 0.2, shoulders: 0.15, glutes: 0.15 }, 2.3, { health: 62, aliases: ['stretch', 'mobility', 'cooldown'] }],
  ['foam-rolling', 'Foam Rolling', 'duration', 'other', 'beginner', { quads: 0.3, hamstrings: 0.25, calves: 0.2, upperBack: 0.25 }, 2, { health: 33, aliases: ['recovery'] }],
  ['tai-chi', 'Tai Chi', 'duration', 'none', 'beginner', { quads: 0.35, glutes: 0.25, abs: 0.2, shoulders: 0.2 }, 3, { health: 72 }],
])

export const EXERCISES: readonly Exercise[] = [
  ...CHEST,
  ...BACK,
  ...SHOULDERS,
  ...ARMS,
  ...LEGS,
  ...CORE,
  ...FULL_BODY,
  ...CARDIO,
  ...MOBILITY,
]

const BY_ID: ReadonlyMap<string, Exercise> = new Map(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
)

/** A built-in exercise by id, or undefined for a custom one or a retired id. */
export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id)
}
