// Deleting an account, for good, from inside the app.
//
// App Review guideline 5.1.1(v): an app that lets somebody create an account
// has to let them delete it, from the app, without writing to anybody. So this
// is the whole of it — no ticket, no reply from a person, no waiting.
//
// WHAT IT DELETES. Two things, and they are in different systems:
//
//   1. Every object in R2 under this user's two prefixes. Photographs of meals
//      and the profile picture.
//   2. The `auth.users` row. Every table in the schema hangs off it with
//      `on delete cascade`, so the profile, the diary, the goals, the recipes,
//      the weigh-ins, the activity and the subscription mirror all go with it
//      in one statement. Nothing here enumerates tables, deliberately: a list
//      of tables in this file is a list that a future migration silently makes
//      wrong, and the cascade is checked by the database rather than by me.
//
// THE ORDER IS THE POINT, and it is the opposite of the retention sweep's.
// That one deletes the object before forgetting the key, because the row is the
// only record of the key. Here the KEYS ARE DERIVED FROM THE USER ID, so the
// user id is the thing that must outlive the sweep: delete the account first
// and a failed sweep strands every photograph for ever, with nothing left in
// the system that knows the prefix. Objects first, account second.
//
// SO A FAILURE LEAVES THE ACCOUNT INTACT, and says so. The caller can press the
// button again, and the second attempt is cheaper than the first, because the
// objects the first one did delete are really gone. Nothing here is a
// half-deleted account: either the row is gone or nothing happened.
//
// WHAT IT DOES NOT DELETE. Recipes somebody else saved into their own diary
// (`source_recipe_id` is `on delete set null`, and the copy became theirs when
// they saved it); the anonymous catalogue-widening rows, which carry a search
// term and no account; and whatever Apple, Google or RevenueCat hold about a
// purchase, which is theirs. `ricecal.app/data-deletion` says all of this in
// the user's own words, and the two must not drift apart.
//
// `verify_jwt = false` and the header is inspected here, for the same reason as
// every other function in this directory: a failure then says which half broke.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import { deleteUserObjects, r2Configured } from '../_shared/r2.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: auth, error: authError } = await anonClient.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) return json({ ok: false, error: 'not signed in' }, 401)

  /**
   * A word in the body, and the one piece of the request that is not derived
   * from the token.
   *
   * It grants nothing and proves nothing — anybody holding the token can send
   * it. It exists so that this endpoint cannot be reached by ACCIDENT: an
   * empty POST to the wrong path, a retry replaying a body that was meant for
   * something else, a client library probing a URL. The confirmation the user
   * actually gives is the two-step sheet in the app; this is the machine's
   * copy of it.
   */
  let confirmed = false
  try {
    const parsed = await req.json()
    confirmed =
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { confirm?: unknown }).confirm === true
  } catch {
    // A missing or unparseable body is simply not a confirmation.
  }
  if (!confirmed) return json({ ok: false, error: 'confirm must be true' }, 400)

  /**
   * No storage, no deletion — and this is the strict reading on purpose.
   *
   * Carrying on would delete the account and leave the photographs, whose only
   * name is a prefix built from the id that is about to stop existing. A
   * deployment that has lost its R2 credentials is a deployment that cannot
   * finish this job, and saying so is better than half-doing it silently.
   */
  if (!r2Configured()) {
    return json({ ok: false, error: 'storage is not configured on this deployment' }, 503)
  }

  let photos: number
  try {
    photos = await deleteUserObjects(userId)
  } catch (error) {
    console.error('[delete-account] could not clear storage:', (error as Error).message)
    return json({ ok: false, error: 'could not delete your photos; nothing was deleted' }, 502)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Hard, not soft. `deleteUser`'s second argument is `shouldSoftDelete`, and
  // the default is a real delete: the row leaves `auth.users`, which is what
  // fires every cascade in the schema. A soft delete would keep the row, keep
  // the address unusable for a new account, and cascade nothing at all.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error('[delete-account] could not delete the user:', deleteError.message)
    return json({ ok: false, error: 'could not delete your account' }, 500)
  }

  console.info(`[delete-account] deleted ${userId} and ${photos} object(s)`)
  return json({ ok: true, photos })
})
