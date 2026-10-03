import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { WORKOUT_KINDS } from '../../mobile/src/lib/health/kinds.ts'

const { values } = parseArgs({ options: { user: { type: 'string' }, date: { type: 'string' } } })
if (
  !values.user ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.user)
) {
  throw new Error('Pass --user with the UUID of an existing local account.')
}
if (values.date && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
  throw new Error('--date must be yyyy-MM-dd.')
}

// The container is deliberately fixed. Fixtures must never follow a hosted env.
function sql(query) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_ricecal',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: query, encoding: 'utf8' },
  ).trim()
}

const date =
  values.date ??
  sql(`select (now() at time zone timezone)::date from profiles where id = '${values.user}';`)
if (!date) throw new Error('That local account has no profile.')
const base = new Date(`${date}T12:00:00Z`)
if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== date) {
  throw new Error('The date does not exist.')
}

// Duration, active energy, distance, average pulse, peak pulse, elevation.
const examples = {
  run: [1968, 384, 5200, 148, 174, 42],
  walk: [2730, 186, 3400, 102, 126, 0],
  hike: [7820, 812, 8700, 128, 162, 486],
  cycle: [4320, 642, 28400, 143, 176, 214],
  swim: [2130, 312, 1500, null, null, null],
  badminton: [3840, 438, 420, 144, 181, null],
  tennis: [4515, 528, 630, 139, 173, null],
  football: [5410, 704, 4100, 151, 186, null],
  basketball: [3200, 486, 380, 151, 181, null],
  volleyball: [2850, 268, 310, 126, 158, null],
  gym: [2420, 302, null, 133, 164, null],
  strength: [3375, 286, null, 116, 154, null],
  hiit: [1420, 276, null, 158, 188, null],
  yoga: [2710, 124, null, 86, 112, null],
  dance: [3010, 362, null, 137, 173, null],
  martialArts: [3635, 514, null, 146, 184, null],
  rowing: [1275, 254, 5000, 149, 178, null],
  stairs: [1110, 212, null, 152, 179, 92],
  other: [1800, 160, null, null, null, null],
}

function zones(duration, average) {
  if (average == null) return null
  const shares =
    average < 110
      ? [0.75, 0.2, 0.05, 0]
      : average < 140
        ? [0.25, 0.45, 0.25, 0.05]
        : [0.1, 0.25, 0.5, 0.15]
  const seconds = shares.slice(0, 3).map((share) => Math.round(duration * share))
  seconds.push(duration - seconds.reduce((sum, value) => sum + value, 0))
  return Object.fromEntries(
    ['easy', 'steady', 'hard', 'peak'].map((zone, index) => [zone, seconds[index]]),
  )
}

const fixtures = WORKOUT_KINDS.map((kind) => {
  const [duration_s, active_kcal, distance_m, avg_hr, max_hr, elevation_m] = examples[kind]
  return {
    name: kind,
    kind,
    kind_label: null,
    duration_s,
    active_kcal,
    distance_m,
    avg_hr,
    max_hr,
    elevation_m,
    hr_zones: zones(duration_s, avg_hr),
  }
})
const running = fixtures.find((fixture) => fixture.kind === 'run')
const variant = (name, patch) => ({ ...running, name, ...patch })
fixtures.push(
  variant('run-no-distance', { distance_m: null, elevation_m: null }),
  variant('run-no-heart', { avg_hr: null, max_hr: null, hr_zones: null }),
  variant('run-summary-heart', { hr_zones: null }),
  variant('run-peak-only', { avg_hr: null, hr_zones: null }),
  variant('run-zones-only', { avg_hr: null, max_hr: null }),
  variant('run-zero-zones', { hr_zones: { easy: 0, steady: 0, hard: 0, peak: 0 } }),
  variant('cycle-indoor', { kind: 'cycle', distance_m: null, elevation_m: null }),
  variant('swim-heart', { kind: 'swim', distance_m: 1500, elevation_m: null }),
  variant('row-no-heart', {
    kind: 'rowing',
    distance_m: 5000,
    avg_hr: null,
    max_hr: null,
    hr_zones: null,
    elevation_m: null,
  }),
  variant('short-zero', {
    duration_s: 0,
    active_kcal: 0,
    distance_m: 0,
    elevation_m: 0,
    avg_hr: null,
    max_hr: null,
    hr_zones: null,
  }),
  variant('unknown-long-label', {
    kind: 'new-provider-sport',
    kind_label: 'Mixed outdoor conditioning and mobility',
    distance_m: 1000,
    elevation_m: -12,
    avg_hr: null,
    max_hr: null,
    hr_zones: null,
  }),
)

const records = fixtures.map(({ name, ...fixture }, index) => {
  const hex = createHash('sha256').update(`${values.user}:workout-preview:${name}`).digest('hex')
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  const day = new Date(base)
  day.setUTCDate(day.getUTCDate() - Math.floor(index / 5))
  const log_date = day.toISOString().slice(0, 10)
  // Wall-clock times, converted to the profile's timezone in the insert below.
  const started = new Date(`${log_date}T${String(6 + (index % 5) * 2).padStart(2, '0')}:15:00Z`)
  return {
    id,
    user_id: values.user,
    provider: 'demo',
    external_id: `workout-preview:${name}`,
    log_date,
    started_at: started.toISOString(),
    ended_at: new Date(started.getTime() + fixture.duration_s * 1000).toISOString(),
    source_name: 'Workout preview',
    ...fixture,
  }
})

const payload = JSON.stringify(records).replaceAll("'", "''")
sql(`begin;
insert into activity_sessions (id, user_id, provider, external_id, log_date, kind, kind_label,
  started_at, ended_at, duration_s, active_kcal, distance_m, avg_hr, max_hr, elevation_m,
  hr_zones, source_name)
select r.id, r.user_id, r.provider, r.external_id, r.log_date, r.kind, r.kind_label,
  r.started_at at time zone 'UTC' at time zone p.timezone,
  r.ended_at at time zone 'UTC' at time zone p.timezone,
  r.duration_s, r.active_kcal, r.distance_m, r.avg_hr, r.max_hr, r.elevation_m,
  r.hr_zones, r.source_name
from jsonb_populate_recordset(null::activity_sessions, '${payload}'::jsonb) r
join profiles p on p.id = r.user_id
on conflict (user_id, provider, external_id) do update set
  log_date = excluded.log_date, started_at = excluded.started_at, ended_at = excluded.ended_at,
  kind = excluded.kind, kind_label = excluded.kind_label, duration_s = excluded.duration_s,
  active_kcal = excluded.active_kcal, distance_m = excluded.distance_m, avg_hr = excluded.avg_hr,
  max_hr = excluded.max_hr, elevation_m = excluded.elevation_m, hr_zones = excluded.hr_zones,
  source_name = excluded.source_name;
commit;`)

const count = Number(
  sql(
    `select count(*) from activity_sessions where user_id = '${values.user}' and provider = 'demo' and external_id like 'workout-preview:%';`,
  ),
)
if (count !== records.length)
  throw new Error(`Expected ${records.length} local previews, found ${count}.`)
console.log(
  `Seeded ${WORKOUT_KINDS.length} workout categories and ${fixtures.length - WORKOUT_KINDS.length} data variants in the local database.`,
)
for (const record of records)
  console.log(`${record.external_id.slice(16)}\t${record.id}\t${record.log_date}`)
