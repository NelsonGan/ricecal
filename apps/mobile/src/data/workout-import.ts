import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { ImportPlan } from '@/features/workouts/import/build'
import { type Logged, matchLogged } from '@/features/workouts/import/existing'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useUserId } from './session'
import type { WorkoutDocument } from './workout-outbox'
import { SAVE_TIMEOUT_MS, wasRefused } from './workouts'

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
 * sets starting a whole time-zone offset away, up to 14 hours: the same
 * session imported from the other app. Hevy's own import of a Strong history
 * reads Strong's wall-clock times as UTC, so someone who moved from Strong to
 * Hevy has every old workout in both files, shifted by their offset.
 *
 * A save that fails for a reason a retry can fix (no signal, a timeout, the
 * app sent to the background) stops the import rather than marking the rest
 * failed one by one, and trying again carries on where it stopped, since what
 * was saved is skipped.
 */

export type ImportProgress = { done: number; total: number }

export type ImportResult = {
  saved: number
  /** Already in the history, so skipped. */
  existing: number
  /** Refused by the server for what they hold; trying again will not help. */
  failed: number
  /** Custom exercises this import made. */
  created: number
}

/** An import cut short by something a retry can fix, with what it got done. */
export class ImportStopped extends Error {
  constructor(readonly result: ImportResult) {
    super('import stopped')
  }
}

/** Requests in flight at once: enough to be quick, few enough to stay under the API's rate. */
const PARALLEL = 4
const PAGE = 1000
/** Ids per `in` filter, which travels in the URL. */
const ID_BATCH = 150

/**
 * Every row of a paged query. Until a page comes back empty rather than until
 * a short one, because the server's own row cap can sit below `PAGE`, and a
 * short first page then read as the end of the list.
 */
async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) return rows
    rows.push(...data)
    from += data.length
  }
}

const nameKey = (name: string) => name.trim().toLowerCase()

async function customIds(
  userId: string,
  plan: ImportPlan,
): Promise<{ ids: Map<string, string>; created: number }> {
  const read = async () =>
    new Map(
      (
        await everyRow((from, to) =>
          supabase
            .from('custom_exercises')
            .select('id, name')
            .eq('user_id', userId)
            .order('id')
            .range(from, to),
        )
      ).map((row) => [nameKey(row.name), row.id]),
    )
  const ids = await read()
  const missing = plan.customs.filter((custom) => !ids.has(nameKey(custom.name)))
  let created = 0
  // One at a time rather than one insert of all of them: the names are unique
  // per account, so one made in between on another device failed the whole
  // batch, and every other new exercise went missing with it.
  for (const custom of missing) {
    const { error } = await supabase.from('custom_exercises').insert({
      user_id: userId,
      name: custom.name,
      tracking: custom.tracking,
      equipment: custom.equipment,
      category: custom.category,
    })
    if (!error) created++
    else if (error.code !== '23505') throw error
  }
  return { ids: missing.length ? await read() : ids, created }
}

/** The workouts already logged across the file's dates, a day either side. */
async function loggedAround(userId: string, plan: ImportPlan): Promise<Logged[]> {
  if (!plan.from || !plan.to) return []
  const from = new Date(`${plan.from}T00:00:00`)
  from.setDate(from.getDate() - 1)
  const to = new Date(`${plan.to}T00:00:00`)
  to.setDate(to.getDate() + 2)
  const rows = await everyRow((first, last) =>
    supabase
      .from('workout_summaries')
      .select('id, name, started_at, set_count')
      .eq('user_id', userId)
      .gte('started_at', from.toISOString())
      .lt('started_at', to.toISOString())
      .order('started_at')
      .order('id')
      .range(first, last),
  )
  return rows.flatMap((row) =>
    row.id && row.started_at
      ? [
          {
            id: row.id,
            start: new Date(row.started_at).getTime(),
            name: nameKey(row.name ?? ''),
            sets: row.set_count ?? 0,
          },
        ]
      : [],
  )
}

/**
 * The planned ids already saved, wherever they are now: an imported workout
 * the person has since moved to another day is outside the file's dates, and
 * missed there it would be written over.
 */
async function savedIds(userId: string, plan: ImportPlan): Promise<Set<string>> {
  const ids = plan.workouts.map(({ document }) => document.id)
  const saved = new Set<string>()
  for (let at = 0; at < ids.length; at += ID_BATCH) {
    const { data, error } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .in('id', ids.slice(at, at + ID_BATCH))
    if (error) throw error
    for (const row of data) saved.add(row.id)
  }
  return saved
}

/** The planned workouts already in the history, by id, for the preview and the import. */
export async function findAlreadyImported(userId: string, plan: ImportPlan): Promise<Set<string>> {
  const [logged, saved] = await Promise.all([loggedAround(userId, plan), savedIds(userId, plan)])
  return matchLogged(plan, logged, saved)
}

async function save(document: WorkoutDocument) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS)
  try {
    return await supabase
      .rpc('save_workout', { p_workout: document as unknown as Json })
      .abortSignal(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export function useWorkoutImport() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useCallback(
    async (
      plan: ImportPlan,
      onProgress: (progress: ImportProgress) => void,
    ): Promise<ImportResult> => {
      const result: ImportResult = { saved: 0, existing: 0, failed: 0, created: 0 }
      let stopped = false
      try {
        const customs = await customIds(userId, plan)
        result.created = customs.created
        const already = await findAlreadyImported(userId, plan)

        const fresh: WorkoutDocument[] = []
        for (const { document, customNames } of plan.workouts) {
          if (already.has(document.id)) continue
          fresh.push({
            ...document,
            exercises: document.exercises.map((exercise, index) => {
              const customName = customNames[index]
              if (!customName) return exercise
              return { ...exercise, exercise_id: customs.ids.get(nameKey(customName)) ?? '' }
            }),
          })
        }
        result.existing = plan.workouts.length - fresh.length

        let next = 0
        onProgress({ done: 0, total: fresh.length })
        const worker = async () => {
          while (!stopped && next < fresh.length) {
            const document = fresh[next++]
            // A custom exercise that could not be made has no id to save under.
            if (document.exercises.some((exercise) => !exercise.exercise_id)) {
              result.failed++
            } else {
              const { error } = await save(document)
              if (!error) result.saved++
              else if (wasRefused(error)) result.failed++
              else {
                stopped = true
                break
              }
            }
            onProgress({ done: result.saved + result.failed, total: fresh.length })
          }
        }
        await Promise.all(Array.from({ length: PARALLEL }, worker))
      } catch (failure) {
        console.warn('[workouts] import stopped', failure)
        stopped = true
      } finally {
        queryClient.invalidateQueries({ queryKey: keys.workoutsAll(userId) })
        queryClient.invalidateQueries({ queryKey: keys.customExercises(userId) })
      }
      if (stopped) throw new ImportStopped(result)
      return result
    },
    [userId, queryClient],
  )
}
