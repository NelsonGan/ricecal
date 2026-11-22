// `{action: 'import'}`: a link to a cooking video becomes a recipe on the
// caller's shelf. README: "Importing a recipe from a video".
//
//   link      parsed and, for a share link, followed to the post it names
//   cache     `recipe_imports` by platform and post id; a hit skips the rest
//   fetch     the post's caption, cover and (where it can be had) video file
//   model     is it a recipe, and if so the recipe (`video-recipe.ts`)
//   store     the verdict cached for everybody, the cover kept once in R2
//   make      `import_recipe_for` claims the month's allowance and writes the
//             recipe in one transaction; the first importer's goes to the
//             community, pending its review, which runs here
//
// Every refusal answers with a `code`, so the app can say what happened in the
// user's language. A failure to read the post or the video is not cached, so
// it can be retried; a verdict is, so a dance clip costs one look.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Meter } from '../_shared/entitlement.ts'
import { json } from '../_shared/http.ts'
import { mockActive, photoBase64 } from '../_shared/llm.ts'
import { copyObject, deleteObject, newKey, r2Configured, writeObject } from '../_shared/r2.ts'
import { type RecipeMockSteer, reviewRecipe } from '../_shared/recipe.ts'
import {
  isShortLink,
  parseVideoLink,
  resolveShortLink,
  type VideoLink,
} from '../_shared/video-link.ts'
import {
  type FetchedPost,
  fetchMedia,
  fetchPost,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  mp4Seconds,
} from '../_shared/video-post.ts'
import {
  cachedDraft,
  importVideoRecipe,
  type PostMedia,
  type VideoMockSteer,
  videoRoutes,
} from '../_shared/video-recipe.ts'

export type ImportRequest = {
  action: 'import'
  url?: string
  /** Mock mode only: a post to use instead of fetching one, and the model's answer. */
  mock?: VideoMockSteer & RecipeMockSteer & { post?: Partial<FetchedPost> }
}

type ImportRow = {
  id: string
  community_recipe_id: string | null
  status: 'recipe' | 'not_recipe'
  reason: string | null
  photo_key: string | null
  platform: string
  author_handle: string | null
}

const IMPORT_COLUMNS = 'id, status, reason, photo_key, platform, author_handle, community_recipe_id'

/** A cover is a picture for a card; past this it is not a cover. */
const MAX_COVER_BYTES = 5 * 1024 * 1024

type ImportContext = {
  db: SupabaseClient
  userId: string
  meter: Meter
  /** Whether a review may run, for loading the recipe it reviews. */
  loadForReview: (
    db: SupabaseClient,
    recipeId: string,
  ) => Promise<{
    recipe: { name: string | null; servings: number | null; steps: string | null }
    ingredients: Array<{ name: string | null; amount: number | null; unit: string | null }>
  } | null>
}

/**
 * When an import started must be finished by. The function's wall clock is
 * 150 s; this leaves room for the writes after the model and the review that
 * runs once the answer is sent.
 */
const IMPORT_BUDGET_MS = 135_000
/** The most a share link may take to follow, across all its hops. */
const SHORT_LINK_MS = 15_000

