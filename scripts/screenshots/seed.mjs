import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dishesFor, LOCALES } from './fixtures.mjs'
import { sha256, writeJson } from './safety.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const manifest = await readFile(new URL('./photos.json', import.meta.url))
const photos = JSON.parse(manifest)
const fixtureHash = sha256(await readFile(new URL('./fixtures.mjs', import.meta.url)))
const manifestHash = sha256(manifest)
for (const photo of photos) {
  const bytes = await readFile(new URL(`./photos/${photo.filename}`, import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== photo.sha256)
    throw new Error(`Photo checksum mismatch: ${photo.filename}`)
}
const secrets = new URL('../../.secrets/', import.meta.url)
await mkdir(secrets, { recursive: true })
// Discover this local stack instead of reading a possibly hosted mobile env.
const stack = JSON.parse(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '--workdir', `${root}apps`, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
)
const url = new URL(stack.API_URL)
if (
  url.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.port !== '54421'
)
  throw new Error('Screenshot fixtures require the local RiceCal stack on port 54421.')
const request = async (
  path,
  { key = stack.SERVICE_ROLE_KEY, token = key, method = 'GET', body, prefer } = {},
) => {
  const response = await fetch(`${url.origin}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status}: ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
const rest = (table, body, conflict) =>
  request(`/rest/v1/${table}${conflict ? `?on_conflict=${conflict}` : ''}`, {
    method: 'POST',
    body,
    prefer: conflict ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  })
const stateFile = new URL('screenshots.json', secrets)
const save = () => writeJson(stateFile, state, 0o600)
const state = await readFile(stateFile, 'utf8')
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === 'ENOENT') return { accounts: {} }
    throw error
  })
const requested = process.argv.slice(2)
const locales = requested.length ? requested : Object.keys(LOCALES)
for (const locale of locales) if (!LOCALES[locale]) throw new Error(`Unknown locale: ${locale}`)
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const day = (offset) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
state.date = date
for (const locale of locales) {
  const foods = dishesFor(locale)
  let account = state.accounts[locale]
  if (!account) {
    const email = `screenshots-${randomBytes(6).toString('hex')}@example.invalid`
    const password = randomBytes(24).toString('base64url')
    const user = await request('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        app_metadata: { screenshot_fixture: true, locale },
      },
    })
    account = { id: user.id, email, password, photos: {} }
    state.accounts[locale] = account
    await save()
  }
  const user = await request(`/auth/v1/admin/users/${account.id}`)
  if (!user.app_metadata?.screenshot_fixture || user.app_metadata.locale !== locale)
    throw new Error('Refusing to replace data outside a screenshot fixture account.')
  // Invalidate readiness before any writes, including a same-day retry.
  account.ready = false
  delete account.heroId
  await save()
  await rest(
    'subscriptions',
    [
      {
        user_id: account.id,
        status: 'active',
        plan: 'yearly',
        current_period_end: `${day(365)}T23:59:00Z`,
        store: 'screenshot_fixture',
      },
    ],
    'user_id',
  )
  await request(`/rest/v1/profiles?id=eq.${account.id}`, {
    method: 'PATCH',
    body: {
      display_name: 'RiceCal',
      sex: 'female',
      birth_date: '1994-06-15',
      height_cm: 165,
      target_weight_kg: 58,
      activity_level: 'light',
      timezone: 'Asia/Kuala_Lumpur',
      onboarded_at: `${day(-90)}T00:00:00Z`,
    },
  })
  await request(`/rest/v1/user_settings?user_id=eq.${account.id}`, {
    method: 'PATCH',
    body: {
      language: locale,
      units: 'metric',
      energy: 'kcal',
      notify_water: false,
      notify_weigh_in: false,
      notify_weekly_report: false,
      notify_monthly_report: false,
      step_goal: 8000,
    },
  })
  const session = await request('/auth/v1/token?grant_type=password', {
    key: stack.ANON_KEY,
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  const cachedKeys = foods.map((food) => account.photos[food.photo]).filter(Boolean)
  const cachedReads = cachedKeys.length
    ? await request('/functions/v1/photos', {
        key: stack.ANON_KEY,
        token: session.access_token,
        method: 'POST',
        body: { action: 'read', keys: cachedKeys },
      })
    : { urls: {} }
  const localObjectUrl = (value) => {
    const target = new URL(value)
    if (
      target.protocol !== 'http:' ||
      !/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        target.hostname,
      )
    )
      throw new Error('The local photos function must point to local object storage.')
    return target
  }
  for (const food of foods) {
    const bytes = await readFile(new URL(`./photos/${food.photo}`, import.meta.url))
    const digest = createHash('sha256').update(bytes).digest('hex')
    account.photoHashes ??= {}
    const cachedUrl = cachedReads.urls?.[account.photos[food.photo]]
    if (cachedUrl && account.photoHashes[food.photo] === digest) {
      localObjectUrl(cachedUrl)
      const stored = await fetch(cachedUrl)
      if (stored.ok && sha256(Buffer.from(await stored.arrayBuffer())) === digest) continue
      if (!stored.ok && stored.status !== 404)
        throw new Error(`Stored fixture image could not be read: ${stored.status}`)
    }
    const signed = await request('/functions/v1/photos', {
      key: stack.ANON_KEY,
      token: session.access_token,
      method: 'POST',
      body: { action: 'upload', contentType: 'image/jpeg', size: bytes.length },
    })
    localObjectUrl(signed.url)
    const upload = await fetch(signed.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: bytes,
    })
    if (!upload.ok) throw new Error(`Photo upload: ${upload.status}`)
    account.photos[food.photo] = signed.key
    account.photoHashes[food.photo] = digest
    await save()
  }
  // Only this marked fixture account is replaced. Other local users are untouched.
  for (const table of [
    'food_logs',
    'recipes',
    'daily_logs',
    'daily_goals',
    'weight_logs',
    'activity_sessions',
    'activity_hours',
    'activity_days',
    'health_connections',
  ]) {
    await request(
      `/rest/v1/${table}?${table === 'recipes' ? 'owner_id' : 'user_id'}=eq.${account.id}`,
      { method: 'DELETE' },
    )
  }
  const logs = [],
    water = [],
    weights = [],
    activity = [],
    workouts = []
  for (let offset = -89; offset <= 0; offset++) {
    const logDate = day(offset),
      n = offset + 89
    water.push({
      user_id: account.id,
      log_date: logDate,
      water_ml: offset === 0 ? 1500 : 1600 + (n % 5) * 150,
    })
    if (n % 3 === 0 || offset === 0)
      weights.push({
        user_id: account.id,
        measured_on: logDate,
        weight_kg: Math.round((63.8 - n * 0.025 + Math.sin(n) * 0.12) * 100) / 100,
        body_fat_pct: 25.5 - n * 0.015,
      })
    activity.push({
      user_id: account.id,
      log_date: logDate,
      provider: 'apple_health',
      active_kcal: offset === 0 ? 320 : 250 + (n % 7) * 35,
      resting_kcal: 1450,
      steps: offset === 0 ? 8426 : 6000 + (n % 9) * 410,
      distance_m: 5400,
      exercise_minutes: 32,
      stand_hours: 9,
      flights: 6,
      move_goal_kcal: 450,
      exercise_goal_min: 30,
      stand_goal_hr: 12,
      synced_at: new Date().toISOString(),
    })
    if (n % 2 === 0 || offset === 0)
      workouts.push({
        user_id: account.id,
        provider: 'apple_health',
        external_id: `screenshot-${locale}-${logDate}`,
        log_date: logDate,
        kind: 'walk',
        started_at: `${logDate}T00:00:00Z`,
        ended_at: `${logDate}T00:32:00Z`,
        duration_s: 1920,
        active_kcal: 140,
        distance_m: 2800,
        avg_hr: 114,
        max_hr: 132,
        source_name: 'Apple Watch',
      })
    const count = offset === 0 ? 3 : 4
    for (let meal = 0; meal < count; meal++) {
      const food = foods[offset === 0 ? meal : (n + meal) % foods.length]
      const quantity = offset === 0 ? 1 : 0.85 + (n % 4) * 0.1
      const id = randomUUID()
      logs.push({
        id,
        user_id: account.id,
        log_date: logDate,
        logged_at: `${logDate}T${['00:15', '04:30', '07:45', '11:00'][meal]}:00Z`,
        item_name: food.name,
        item_place: 'home',
        item_icon_set: 'dishes',
        item_icon_name: food.icon,
        base_kcal: food.kcal,
        base_carbs_g: food.carbs,
        base_protein_g: food.protein,
        base_fat_g: food.fat,
        serving_label: food.portion,
        serving_factor: 1,
        serving_grams: food.grams,
        quantity,
        source: 'camera',
        photo_path: account.photos[food.photo],
      })
      if (offset === 0 && meal === 0) account.heroId = id
    }
  }
  await rest('weight_logs', weights)
  // Weigh-ins regenerate automatic goals. Replace those before the final custom goal.
  await request(`/rest/v1/daily_goals?user_id=eq.${account.id}`, { method: 'DELETE' })
  await rest(
    'daily_goals',
    [
      {
        user_id: account.id,
        effective_from: day(-90),
        kcal: 2000,
        carbs_g: 250,
        protein_g: 110,
        fat_g: 65,
        water_ml: 2000,
        is_custom: true,
      },
    ],
    'user_id,effective_from',
  )
  await rest('daily_logs', water)
  await rest('food_logs', logs)
  await rest('activity_days', activity)
  await rest('activity_sessions', workouts)
  // The capture env disables native sync so the empty simulator cannot erase fixtures.
  await rest('health_connections', [
    {
      user_id: account.id,
      provider: 'apple_health',
      connected: true,
      device_name: 'Apple Watch',
      backfilled_from: day(-89),
      last_synced_at: new Date().toISOString(),
    },
  ])
  const recipes = foods.map((food, index) => ({
    id: randomUUID(),
    owner_id: account.id,
    name: food.name,
    photo_path: account.photos[food.photo],
    icon_set: 'dishes',
    icon_name: food.icon,
    servings: 2,
    share_slug: `screenshot-${randomBytes(12).toString('hex')}`,
    created_at: `${day(-index)}T00:00:00Z`,
  }))
  await rest('recipes', recipes)
  await rest(
    'recipe_ingredients',
    recipes.map((recipe, index) => ({
      recipe_id: recipe.id,
      name: foods[index].name,
      amount: 2,
      unit: 'piece',
      kcal_per_unit: foods[index].kcal,
      carbs_g_per_unit: foods[index].carbs,
      protein_g_per_unit: foods[index].protein,
      fat_g_per_unit: foods[index].fat,
    })),
  )
  // Read as the account: this verifies the same row policies the app uses.
  const check = await request(
    `/rest/v1/food_log_details?log_date=eq.${date}&select=id,item_name,kcal`,
    { key: stack.ANON_KEY, token: session.access_token },
  )
  if (check.length !== 3 || !check.some((row) => row.id === account.heroId))
    throw new Error(`Diary verification failed for ${locale}`)
  for (const [table, expected] of [
    ['food_logs', logs.length],
    ['daily_logs', water.length],
    ['weight_logs', weights.length],
    ['activity_days', activity.length],
    ['activity_sessions', workouts.length],
    ['recipes', recipes.length],
    ['daily_goals', 1],
    ['health_connections', 1],
  ]) {
    const owner = table === 'recipes' ? 'owner_id' : 'user_id'
    const rows = await request(`/rest/v1/${table}?${owner}=eq.${account.id}&select=${owner}`, {
      key: stack.ANON_KEY,
      token: session.access_token,
    })
    if (rows.length !== expected) throw new Error(`Fixture verification failed: ${locale}/${table}`)
  }
  account.date = date
  account.fixtureSha256 = fixtureHash
  account.photoManifestSha256 = manifestHash
  account.ready = true
  await save()
  console.log(
    `${locale}: ${LOCALES[locale].market}, ${logs.length} meals, ${recipes.length} recipes, ${activity.length} activity days`,
  )
}
console.log(`Ready for ${date}. Local credentials are saved in .secrets/screenshots.json.`)
