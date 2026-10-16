import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { ImportPlan } from '@/features/workouts/import/build'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'
import type { WorkoutDocument } from './workout-outbox'

/**
 * Saves a planned import (`features/workouts/import/build.ts`) into the
 * account: the custom exercises it needs first, then each workout through
 * `save_workout`, the same write a finished workout makes.
 *
 * A workout already in the history is left alone rather than written over,
 * so importing a file twice adds nothing the second time and an imported
 * workout the person has since edited keeps their edit. "Already there" is
 * the same id (the same file again), a workout starting within a minute of it
 * (the same session logged here), or one with the same name and number of
 * sets starting within 14 hours: the same session imported from the other
 * app. Hevy's own import of a Strong history reads Strong's wall-clock times
 * as UTC, so someone who moved from Strong to Hevy has every old workout in
 * both files, shifted by their time zone's offset, which is never more than 14.
 */

export type ImportProgress = { done: number; total: number }

export type ImportResult = {
  saved: number
  /** Already in the history, so skipped. */
  existing: number
  failed: number
}

/** Requests in flight at once: enough to be quick, few enough to stay under the API's rate. */
const PARALLEL = 4
const SAME_SESSION_MS = 60_000
const SHIFTED_SESSION_MS = 14 * 3_600_000
const PAGE = 1000

async function customIds(userId: string, plan: ImportPlan): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  const read = async () => {
    const { data, error } = await supabase
      .from('custom_exercises')
      .select('id, name')
      .eq('user_id', userId)
    if (error) throw error
    for (const row of data) ids.set(row.name.trim().toLowerCase(), row.id)
  }
  await read()
  const missing = plan.customs.filter((custom) => !ids.has(custom.name.toLowerCase()))
  if (missing.length) {
    const { error } = await supabase.from('custom_exercises').insert(
      missing.map((custom) => ({
        user_id: userId,
        name: custom.name,
        tracking: custom.tracking,
        equipment: custom.equipment,
        category: custom.category,
      })),
    )
    // Another device made one of them in between: the names are what matter,
    // and reading them back below finds whichever row won.
    if (error && error.code !== '23505') throw error
    await read()
  }
  return ids
}

type Logged = { start: number; name: string; sets: number }

/** The workouts already logged across the file's dates, a day either side. */
async function existingWorkouts(userId: string, plan: ImportPlan) {
  const ids = new Set<string>()
  const logged: Logged[] = []
  if (!plan.from || !plan.to) return { ids, logged }
  const from = new Date(`${plan.from}T00:00:00`)
  from.setDate(from.getDate() - 1)
  const to = new Date(`${plan.to}T00:00:00`)
  to.setDate(to.getDate() + 2)
  // Pages until a short one: `PAGE` is the server's own row cap.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('workout_summaries')
      .select('id, name, started_at, set_count')
      .eq('user_id', userId)
      .gte('started_at', from.toISOString())
      .lt('started_at', to.toISOString())
      .order('started_at')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    for (const row of data) {
      if (!row.id || !row.started_at) continue
      ids.add(row.id)
      logged.push({
        start: new Date(row.started_at).getTime(),
        name: (row.name ?? '').trim().toLowerCase(),
        sets: row.set_count ?? 0,
      })
    }
    if (data.length < PAGE) break
  }
  return { ids, logged }
}

function alreadyLogged(document: WorkoutDocument, logged: Logged[]): boolean {
  const start = new Date(document.started_at).getTime()
  const name = document.name.trim().toLowerCase()
  const sets = document.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
  return logged.some((workout) => {
    const apart = Math.abs(workout.start - start)
    return (
      apart < SAME_SESSION_MS ||
      (apart <= SHIFTED_SESSION_MS && workout.name === name && workout.sets === sets)
    )
  })
}

/** The planned workouts already in the history, by id. */
async function alreadyThere(userId: string, plan: ImportPlan): Promise<Set<string>> {
  const existing = await existingWorkouts(userId, plan)
  return new Set(
    plan.workouts
      .map(({ document }) => document)
      .filter(
        (document) => existing.ids.has(document.id) || alreadyLogged(document, existing.logged),
      )
      .map((document) => document.id),
  )
}

/**
 * How much of a file is already in the history, for the preview: a Strong
 * history imported into Hevy is mostly the same workouts twice, and "Import
 * 92 workouts" over a file that will add 21 is a promise the import breaks.
 * The import itself checks again, since the history can change in between.
 */
export function useImportOverlap(plan: ImportPlan | null) {
  const userId = useUserId()
  const first = plan?.workouts[0]?.document.id ?? ''
  const last = plan?.workouts.at(-1)?.document.id ?? ''
  return useQuery({
    queryKey: keys.importOverlap(userId, `${plan?.workouts.length ?? 0}|${first}|${last}`),
    // A list rather than the Set, because the query cache is persisted as JSON.
    queryFn: async () => (plan ? [...(await alreadyThere(userId, plan))] : []),
    enabled: Boolean(plan?.workouts.length),
    gcTime: 0,
  })
}

export function useWorkoutImport() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useCallback(
    async (
      plan: ImportPlan,
      onProgress: (progress: ImportProgress) => void,
    ): Promise<ImportResult> => {
      const customs = await customIds(userId, plan)
      const existing = await alreadyThere(userId, plan)

      const fresh: WorkoutDocument[] = []
      for (const { document, customNames } of plan.workouts) {
        if (existing.has(document.id)) continue
        fresh.push({
          ...document,
          exercises: document.exercises.map((exercise, index) => {
            const customName = customNames[index]
            if (!customName) return exercise
            return { ...exercise, exercise_id: customs.get(customName.toLowerCase()) ?? '' }
          }),
        })
      }

      const result: ImportResult = {
        saved: 0,
        existing: plan.workouts.length - fresh.length,
        failed: 0,
      }
      let next = 0
      onProgress({ done: 0, total: fresh.length })
      const worker = async () => {
        while (next < fresh.length) {
          const document = fresh[next++]
          // A custom exercise that could not be made has no id to save under.
          const ready = document.exercises.every((exercise) => exercise.exercise_id)
          const { error } = ready
            ? await supabase.rpc('save_workout', { p_workout: document as unknown as Json })
            : { error: new Error('missing exercise') }
          if (error) result.failed++
          else result.saved++
          onProgress({ done: result.saved + result.failed, total: fresh.length })
        }
      }
      try {
        await Promise.all(Array.from({ length: PARALLEL }, worker))
      } finally {
        queryClient.invalidateQueries({ queryKey: keys.workoutsAll(userId) })
        queryClient.invalidateQueries({ queryKey: keys.customExercises(userId) })
      }
      return result
    },
    [userId, queryClient],
  )
}
