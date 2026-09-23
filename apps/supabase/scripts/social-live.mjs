// Local HTTP verification of the real auth, RPC, edge-review and photo seams.
// --keep leaves fictional fixtures for simulator testing in .secrets/social-ui.json.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const raw = execFileSync(
  'pnpm',
  ['exec', 'supabase', 'status', '--workdir', 'apps', '-o', 'json'],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
const config = JSON.parse(raw.slice(raw.indexOf('{')))
const api = 'http://127.0.0.1:54421'
assert.equal(
  new URL(config.API_URL).hostname,
  '127.0.0.1',
  'This script only runs against local Supabase',
)
const anon = config.ANON_KEY
const service = config.SERVICE_ROLE_KEY
const created = []
const uploaded = new Map()
let checks = 0
function check(value, message) {
  assert.ok(value, message)
  checks++
  console.log(`ok ${checks}: ${message}`)
}
async function request(path, token, body, method = 'POST') {
  const response = await fetch(api + path, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: response.status, data }
}
async function ok(path, token, body, method) {
  const result = await request(path, token, body, method)
  assert.ok(result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`)
  return result.data
}
const rpc = (name, token, args = {}) => ok(`/rest/v1/rpc/${name}`, token, args)
const review = (kind, id, token, mock) =>
  ok('/functions/v1/social', token, { action: 'review', kind, id, mock })
async function person(name, handle) {
  const id = randomUUID()
  const email = `social-${id}@example.test`
  const password = `Local-${randomUUID()}`
  await ok('/auth/v1/admin/users', service, {
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  created.push(id)
  const auth = await ok('/auth/v1/token?grant_type=password', anon, { email, password })
  const token = auth.access_token
  await ok(
    `/rest/v1/profiles?id=eq.${id}`,
    service,
    {
      display_name: name,
      sex: 'female',
      birth_date: '1994-01-01',
      height_cm: 165,
      target_weight_kg: 62,
      activity_level: 'light',
      onboarded_at: new Date().toISOString(),
    },
    'PATCH',
  )
  await ok('/rest/v1/weight_logs', service, {
    user_id: id,
    measured_on: new Date().toISOString().slice(0, 10),
    weight_kg: 62,
  })
  const suffix = id.slice(0, 6)
  await rpc('set_social_profile', token, {
    p_handle: `${handle}_${suffix}`,
    p_display_name: name,
    p_bio: 'Cooking and sharing everyday meals.',
    p_avatar_path: null,
  })
  assert.equal((await review('profile', id, token)).status, 'approved')
  return { id, email, password, token, handle: `${handle}_${suffix}`, name }
}
async function meal(user, name = 'Nasi lemak', photo = null) {
  const [entry] = await ok('/rest/v1/food_logs', user.token, {
    user_id: user.id,
    item_name: name,
    item_icon_set: 'dishes',
    item_icon_name:
      { 'Roti canai': 'roti-canai', 'Chicken rice': 'chicken-rice' }[name] ?? 'nasi-lemak',
    base_kcal: 640,
    base_carbs_g: 80,
    base_protein_g: 18,
    base_fat_g: 28,
    serving_label: '1 plate',
    serving_factor: 1,
    quantity: 1,
    note: 'Private diary note, never publish',
    photo_path: photo,
  })
  return entry.id
}
async function post(user, entry, caption, audience = 'public') {
  return rpc('create_social_post', user.token, {
    p_entry_id: entry,
    p_caption: caption,
    p_audience: audience,
  })
}
async function run() {
  // A db reset removes local storage buckets while the R2 seam still names one.
  const env = readFileSync(`${root}/apps/supabase/functions/.env`, 'utf8')
  const bucket = env.match(/^R2_BUCKET=["']?([^"'\r\n]+)["']?$/m)?.[1]
  assert.ok(bucket, 'Set the local R2_BUCKET before running media tests')
  const existingBucket = env.includes('/storage/v1/s3')
    ? await request(`/storage/v1/bucket/${encodeURIComponent(bucket)}`, service, undefined, 'GET')
    : { status: 200 }
  if (existingBucket.status >= 300)
    await ok('/storage/v1/bucket', service, { id: bucket, name: bucket, public: false })

  const mina = await person('Mina Tan', 'mina_cooks')
  const arun = await person('Arun Kumar', 'aruns_table')
  const lily = await person('Lily Lim', 'lily_eats')
  const entry = await meal(mina)
  const postId = await post(mina, entry, 'Weekend breakfast with extra sambal.')
  check(
    (await rpc('social_post', arun.token, { p_id: postId })).length === 0,
    'pending post hidden from another account',
  )
  check(
    (await review('post', postId, mina.token, { fail: true })).status === 'pending',
    'review outage leaves content pending',
  )
  check(
    (await rpc('social_post', arun.token, { p_id: postId })).length === 0,
    'failed review does not publish',
  )
  check(
    (await review('post', postId, mina.token)).status === 'approved',
    'owner review publishes a saved meal',
  )
  const [dto] = await rpc('social_post', arun.token, { p_id: postId })
  check(
    dto.food_name === 'Nasi lemak' &&
      !('note' in dto) &&
      !('source_entry_id' in dto) &&
      !('base_kcal' in dto),
    'public DTO excludes diary provenance, notes and nutrition',
  )
  const foreign = await request('/functions/v1/social', arun.token, {
    action: 'review',
    kind: 'post',
    id: postId,
  })
  check(foreign.status === 404, 'review cannot inspect another account submission')
  check(
    (await request('/functions/v1/social', anon, { action: 'review', kind: 'post', id: postId }))
      .status === 401,
    'anonymous review refused',
  )
  check(
    (
      await request('/functions/v1/social', mina.token, {
        action: 'review',
        kind: 'food_logs',
        id: postId,
      })
    ).status === 400,
    'unknown content type refused',
  )
  const duplicate = await post(mina, entry, 'A duplicate retry')
  check(duplicate === postId, 'one post per logged entry')
  await rpc('set_social_follow', arun.token, { p_target_id: mina.id, p_following: true })
  check(
    (await rpc('social_feed', arun.token, { p_mode: 'following' })).some((p) => p.id === postId),
    'following feed contains followed author',
  )
  check(
    !(await rpc('social_feed', arun.token, { p_mode: 'discover' })).some((p) => p.id === postId),
    'discovery excludes followed authors',
  )
  await rpc('set_social_like', arun.token, { p_post_id: postId, p_liked: true })
  await rpc('set_social_like', arun.token, { p_post_id: postId, p_liked: true })
  check(
    (await rpc('social_post', arun.token, { p_id: postId }))[0].like_count === 1,
    'repeated like request increments once',
  )
  const comment = await rpc('create_social_comment', arun.token, {
    p_post_id: postId,
    p_body: 'That sambal looks delicious!',
    p_request_id: randomUUID(),
  })
  check(
    (await rpc('social_comments', mina.token, { p_post_id: postId })).length === 0,
    'comment waits for review',
  )
  check(
    (await review('comment', comment, arun.token)).status === 'approved',
    'comment review works for a free account',
  )
  check(
    (await rpc('social_comments', mina.token, { p_post_id: postId })).length === 1,
    'reviewed comment visible to post owner',
  )
  check(
    (await rpc('social_notifications', mina.token)).length === 3,
    'follow, like and comment each notify one recipient',
  )
  await rpc('update_social_post', mina.token, {
    p_id: postId,
    p_caption: 'For my followers',
    p_audience: 'followers',
  })
  await review('post', postId, mina.token)
  check(
    (await rpc('social_post', lily.token, { p_id: postId })).length === 0,
    'followers-only post hidden from nonfollower',
  )
  check(
    (await rpc('social_post', arun.token, { p_id: postId })).length === 1,
    'followers-only post visible to follower',
  )
  await rpc('remove_social_follower', mina.token, { p_follower_id: arun.id })
  check(
    (await rpc('social_post', arun.token, { p_id: postId })).length === 0,
    'removing follower revokes post access',
  )
  await rpc('update_social_post', mina.token, {
    p_id: postId,
    p_caption: 'Visit https://spam.example',
    p_audience: 'public',
  })
  check(
    (await review('post', postId, mina.token)).status === 'rejected',
    'link spam fails deterministic moderation',
  )
  await rpc('update_social_post', mina.token, {
    p_id: postId,
    p_caption: 'Weekend breakfast with extra sambal.',
    p_audience: 'public',
  })
  await review('post', postId, mina.token)
  const upload = await ok('/functions/v1/photos', mina.token, {
    action: 'upload',
    kind: 'meal',
    contentType: 'image/png',
    size: 68,
  })
  uploaded.set(upload.key, mina.token)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  )
  const put = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  })
  check(put.ok, `local S3 accepts signed upload: ${put.status} ${put.ok ? '' : await put.text()}`)
  const photoEntry = await meal(mina, 'Photo test meal', upload.key)
  const photoPost = await post(mina, photoEntry, 'A photo from my diary')
  check(
    (await review('post', photoPost, mina.token)).status === 'approved',
    'photo review records exact object bytes',
  )
  const signed = await ok('/functions/v1/photos', arun.token, {
    action: 'read',
    scope: 'social',
    keys: [upload.key],
  })
  check(
    signed.expiresIn === 60 && signed.headers[upload.key]['If-Match'],
    'social signer returns a short-lived reviewed image grant',
  )
  const image = await fetch(signed.urls[upload.key], { headers: signed.headers[upload.key] })
  check(image.ok, 'reviewed image is readable through its required signed header')
  await image.arrayBuffer()
  const withoutHeader = await fetch(signed.urls[upload.key])
  check(!withoutHeader.ok, 'removing the version header invalidates the signature')
  await withoutHeader.arrayBuffer()
  const replace = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: Buffer.concat([png, Buffer.from('changed')]),
  })
  check(replace.ok, 'test reuses the still-live upload URL')
  const overwritten = await fetch(signed.urls[upload.key], { headers: signed.headers[upload.key] })
  check(
    overwritten.status === 412,
    `overwritten image cannot inherit approval (status ${overwritten.status}; expected ${signed.headers[upload.key]['If-Match']}; received ${overwritten.headers.get('etag')})`,
  )
  await overwritten.arrayBuffer()
  const neighbour = await ok('/functions/v1/photos', mina.token, {
    action: 'upload',
    kind: 'meal',
    contentType: 'image/png',
    size: 68,
  })
  uploaded.set(neighbour.key, mina.token)
  const neighbourPut = await fetch(neighbour.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  })
  await neighbourPut.arrayBuffer()
  const neighbourPost = await post(
    mina,
    await meal(mina, 'Neighbour photo meal', neighbour.key),
    'Another photo from my diary',
  )
  await review('post', neighbourPost, mina.token)
  await ok(`/rest/v1/food_logs?id=eq.${photoEntry}`, mina.token, { photo_path: null }, 'PATCH')
  const denied = await request('/functions/v1/photos', arun.token, {
    action: 'read',
    scope: 'social',
    keys: [upload.key],
  })
  check(denied.status === 403, 'photo replacement or retention immediately revokes social signing')
  const mixed = await ok('/functions/v1/photos', arun.token, {
    action: 'read',
    scope: 'social',
    keys: [upload.key, neighbour.key],
  })
  check(
    !mixed.urls[upload.key] && Boolean(mixed.urls[neighbour.key]),
    'a revoked image leaves the rest of its screen signed',
  )
  await ok('/functions/v1/photos', mina.token, {
    action: 'delete',
    keys: [upload.key, neighbour.key],
  })
  uploaded.delete(upload.key)
  uploaded.delete(neighbour.key)
  await ok(`/rest/v1/food_logs?id=eq.${photoEntry}`, mina.token, undefined, 'DELETE')
  check(
    (await rpc('social_post', mina.token, { p_id: photoPost })).length === 0,
    'diary deletion removes the feed post',
  )
  await rpc('set_social_follow', arun.token, { p_target_id: mina.id, p_following: true })
  await ok('/rest/v1/blocked_authors', mina.token, { user_id: mina.id, author_id: arun.id })
  check(
    (await rpc('social_post', arun.token, { p_id: postId })).length === 0 &&
      (await rpc('social_profile', arun.token, { p_user_id: mina.id })).length === 0,
    'legacy block write symmetrically hides social content and identity',
  )
  await ok(
    `/rest/v1/blocked_authors?user_id=eq.${mina.id}&author_id=eq.${arun.id}`,
    mina.token,
    undefined,
    'DELETE',
  )
  check(
    !(await rpc('social_profile', arun.token, { p_user_id: mina.id }))[0].is_following,
    'unblock does not restore a removed follow',
  )
  if (process.argv.includes('--keep')) {
    const arunEntry = await meal(arun, 'Roti canai')
    const arunPost = await post(arun, arunEntry, 'A crisp roti and a quiet morning.')
    await review('post', arunPost, arun.token)
    const lilyEntry = await meal(lily, 'Chicken rice')
    const lilyPost = await post(lily, lilyEntry, 'Lunch at our favourite neighbourhood stall.')
    await review('post', lilyPost, lily.token)
    await rpc('set_social_follow', mina.token, { p_target_id: arun.id, p_following: true })
    await rpc('set_social_follow', lily.token, { p_target_id: mina.id, p_following: true })
    await rpc('set_social_like', lily.token, { p_post_id: postId, p_liked: true })
    const ui = {
      users: [mina, arun, lily].map(({ token, ...user }) => user),
      entry,
      postId,
      arunEntry,
      arunPost,
      lilyEntry,
      lilyPost,
    }
    writeFileSync(`${root}/.secrets/social-ui.json`, JSON.stringify(ui, null, 2), { mode: 0o600 })
  }
  console.log(`Passed ${checks} local social HTTP checks.`)
}
let passed = false
try {
  await run()
  passed = true
} finally {
  const cleanupFailures = []
  for (const [key, token] of uploaded) {
    const cleanup = await request('/functions/v1/photos', token, { action: 'delete', keys: [key] })
    if (cleanup.status >= 300) cleanupFailures.push(`photo: ${cleanup.status}`)
  }
  if (!passed || !process.argv.includes('--keep')) {
    for (const id of created) {
      const cleanup = await request(`/auth/v1/admin/users/${id}`, service, undefined, 'DELETE')
      if (cleanup.status >= 300) cleanupFailures.push(`account: ${cleanup.status}`)
    }
  }
  assert.equal(cleanupFailures.length, 0, `Local fixture cleanup failures: ${cleanupFailures}`)
}
