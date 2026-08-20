/**
 * The photograph sweep: a free account's plates are kept for thirty days.
 *
 * WHAT IS DELETED IS THE PICTURE AND NOTHING ELSE. The entry stays: its name,
 * its macros, its portion and its place in the diary are the calorie history
 * the user came for, and an app that quietly deleted those would be deleting
 * their record of their own year. `clear_meal_photos` puts a drawing where the
 * plate was, so a swept month reads as a diary of illustrated meals rather
 * than as a column of grey placeholder tiles.
 *
 * THE ORDER IS THE WHOLE PROBLEM, and it is the same order this had as an edge
 * function. Delete the object, THEN forget the key. A crash between the two
 * leaves a row naming an object that is gone; the next run asks R2 to delete a
 * key that is already absent, which is a no-op, and finishes the job. The
 * other order strands the bytes for ever — the key is the only name they have,
 * and nothing else in the system records it.
 *
 * WHAT CHANGED WHEN IT MOVED HERE, beyond losing a public endpoint and a
 * shared secret:
 *
 *   1. R2 IS A BINDING. `env.PHOTOS.delete(keys)` takes an array, so five
 *      hundred deletes are one call rather than five hundred signed S3 round
 *      trips fanned out ten at a time. `aws4fetch`, the concurrency loop and
 *      the four `R2_*` credentials all went with it.
 *   2. THE DRAIN LOOP CAME BACK. Under `pg_net` the caller could not read its
 *      own response, so "is there more" could not drive anything and the
 *      backlog was spread over twenty-four hourly batches instead. A cron on
 *      an hourly interval gets fifteen minutes of CPU, so this simply keeps
 *      going until it runs dry.
 *   3. THE NAME COMES BACK WITH THE ROW. `expired_meal_photos` returns
 *      `item_name`, so the icon match no longer needs a second query.
 */
import { iconFor } from '../../../../../supabase/functions/_shared/icon-match.ts'
import type { Job } from '../job.ts'

/**
 * How many photographs one pass through the loop asks for.
 *
 * `expired_meal_photos` caps its own limit at 1,000; five hundred keeps one
 * batch to a single R2 delete call and a single `clear_meal_photos` statement.
 */
const BATCH = 500

/**
 * R2's ceiling on a bulk delete. `BATCH` is under it, so this only matters if
 * somebody raises that — which is exactly when a silent truncation would be
 * worst.
 */
const DELETE_CHUNK = 1000

/**
 * How many batches one run will do before stopping, with more still expired.
 *
 * Ten thousand photographs is far more than a day produces, so reaching this
 * means a backlog that built up while something was broken. It stops rather
 * than running to exhaustion because a run bounded by a number is easier to
 * reason about than one bounded by a fifteen minute timeout, and the next hour
 * picks up where this left off. It says so in the log when it happens: a cap
 * nobody is told about reads as "swept everything".
 */
const MAX_BATCHES = 20

type ExpiredPhoto = {
  id: string
  photo_path: string
  item_name: string | null
}

export const retention: Job = {
  name: 'retention',
  cron: '17 * * * *',

  async run({ env, rpc, log }) {
    let swept = 0
    let batches = 0
    let drained = false

    while (batches < MAX_BATCHES) {
      const expired = await rpc<ExpiredPhoto[]>('expired_meal_photos', { p_limit: BATCH })
      if (expired.length === 0) {
        drained = true
        break
      }
      batches += 1

      // Only rows whose object is actually gone may be cleared. A chunk that
      // throws is left entirely alone — its rows keep their `photo_path` and
      // the next run finds them again — which is the same recovery the crash
      // case relies on.
      const cleared: ExpiredPhoto[] = []
      let failed = 0
      for (let i = 0; i < expired.length; i += DELETE_CHUNK) {
        const chunk = expired.slice(i, i + DELETE_CHUNK)
        try {
          await env.PHOTOS.delete(chunk.map((row) => row.photo_path))
          cleared.push(...chunk)
        } catch (error) {
          failed += chunk.length
          log('could not delete a chunk, leaving its rows for the next run', {
            size: chunk.length,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Nothing at all came out. That is R2 refusing rather than a key being
      // missing (an absent key deletes fine), so it is worth failing the run
      // over instead of looping on it.
      if (cleared.length === 0) {
        throw new Error(`every delete failed for ${expired.length} photographs`)
      }

      const rows = cleared.map((row) => {
        const icon = iconFor(row.item_name)
        return { id: row.id, icon_set: icon?.set ?? null, icon_name: icon?.name ?? null }
      })
      swept += await rpc<number>('clear_meal_photos', { p_rows: rows })

      // Some of this batch is still out there with its `photo_path` intact, so
      // asking again would return the same rows and spin until the cap. Leave
      // them to the next run.
      if (failed > 0) break

      // A short batch is the backlog running out.
      if (expired.length < BATCH) {
        drained = true
        break
      }
    }

    if (!drained) {
      log('stopped with photographs still expired; the next run continues', { batches })
    }

    return { swept, batches, drained }
  },
}
