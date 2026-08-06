// The entire Phase 0 server surface, with zero business logic.
//
// Three things are proven here, each of which a real feature will later depend
// on, and none of which is worth discovering is broken at that point:
//
//   1. Auth passthrough  — the caller's JWT reaches the function and resolves
//                          to a user, with no custom authorizer in between.
//   2. Secrets           — a value set via `supabase secrets set` is readable
//                          at runtime.
//   3. R2 presigning     — a presigned PUT URL can be minted, so the photo
//                          upload path works before any photo feature exists.
//
// `verify_jwt = false` in config.toml is deliberate: this function inspects the
// Authorization header itself so it can report *why* auth failed, rather than
// being rejected by the platform with an opaque 401.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import { r2Configured, signPut } from '../_shared/r2.ts'

interface HealthcheckResponse {
  ok: boolean
  userId: string | null
  authError: string | null
  secretPresent: boolean
  uploadUrl: string | null
  uploadError: string | null
}

function json(body: HealthcheckResponse, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Mints a presigned PUT. Returns null with a reason when the R2 credentials are
 * not set, so the auth half of this endpoint still answers on a stack that has
 * no Cloudflare.
 *
 * Its own `healthcheck/` prefix, deliberately outside the two the app uses: a
 * smoke test must not be able to write where a meal photo or an avatar lives,
 * and anything left here is swept by the bucket's lifecycle rule.
 */
async function presignUpload(
  userId: string,
): Promise<{ url: string | null; error: string | null }> {
  if (!r2Configured()) return { url: null, error: 'R2 secrets not set' }
  const key = `healthcheck/${userId}/${crypto.randomUUID()}.bin`
  return { url: await signPut(key), error: null }
}

Deno.serve(async (req: Request) => {
  const secretPresent = Boolean(Deno.env.get('DUMMY_SECRET'))
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    return json(
      {
        ok: false,
        userId: null,
        authError: 'missing Authorization header',
        secretPresent,
        uploadUrl: null,
        uploadError: null,
      },
      401,
    )
  }

  // Forwarding the caller's Authorization header is what makes auth.getUser()
  // resolve to the caller rather than to the anon role.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data, error } = await supabase.auth.getUser()
  const userId = data.user?.id ?? null

  if (error || !userId) {
    return json(
      {
        ok: false,
        userId: null,
        authError: error?.message ?? 'no user for token',
        secretPresent,
        uploadUrl: null,
        uploadError: null,
      },
      401,
    )
  }

  const upload = await presignUpload(userId)

  return json({
    ok: true,
    userId,
    authError: null,
    secretPresent,
    uploadUrl: upload.url,
    uploadError: upload.error,
  })
})