export async function handleImport(body: ImportRequest, ctx: ImportContext): Promise<Response> {
  const deadline = Date.now() + IMPORT_BUDGET_MS
  const { db, userId, meter } = ctx
  const mock = mockActive() ? body.mock : undefined
  const pasted = typeof body.url === 'string' ? body.url.slice(0, 2000) : ''

  // -- The link.
  const parsed = parseVideoLink(pasted)
  if (!parsed) return json({ ok: false, code: 'unsupported_link' }, 400)
  let link: VideoLink | null
  try {
    link = isShortLink(parsed)
      ? await within(resolveShortLink(parsed), SHORT_LINK_MS, null)
      : parsed
  } catch (error) {
    console.warn('[recipes/import] short link failed:', errorText(error))
    link = null
  }
  if (!link) return json({ ok: false, code: 'unreadable', platform: parsed.platform })

  // -- The cache.
  let row = await findImport(db, link)

  if (!row) {
    // The month's allowance is claimed when the recipe is made, below, so it
    // is only spent on a recipe that arrives. Checked here too, so an account
    // with none left is not made to wait for a model it cannot use.
    const left = await allowance(db, userId)
    if (left && left.remaining <= 0) {
      return json(
        {
          ok: false,
          code: 'import_limit',
          platform: link.platform,
          used: left.used,
          limit: left.monthly_limit,
        },
        429,
      )
    }

    // A ceiling on model runs that do not end in a recipe: see
    // `recipe_import_runs`. Refused, nothing was spent and nothing is cached.
    const { data: allowed, error: runError } = await db.rpc('claim_recipe_import_run', {
      p_user: userId,
    })
    if (runError) console.error('[recipes/import] run claim failed, allowing:', runError.message)
    else if (allowed === false)
      return json({ ok: false, code: 'busy', platform: link.platform }, 429)

    const fetched = await readPost(link, mock?.post)
    if (!fetched) return json({ ok: false, code: 'unreadable', platform: link.platform })

    // Short-form only (`MAX_VIDEO_SECONDS`). Where the page says how long the
    // video is, a long one is turned away before anything is downloaded.
    // Not cached: the refusal costs a page read, and the ceiling may move.
    const tooLong = () =>
      json({ ok: false, code: 'too_long', platform: link.platform, maxSeconds: MAX_VIDEO_SECONDS })
    if ((fetched.durationSeconds ?? 0) > MAX_VIDEO_SECONDS) return tooLong()

    // The video for the video model, the cover for the caption route and for
    // the card. Fetched together: neither waits on the other.
    const [video, cover] = await Promise.all([
      videoFor(fetched),
      fetched.coverUrl ? fetchMedia(fetched.coverUrl, MAX_COVER_BYTES, 'image/') : null,
    ])
    if (video === 'too_long') return tooLong()
    const coverMedia: PostMedia = cover
      ? { kind: 'image', base64: photoBase64(cover.bytes), type: cover.type }
      : { kind: 'none' }

    let result: Awaited<ReturnType<typeof importVideoRecipe>>
    try {
      result = await importVideoRecipe(fetched, video, coverMedia, mock, meter, deadline)
    } catch (error) {
      console.error('[recipes/import] model failed:', errorText(error))
      return json({ ok: false, code: 'failed', platform: link.platform })
    }

    // A "not a recipe" reached without watching a video that was there to
    // watch is the caption's verdict, not the video's: it is answered, and not
    // cached, so the next import gets another look at the video itself.
    //
    // "There to watch" is the post having a video at all, not the download
    // working: a TikTok file that answered 403 is exactly the case where the
    // caption alone (hashtags, the recipe spoken aloud) would wrongly turn the
    // video away for everybody.
    const watchable =
      Boolean(fetched.videoUrl) &&
      videoRoutes(fetched.link.platform === 'youtube' ? 'link' : 'file').length > 0
    if (!result.recipe.isRecipe && watchable && result.analysedFrom !== 'video') {
      return json({
        ok: false,
        code: 'not_recipe',
        platform: link.platform,
        reason: result.recipe.reason,
      })
    }

    const id = crypto.randomUUID()
    let photoKey: string | null = null
    if (result.recipe.isRecipe && cover && r2Configured()) {
      try {
        photoKey = `imports/${id}.jpg`
        await writeObject(photoKey, cover.bytes, cover.type)
      } catch (error) {
        console.warn('[recipes/import] cover not stored:', errorText(error))
        photoKey = null
      }
    }

    const finalLink = fetched.link
    const { error: insertError } = await db.from('recipe_imports').upsert(
      {
        id,
        platform: finalLink.platform,
        video_id: finalLink.id,
        canonical_url: finalLink.canonicalUrl,
        status: result.recipe.isRecipe ? 'recipe' : 'not_recipe',
        draft: result.recipe.isRecipe ? cachedDraft(result.recipe) : null,
        reason: result.recipe.isRecipe ? null : clip(result.recipe.reason, 500),
        author_handle: clip(fetched.author, 80),
        title: clip(fetched.title, 300),
        caption: clip(fetched.caption, 5000),
        analysed_from: result.analysedFrom,
        photo_key: photoKey,
        created_by: userId,
      },
      // Somebody else imported the same video while this one was reading it.
      // Theirs stands, and this answer is dropped rather than overwriting it:
      // two readers of one video must end up with one recipe.
      { onConflict: 'platform,video_id', ignoreDuplicates: true },
    )
    if (insertError) {
      console.error('[recipes/import] cache write failed:', insertError.message)
      if (photoKey) await deleteObject(photoKey).catch(() => {})
      return json({ ok: false, code: 'failed', platform: link.platform })
    }
    row = await findImport(db, finalLink)
    if (row && row.id !== id && photoKey) await deleteObject(photoKey).catch(() => {})
    if (!row) return json({ ok: false, code: 'failed', platform: link.platform })
  }

  if (row.status === 'not_recipe') {
    return json({ ok: false, code: 'not_recipe', platform: row.platform, reason: row.reason })
  }

  // -- The recipe.
  //
  // Already imported by this account? Hand that one back before copying a
  // cover that would only be thrown away.
  const { data: mine } = await db
    .from('recipes')
    .select('id')
    .eq('owner_id', userId)
    .eq('import_id', row.id)
    .limit(1)
    .maybeSingle()
  if (mine) {
    return done({
      recipeId: mine.id,
      existing: true,
      community: mine.id === row.community_recipe_id,
      row,
    })
  }

  let photoPath: string | null = null
  if (row.photo_key && r2Configured()) {
    try {
      photoPath = newKey('meal', userId)
      await copyObject(row.photo_key, photoPath)
    } catch (error) {
      console.warn('[recipes/import] cover not copied:', errorText(error))
      photoPath = null
    }
  }

  const { data: made, error: makeError } = await db
    .rpc('import_recipe_for', { p_user: userId, p_import: row.id, p_photo_path: photoPath })
    .maybeSingle<{
      recipe_id: string | null
      existing: boolean
      allowed: boolean
      used: number
      monthly_limit: number
      community_recipe_id: string | null
      community_review: 'pending' | 'approved' | 'rejected' | null
      is_community: boolean
    }>()

  if (makeError || !made) {
    console.error('[recipes/import] import_recipe_for failed:', makeError?.message)
    if (photoPath) await deleteObject(photoPath).catch(() => {})
    return json({ ok: false, code: 'failed', platform: row.platform })
  }
  if (!made.allowed || !made.recipe_id) {
    if (photoPath) await deleteObject(photoPath).catch(() => {})
    return json(
      {
        ok: false,
        code: 'import_limit',
        platform: row.platform,
        used: made.used,
        limit: made.monthly_limit,
      },
      429,
    )
  }
  if (made.existing && photoPath) await deleteObject(photoPath).catch(() => {})

  // The community recipe has not been read yet: this import made it, or the
  // review that should have run when somebody else's did never finished. In
  // the background where the runtime allows it: the user is waiting for their
  // own recipe, which the verdict does not change.
  if (made.community_recipe_id && made.community_review === 'pending') {
    afterResponse(review(ctx, made.community_recipe_id, mock))
  }

  return done({
    recipeId: made.recipe_id,
    existing: made.existing,
    community: made.is_community,
    row,
  })
}

