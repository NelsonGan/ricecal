/** Real AI corrections against local Supabase. Seeds and removes its own account. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'

const repeat = Number(process.argv.find((arg) => arg.startsWith('--repeat='))?.split('=')[1] ?? 3)
assert(Number.isInteger(repeat) && repeat > 0, '--repeat must be a positive integer')
const status = execFileSync('supabase', ['status', '--workdir', 'apps', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
const config = JSON.parse(status.slice(status.indexOf('{')))
const origin = new URL(config.API_URL)
assert(
  ['127.0.0.1', 'localhost'].includes(origin.hostname),
  'This eval only writes to local Supabase',
)

async function request(path, body, method = 'POST', token = config.SERVICE_ROLE_KEY) {
  const res = await fetch(`${origin.origin}${path}`, {
    method,
    headers: {
      apikey: config.ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

const cases = [
  { text: 'This is not pork chop, but chicken', quantity: 1 },
  { text: 'This is chicken, not pork chop', quantity: 1 },
  { text: 'Replace the pork chop with chicken', quantity: 1, grams: null },
  { text: 'Replace the pork chop with chicken', quantity: 2 },
  { text: 'Not pork, chicken. Same amount.', quantity: 0.7312, override: true },
  { text: 'Ini bukan pork chop, ini ayam', quantity: 1 },
  { text: '这不是猪排，是鸡肉', quantity: 1 },
  { text: 'I left half the rice', quantity: 1, action: 'rice' },
  { text: 'no mixed vegetables', quantity: 1, action: 'remove' },
  { text: 'half portion', quantity: 1, action: 'half' },
]
const password = randomBytes(24).toString('hex')
const user = await request('/auth/v1/admin/users', {
  email: `refine-${randomUUID()}@example.test`,
  password,
  email_confirm: true,
})
let passed = 0
try {
  await request('/rest/v1/subscriptions', {
    user_id: user.id,
    status: 'active',
    current_period_end: '2099-01-01T00:00:00Z',
  })
  const session = await request('/auth/v1/token?grant_type=password', {
    email: user.email,
    password,
  })
  for (let run = 0; run < repeat; run++) {
    for (const c of cases) {
      const [entry] = await request('/rest/v1/food_logs', {
        user_id: user.id,
        item_name: 'Pork chop with rice and vegetables',
        display_label: 'Pork chop with rice and vegetables',
        base_kcal: Math.round(350 * c.quantity + 350),
        base_carbs_g: 75,
        base_protein_g: 48,
        base_fat_g: 22.5,
        serving_label: '1 plate',
        serving_factor: 1,
        quantity: 1,
        ...(c.override
          ? { override_kcal: 999, override_protein_g: 10, override_carbs_g: 10, override_fat_g: 10 }
          : {}),
      })
      const before = await request(
        '/rest/v1/food_log_ingredients',
        [
          {
            item_name: 'Grilled pork chop',
            base_kcal: 350,
            base_carbs_g: 0,
            base_protein_g: 40,
            base_fat_g: 21,
            grams: c.grams === null ? null : 170,
            quantity: c.quantity,
          },
          {
            item_name: 'Steamed rice',
            base_kcal: 260,
            base_carbs_g: 57,
            base_protein_g: 5,
            base_fat_g: 0.5,
            grams: 200,
            quantity: 1,
          },
          {
            item_name: 'Mixed vegetables',
            base_kcal: 90,
            base_carbs_g: 18,
            base_protein_g: 3,
            base_fat_g: 1,
            grams: 150,
            quantity: 1,
          },
        ].map((p, position) => ({
          ...p,
          food_log_id: entry.id,
          serving_label: position === 0 && c.grams === null ? '1 cutlet' : '1 serving',
          serving_factor: 1,
          position,
        })),
      )
      const result = await request(
        '/functions/v1/scan-refine',
        {
          food_log_id: entry.id,
          instruction: c.text,
        },
        'POST',
        session.access_token,
      )
      assert(result.ok && result.applied, JSON.stringify(result))
      const after = await request(
        `/rest/v1/food_log_ingredients?food_log_id=eq.${entry.id}&order=position`,
        undefined,
        'GET',
      )
      if (!c.action) {
        assert.equal(after.length, 3)
        const swapped = after[0]
        assert.match(swapped.item_name, /chicken|ayam|鸡/i)
        assert.doesNotMatch(swapped.item_name, /pork|猪/i)
        assert.doesNotMatch(result.entry.name, /pork|猪/i)
        for (const key of ['id', 'position', 'quantity', 'grams'])
          assert.equal(swapped[key], before[0][key], key)
        assert.equal(swapped.food_id, null)
        assert.equal(swapped.serving_id, null)
        assert(swapped.base_protein_g > swapped.base_carbs_g, 'chicken should be mostly protein')
        assert.deepEqual(after.slice(1), before.slice(1), 'unmentioned ingredients changed')
      } else if (c.action === 'rice') {
        assert.equal(after.length, 3)
        assert.deepEqual(after[0], before[0])
        assert.deepEqual(after[2], before[2])
        assert(Math.abs(after[1].quantity - 0.5) < 0.1, `rice quantity: ${after[1].quantity}`)
      } else if (c.action === 'remove') {
        assert.deepEqual(after, before.slice(0, 2))
      } else {
        assert.equal(after.length, 3)
        for (let i = 0; i < after.length; i++)
          assert.equal(after[i].quantity, before[i].quantity / 2)
      }
      const [total] = await request(`/rest/v1/food_log_details?id=eq.${entry.id}`, undefined, 'GET')
      const parts = await request(
        `/rest/v1/food_log_ingredient_details?food_log_id=eq.${entry.id}`,
        undefined,
        'GET',
      )
      for (const key of ['kcal', 'carbs_g', 'protein_g', 'fat_g']) {
        const sum = parts.reduce((n, p) => n + Number(p[key]), 0)
        assert(
          Math.abs(Number(total[key]) - sum) <= (key === 'kcal' ? 2 : 0.3),
          `${key} differs from parts`,
        )
      }
      passed++
      console.log(`PASS ${run + 1}/${repeat}: ${c.text}`)
      await request(`/rest/v1/food_logs?id=eq.${entry.id}`, undefined, 'DELETE')
    }
  }
} finally {
  await request(`/auth/v1/admin/users/${user.id}`, undefined, 'DELETE')
}
console.log(
  `${passed}/${cases.length * repeat} local correction cases passed; test account removed.`,
)
