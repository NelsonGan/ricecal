import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { json } from './http.ts'

/**
 * Who is calling, checked by the function itself rather than the platform, so a
 * failure says which half broke instead of arriving as an opaque 401: no header
 * at all, or a token GoTrue would not stand behind.
 *
 * The client carries the caller's own token, so every query made with it runs
 * under their RLS.
 */
export async function signedIn(
  req: Request,
): Promise<{ userId: string; client: SupabaseClient } | Response> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data, error } = await client.auth.getUser()
  const userId = data.user?.id
  if (error || !userId) return json({ ok: false, error: 'not signed in' }, 401)
  return { userId, client }
}