function done(result: { recipeId: string; existing: boolean; community: boolean; row: ImportRow }) {
  return json({
    ok: true,
    recipe_id: result.recipeId,
    existing: result.existing,
    community: result.community,
    platform: result.row.platform,
    author: result.row.author_handle,
  })
}

async function findImport(db: SupabaseClient, link: VideoLink): Promise<ImportRow | null> {
  const { data, error } = await db
    .from('recipe_imports')
    .select(IMPORT_COLUMNS)
    .eq('platform', link.platform)
    .eq('video_id', link.id)
    .maybeSingle<ImportRow>()
  if (error) console.error('[recipes/import] cache read failed:', error.message)
  return data ?? null
}

type Allowance = { used: number; monthly_limit: number; remaining: number }

/** This month's imports, or null when the question could not be answered. */
async function allowance(db: SupabaseClient, userId: string): Promise<Allowance | null> {
  const { data, error } = await db
    .rpc('recipe_import_allowance', { p_user: userId })
    .maybeSingle<Allowance>()
  if (error) console.error('[recipes/import] allowance read failed:', error.message)
  return data ?? null
}

/** The post, or the mock's stand-in for one. */
async function readPost(
  link: VideoLink,
  mockPost: Partial<FetchedPost> | undefined,
): Promise<FetchedPost | null> {
  if (mockPost) {
    return {
      link,
      platform: link.platform,
      author: mockPost.author ?? null,
      title: mockPost.title ?? null,
      caption: mockPost.caption ?? null,
      transcript: mockPost.transcript ?? null,
      linkedRecipe: mockPost.linkedRecipe ?? null,
      coverUrl: mockPost.coverUrl ?? null,
      videoUrl: mockPost.videoUrl ?? null,
      durationSeconds: mockPost.durationSeconds ?? null,
    }
  }
  try {
    return await fetchPost(link)
  } catch (error) {
    console.warn(`[recipes/import] ${link.platform} post not read:`, errorText(error))
    return null
  }
}

