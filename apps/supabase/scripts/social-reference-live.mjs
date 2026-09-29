// Local HTTP check of a post reading its source meal. --keep leaves fictional
// accounts in the gitignored file for simulator verification.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const raw = execFileSync(
  'pnpm',
  ['exec', 'supabase', 'status', '--workdir', 'apps', '-o', 'json'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
const config = JSON.parse(raw.slice(raw.indexOf('{')))
assert.equal(new URL(config.API_URL).hostname, '127.0.0.1', 'Local Supabase is required')
const api = 'http://127.0.0.1:54421'
const anon = config.ANON_KEY
const service = config.SERVICE_ROLE_KEY
const created = []
let passed = false

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
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${text}`)
  return data
}

const rpc = (name, token, args = {}) => request(`/rest/v1/rpc/${name}`, token, args)

async function person(name) {
  const id = randomUUID()
  const email = `social-reference-${id}@example.test`
  const password = `Local-${randomUUID()}`
  await request('/auth/v1/admin/users', service, {
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  created.push(id)
  const auth = await request('/auth/v1/token?grant_type=password', anon, { email, password })
  await request(
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
  await request('/rest/v1/weight_logs', service, {
    user_id: id,
    measured_on: new Date().toISOString().slice(0, 10),
    weight_kg: 62,
  })
  return { id, email, password, token: auth.access_token, name }
}

async function meal(user, name) {
  const [entry] = await request('/rest/v1/food_logs', user.token, {
    user_id: user.id,
    item_name: name,
    item_icon_set: 'dishes',
    item_icon_name: 'nasi-lemak',
    base_kcal: 640,
    base_carbs_g: 80,
    base_protein_g: 18,
    base_fat_g: 28,
    serving_label: '1 plate',
    serving_factor: 1,
  })
  return entry.id
}

try {
  const owner = await person('Mina Fixture')
  const reader = await person('Arun Fixture')
  const entry = await meal(owner, 'Nasi lemak')
  const postId = await rpc('create_social_post', owner.token, {
    p_entry_id: entry,
    p_caption: 'A local test lunch.',
    p_audience: 'public',
  })
  const [original] = await rpc('social_post', reader.token, { p_id: postId })
  assert.equal(original.food_name, 'Nasi lemak')
  assert.equal(original.kcal, 640)

  await request(
    `/rest/v1/food_logs?id=eq.${entry}`,
    owner.token,
    { display_label: 'Updated nasi lemak', override_kcal: 900 },
    'PATCH',
  )
  const [corrected] = await rpc('social_post', reader.token, { p_id: postId })
  assert.equal(corrected.food_name, 'Updated nasi lemak')
  assert.equal(corrected.kcal, 900)
  assert.equal(corrected.caption, original.caption)
  assert.equal('source_entry_id' in corrected, false)
  const [profilePost] = await rpc('social_profile_posts', reader.token, { p_user_id: owner.id })
  assert.equal(profilePost.food_name, corrected.food_name)
  assert.equal(profilePost.kcal, corrected.kcal)

  await request(
    `/rest/v1/food_logs?id=eq.${entry}`,
    owner.token,
    { override_kcal: null, quantity: 2 },
    'PATCH',
  )
  assert.equal((await rpc('social_post', reader.token, { p_id: postId }))[0].kcal, 1280)
  await rpc('set_social_follow', reader.token, { p_target_id: owner.id, p_following: true })
  assert.equal(
    (await rpc('social_feed', reader.token, { p_mode: 'following' })).find(
      (post) => post.id === postId,
    )?.kcal,
    1280,
  )

  const removedEntry = await meal(owner, 'Second lunch')
  const removedPost = await rpc('create_social_post', owner.token, {
    p_entry_id: removedEntry,
    p_caption: '',
    p_audience: 'public',
  })
  await request(`/rest/v1/food_logs?id=eq.${removedEntry}`, owner.token, undefined, 'DELETE')
  assert.equal((await rpc('social_post', reader.token, { p_id: removedPost })).length, 0)

  // Leave the main post at its starting value so the simulator can show the edit.
  await request(
    `/rest/v1/food_logs?id=eq.${entry}`,
    owner.token,
    { display_label: null, quantity: 1 },
    'PATCH',
  )
  assert.equal((await rpc('social_post', reader.token, { p_id: postId }))[0].kcal, 640)
  if (process.argv.includes('--keep')) {
    const users = [owner, reader].map(({ token, ...user }) => user)
    writeFileSync(
      `${root}/.secrets/social-reference-ui.json`,
      JSON.stringify({ users, entry, postId }, null, 2),
      { mode: 0o600 },
    )
  }
  passed = true
  console.log('Local HTTP checks passed: correction, portion, feed read and deletion.')
} finally {
  if (!passed || !process.argv.includes('--keep')) {
    for (const id of created) {
      await request(`/auth/v1/admin/users/${id}`, service, undefined, 'DELETE')
    }
  }
}
