import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  type ContentKind,
  loadReviewPhoto,
  parseReviewRequest,
  readBoundedBytes,
  reviewSubmission,
} from './review.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

type Submission = {
  revision: number
  review_status: 'pending' | 'approved' | 'rejected'
  review_reason: string | null
  quarantined: boolean
  text: string
  photo: string | null
}

/** Ownership is in the query even though caller-scoped RLS also applies. */
async function loadSubmission(
  db: SupabaseClient,
  kind: ContentKind,
  id: string,
  owner: string,
): Promise<Submission | null> {
  const state = 'revision,review_status,review_reason,quarantined'
  if (kind === 'profile') {
    const { data, error } = await db
      .from('social_profiles')
      .select(`handle,display_name,bio,avatar_path,${state}`)
      .eq('user_id', id)
      .eq('user_id', owner)
      .maybeSingle()
    if (error) throw error
    return data
      ? {
          ...data,
          text: `${data.handle}\n${data.display_name}\n${data.bio}`,
          photo: data.avatar_path,
        }
      : null
  }
  if (kind === 'post') {
    const { data, error } = await db
      .from('social_posts')
      .select(`food_name,caption,photo_path,${state}`)
      .eq('id', id)
      .eq('author_id', owner)
      .maybeSingle()
    if (error) throw error
    return data
      ? { ...data, text: `${data.food_name}\n${data.caption}`, photo: data.photo_path }
      : null
  }
  const { data, error } = await db
    .from('social_comments')
    .select(`body,${state}`)
    .eq('id', id)
    .eq('author_id', owner)
    .maybeSingle()
  if (error) throw error
  return data ? { ...data, text: data.body, photo: null } : null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'use POST' }, 405)
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ ok: false, error: 'not signed in' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
  })
  const { data: auth, error: authError } = await caller.auth.getUser()
  const owner = auth.user?.id
  if (authError || !owner) return json({ ok: false, error: 'not signed in' }, 401)

  let body: ReturnType<typeof parseReviewRequest>
  try {
    const bytes = await readBoundedBytes(req.body, 4096)
    body = parseReviewRequest(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return json({ ok: false, error: 'invalid review request' }, 400)
  }
  if (!body) return json({ ok: false, error: 'invalid review request' }, 400)

  try {
    const submission = await loadSubmission(caller, body.kind, body.id, owner)
    if (!submission) return json({ ok: false, error: 'content unavailable' }, 404)
    if (submission.quarantined) return json({ ok: true, status: 'quarantined' })
    if (submission.review_status !== 'pending') {
      return json({ ok: true, status: submission.review_status, reason: submission.review_reason })
    }
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const budget = await service.rpc('claim_social_review', { p_user: owner })
    if (budget.error) throw budget.error
    if (!budget.data)
      return json({ ok: false, status: 'pending', error: 'review limit reached' }, 429)

    const photo = submission.photo
      ? await loadReviewPhoto(submission.photo, owner, body.kind === 'profile' ? 'avatar' : 'meal')
      : null
    const approved = await reviewSubmission(
      body.kind,
      submission.text,
      photo?.image ?? null,
      body.mock,
    )
    const status = approved ? 'approved' : 'rejected'
    const reason = approved ? null : 'content_not_allowed'
    const saved = await service.rpc('review_social_content', {
      p_kind: body.kind,
      p_id: body.id,
      p_revision: submission.revision,
      p_status: status,
      p_reason: reason,
      p_photo_etag: approved ? (photo?.etag ?? null) : null,
    })
    if (saved.error) throw saved.error
    // Another edit, report or delete wins over this in-flight verdict.
    if (!saved.data) return json({ ok: true, status: 'pending', stale: true })
    return json({ ok: true, status, reason })
  } catch (error) {
    console.error(
      '[social] review unavailable',
      error instanceof Error ? error.name : 'database error',
    )
    return json({ ok: true, status: 'pending' }, 202)
  }
})