/**
 * The video as the video model takes it: YouTube by its link, which the model
 * fetches itself, and anything else downloaded and inlined, since a platform's
 * own video URL is signed for whoever asked for it and nobody else can open it.
 * `too_long` for a file whose own header says it runs past the ceiling, the
 * one length a page that says nothing (Facebook, Instagram) still gives away.
 */
async function videoFor(post: FetchedPost): Promise<PostMedia | 'too_long'> {
  if (!post.videoUrl) return { kind: 'none' }
  if (post.link.platform === 'youtube') {
    // The model fetches the link itself and nothing caps what it watches, so
    // a video of unknown length gets the caption route rather than a blank
    // cheque. The watch page that gives the description gives the length.
    return post.durationSeconds === null
      ? { kind: 'none' }
      : { kind: 'video', url: post.link.canonicalUrl }
  }
  const file = await fetchMedia(post.videoUrl, MAX_VIDEO_BYTES, 'video/', post.videoHeaders)
  if (!file) return { kind: 'none' }
  if ((mp4Seconds(file.bytes) ?? 0) > MAX_VIDEO_SECONDS) return 'too_long'
  return { kind: 'video', url: `data:${file.type};base64,${photoBase64(file.bytes)}` }
}

/**
 * The publishing review, for a recipe this import put on the community shelf.
 * The same gate a hand-written recipe goes through, and it fails the same way:
 * anything but a clear verdict leaves the recipe pending, and invisible.
 */
async function review(ctx: ImportContext, recipeId: string, mock: RecipeMockSteer | undefined) {
  const { db, meter } = ctx
  // Not behind `claim_recipe_review`'s hourly ceiling. That ceiling stops a
  // loop of `{action: 'review'}` calls; this review runs at most once per video
  // that becomes a community recipe, which the import allowance and the hourly
  // run ceiling already bound, and refusing it would strand the card pending.
  try {
    const loaded = await ctx.loadForReview(db, recipeId)
    if (!loaded) return
    const verdict = await reviewRecipe(
      {
        name: loaded.recipe.name ?? '',
        servings: loaded.recipe.servings ?? 1,
        steps: loaded.recipe.steps ?? '',
        ingredients: loaded.ingredients.map((i) => ({
          name: i.name ?? '',
          amount: Number(i.amount ?? 0),
          unit: i.unit ?? 'g',
        })),
      },
      mock,
      meter,
    )
    const { error } = await db
      .from('recipes')
      .update({
        review_status: verdict.approved ? 'approved' : 'rejected',
        review_note: verdict.approved ? null : verdict.reason || null,
      })
      .eq('id', recipeId)
      .eq('review_status', 'pending')
    if (error) console.error('[recipes/import] verdict not saved:', error.message)
  } catch (error) {
    console.error('[recipes/import] review failed, left pending:', errorText(error))
  }
}

/**
 * At most `max` characters, cut between code points. `slice` counts UTF-16
 * units, and a cut through an emoji leaves half a surrogate pair, which
 * Postgres refuses in JSON: the cache write would fail for that video every
 * time, since the caption it reads is the same every time.
 */
export function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const points = Array.from(value)
  return points.length <= max ? value : points.slice(0, max).join('')
}

/**
 * Work the response does not wait for. The edge runtime keeps the isolate alive
 * for a promise handed to `EdgeRuntime.waitUntil`; anywhere else (a test, a
 * plain Deno) it simply runs, unawaited, and logs its own failures.
 */
function afterResponse(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else work.catch(() => {})
}

/** `promise`, or `fallback` once `ms` have passed without it. */
export function within<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return Promise.race([
    promise,
    new Promise<F>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)
}
