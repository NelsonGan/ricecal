// The photograph sweep: a free account's plates are kept for thirty days.
//
// WHY A FUNCTION AND NOT A CRON JOB IN POSTGRES. The bytes are in R2 and
// Postgres cannot reach it. A statement that nulled `photo_path` without
// deleting the object would strand the bytes for good — the key is the only
// name they have, and nothing else in the system records it. So the order is
// fixed and this file is the only thing that can hold it: read the keys, delete
// the objects, and only then forget them. A crash between the two leaves a row
// naming an object that is gone; the next run asks R2 to delete a key that is
// already absent, which S3 answers 204 to, and finishes the job. The other
// order has no recovery at all.
//
// WHAT IS DELETED IS THE PICTURE AND NOTHING ELSE. The entry stays: its name,
// its macros, its portion and its place in the diary are the calorie history
// the user came for, and an app that quietly deleted those would be deleting
// their record of their own year. `clear_meal_photos` puts a drawing where the
// plate was, so a swept month reads as a diary of illustrated meals rather than
// as a column of grey placeholder tiles.
//
// NOT THE SAME AUTH AS THE OTHERS. There is no user here — the sweep runs
// across every account — so there is no Authorization header to inspect and no
// JWT to trust. It checks a shared secret instead, exactly as the RevenueCat
// webhook does, and refuses everything when the secret is unset rather than
// accepting everything: unconfigured, this endpoint would be a way for anybody
// to delete other people's photographs.
//
// Invoked by `.github/workflows/retention.yml`, daily. A missed day costs
// nothing: the next run finds the same rows plus a day's worth more, and the
// batch cap below is what stops a long outage from turning into one enormous
// request.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import { iconFor } from '../_shared/icon-match.ts'
import { deleteObject, r2Configured } from '../_shared/r2.ts'

/**
 * How many photographs one run deletes.
 *
 * An edge function has a wall-clock ceiling and each delete is a round trip to
 * R2, so the sweep is bounded rather than run to exhaustion. The workflow calls
 * it once a day and a day of free users' plates is far below this; the cap
 * exists for the first run after a backlog, where it turns "one request that
 * times out having deleted an unknown amount" into "one request that deletes
 * 500 and says there is more".
 */
const BATCH = 500

/** Deletes in flight at once. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 10

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type ExpiredPhoto = { id: string; photo_path: string }

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('RETENTION_TOKEN')
  // Unset means refuse, not allow. See the header: an open version of this
  // endpoint deletes strangers' photographs.
  if (!secret) {
    console.error('[retention] RETENTION_TOKEN is not set, refusing')
    return json({ ok: false, error: 'retention is not configured' }, 503)
  }
  if (req.headers.get('x-retention-token') !== secret) {
    return json({ ok: false, error: 'not authorised' }, 401)
  }

  // Nothing to delete into. Answering 503 rather than sweeping is what keeps a
  // misconfigured deploy from clearing `photo_path` on rows whose objects are
  // still there — which would be exactly the unrecoverable half.
  if (!r2Configured()) {
    return json({ ok: false, error: 'R2 is not configured' }, 503)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data, error } = await db.rpc('expired_meal_photos', { p_limit: BATCH })
  if (error) {
    console.error('[retention] could not read the backlog:', error.message)
    return json({ ok: false, error: error.message }, 500)
  }

  const expired = (data ?? []) as ExpiredPhoto[]
  if (expired.length === 0) return json({ ok: true, swept: 0, remaining: false })

  // Deleted first, cleared second. A row whose delete failed keeps its
  // `photo_path` and is picked up again next run; a row whose delete succeeded
  // and whose clear failed is picked up again too, and the second delete is a
  // no-op. Only the failures are dropped from the clear list, so one bad key
  // does not hold up the other four hundred and ninety nine.
  const cleared: ExpiredPhoto[] = []
  for (let i = 0; i < expired.length; i += CONCURRENCY) {
    const slice = expired.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(slice.map((row) => deleteObject(row.photo_path)))
    results.forEach((result, index) => {
      const row = slice[index]
      if (result.status === 'fulfilled') cleared.push(row)
      else console.error(`[retention] could not delete ${row.photo_path}:`, result.reason)
    })
  }

  if (cleared.length === 0) {
    return json({ ok: false, swept: 0, error: 'every delete failed' }, 502)
  }

  // The drawing that replaces the photograph, matched off the entry's own name
  // by the same table the barcode path uses. A name it cannot place passes null
  // and the row keeps the placeholder tile, which is the honest answer for a
  // dish we have no illustration of.
  const names = await db
    .from('food_logs')
    .select('id, item_name')
    .in(
      'id',
      cleared.map((row) => row.id),
    )
  if (names.error) {
    console.error('[retention] could not read names for icons:', names.error.message)
  }
  const nameOf = new Map<string, string>(
    ((names.data ?? []) as Array<{ id: string; item_name: string }>).map((row) => [
      row.id,
      row.item_name,
    ]),
  )

  const rows = cleared.map((row) => {
    const icon = iconFor(nameOf.get(row.id) ?? null)
    return { id: row.id, icon_set: icon?.set ?? null, icon_name: icon?.name ?? null }
  })

  const { data: count, error: clearError } = await db.rpc('clear_meal_photos', { p_rows: rows })
  if (clearError) {
    // The objects are gone and the rows still name them. Reported rather than
    // hidden, because the next run repairs it and a silent 200 here would make
    // a permanent failure look like a working sweep.
    console.error(
      '[retention] deleted the objects but could not clear the rows:',
      clearError.message,
    )
    return json({ ok: false, deleted: cleared.length, error: clearError.message }, 500)
  }

  console.log(`[retention] swept ${count} photographs`)
  return json({
    ok: true,
    swept: count,
    // True when this run filled its batch, which is the caller's cue that there
    // is a backlog rather than a day's worth.
    remaining: expired.length === BATCH,
  })
})
