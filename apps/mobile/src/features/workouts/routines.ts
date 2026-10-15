import type { Routine, RoutineExercise, WorkoutDetail } from '@/data'
import type { ExercisePlan, LiveExercise } from './model'
import { type Template, templatePlans } from './templates'

/**
 * The conversions between the three shapes a plan takes: a routine as stored
 * (`workout_routines.exercises`, snake case, the server's), the logger's plan,
 * and a saved workout read back.
 */

export function routinePlans(routine: Pick<Routine, 'exercises'>): ExercisePlan[] {
  return routine.exercises.map((exercise) => ({
    exerciseId: exercise.exercise_id,
    name: exercise.exercise_name,
    tracking: exercise.tracking,
    restS: exercise.rest_s ?? null,
    superset: exercise.superset ?? null,
    notes: exercise.notes ?? null,
    sets: exercise.sets.map((set) => ({
      kind: set.kind,
      weightKg: set.weight_kg ?? null,
      reps: set.reps ?? null,
      durationS: set.duration_s ?? null,
      distanceM: set.distance_m ?? null,
    })),
  }))
}

export function plansToRoutine(plans: readonly ExercisePlan[]): RoutineExercise[] {
  return plans.map((plan) => ({
    exercise_id: plan.exerciseId,
    exercise_name: plan.name,
    tracking: plan.tracking,
    rest_s: plan.restS ?? null,
    superset: plan.superset ?? null,
    notes: plan.notes?.trim() || null,
    sets: plan.sets.map((set) => ({
      kind: set.kind ?? 'normal',
      weight_kg: set.weightKg ?? null,
      reps: set.reps ?? null,
      duration_s: set.durationS ?? null,
      distance_m: set.distanceM ?? null,
    })),
  }))
}

/** The logger's exercises as a plan again, for saving an edited routine. */
export function liveToPlans(exercises: readonly LiveExercise[]): ExercisePlan[] {
  return exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    tracking: exercise.tracking,
    restS: exercise.restS,
    superset: exercise.superset,
    notes: exercise.notes,
    sets: exercise.sets.map((set) => ({
      kind: set.kind,
      weightKg: set.weightKg,
      reps: set.reps,
      durationS: set.durationS,
      distanceM: set.distanceM,
    })),
  }))
}

/** A saved workout as a plan: "repeat this workout" and "save as routine". */
export function workoutPlans(workout: Pick<WorkoutDetail, 'entries'>): ExercisePlan[] {
  return workout.entries.map((entry) => ({
    exerciseId: entry.exerciseId,
    name: entry.name,
    tracking: entry.tracking,
    restS: entry.restS,
    superset: entry.superset,
    notes: entry.notes,
    sets: entry.sets.map((set) => ({
      kind: set.kind,
      weightKg: set.weightKg,
      reps: set.reps,
      durationS: set.durationS,
      distanceM: set.distanceM,
    })),
  }))
}

export function templateRoutine(template: Template): RoutineExercise[] {
  return plansToRoutine(templatePlans(template))
}
