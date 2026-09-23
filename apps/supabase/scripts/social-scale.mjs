/**
 * Local, rollback-only social query benchmark.
 * node apps/supabase/scripts/social-scale.mjs --repeat=9 --save=/tmp/social-scale.json
 * Add --plans=/tmp/social-plans.log for nested EXPLAIN plans (auto_explain).
 * No URL or connection override is accepted: synthetic data cannot reach hosted DB.
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const repeat = Number(flag('repeat') ?? 9)
if (!Number.isInteger(repeat) || repeat < 2 || repeat > 100) {
  throw new Error('--repeat must be an integer between 2 and 100')
}
if (args.some((arg) => !/^--(repeat|save|plans)=/.test(arg))) {
  throw new Error('Only --repeat, --save and --plans are supported; the database is always local')
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const statements = [await readFile(new URL('./social-scale.fixture.sql', import.meta.url), 'utf8')]
if (flag('plans')) {
  statements.push(`load 'auto_explain';
set local auto_explain.log_min_duration = '1ms';
set local auto_explain.log_analyze = true;
set local auto_explain.log_buffers = true;
set local auto_explain.log_nested_statements = true;
set local auto_explain.log_format = 'json';
set local auto_explain.log_level = 'notice';`)
}

const cases = []
for (const [group, cohort] of ['dense', 'sparse', 'few_posting'].entries()) {
  for (const [index, follows] of [10, 100, 1000, 5000].entries()) {
    cases.push({
      name: `following/${cohort}/${follows}`,
      viewer: 15001 + group * 4 + index,
      query: "select * from public.social_feed(p_mode => 'following', p_limit => 20)",
    })
  }
}
cases.push(
  {
    name: 'following/dense/5000/deep',
    viewer: 15004,
    query: `select * from public.social_feed(p_mode => 'following', p_limit => 20,
      p_before_at => '2026-01-14 17:00:00+00', p_before_id => 'ffffffff-ffff-ffff-ffff-ffffffffffff')`,
  },
  {
    name: 'discover/new_account',
    viewer: 15030,
    query: "select * from public.social_feed(p_mode => 'discover', p_limit => 20)",
  },
  {
    name: 'discover/heavily_filtered',
    viewer: 15004,
    query: "select * from public.social_feed(p_mode => 'discover', p_limit => 20)",
  },
  {
    name: 'profile/celebrity/15000_followers',
    viewer: 15030,
    query: "select * from public.social_profile(pg_temp.social_bench_id('user', 15020))",
  },
  {
    name: 'post/14999_likes',
    viewer: 15030,
    query: "select * from public.social_post(pg_temp.social_bench_id('post', 1))",
  },
  {
    name: 'connections/celebrity/15000_followers',
    viewer: 15030,
    query: `select * from public.social_connections(p_user_id => pg_temp.social_bench_id('user', 15020),
      p_direction => 'followers', p_limit => 20)`,
  },
  {
    name: 'activity/15000_interactions',
    viewer: 15020,
    query: 'select * from public.social_notifications(p_limit => 20)',
  },
  {
    name: 'activity/15000_interactions/deep',
    viewer: 15020,
    query: `select * from public.social_notifications(p_limit => 20,
      p_before_at => '2026-01-15 09:00:00+00', p_before_id => 'ffffffff-ffff-ffff-ffff-ffffffffffff')`,
  },
  {
    name: 'activity/15000_interactions/unread_count',
    viewer: 15020,
    query: 'select public.social_unread_notification_count()',
  },
  {
    name: 'suggestions/new_account',
    viewer: 15030,
    query: 'select * from public.social_suggestions(p_limit => 12)',
  },
  {
    name: 'suggestions/64_by_64_paths',
    viewer: 15040,
    query: 'select * from public.social_suggestions(p_limit => 12)',
  },
  {
    name: 'search/15050_profiles',
    viewer: 15030,
    query: "select * from public.social_search_profiles(p_query => 'zz_bench_', p_limit => 20)",
  },
  {
    name: 'search/15050_profiles/deep',
    viewer: 15030,
    query: `select * from public.social_search_profiles(p_query => 'zz_bench_',
      p_after_handle => 'zz_bench_10000', p_limit => 20)`,
  },
)

for (const test of cases) {
  statements.push(`reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.social_bench_id('user', ${test.viewer}), 'role', 'authenticated')::text, true);
set local role authenticated;`)
  for (let pass = 0; pass < repeat; pass++) {
    statements.push(
      `select pg_temp.social_bench_measure(${quote(test.name)}, ${quote(test.query)}, ${pass});`,
    )
  }
}
statements.push('reset role; rollback;')

console.log(
  `Seeding 110,000 posts and 15,050 local identities; ${cases.length} cases x ${repeat} passes.`,
)
const child = spawn('docker', [
  'exec',
  '-i',
  'supabase_db_ricecal',
  'psql',
  '-X',
  '-qAt',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'supabase_admin',
  '-d',
  'postgres',
])
const output = []
const errors = []
let pendingOutput = ''
child.stdout.on('data', (chunk) => {
  output.push(chunk)
  pendingOutput += chunk.toString()
  const lines = pendingOutput.split('\n')
  pendingOutput = lines.pop()
  for (const line of lines) {
    if (!line.startsWith('SOCIAL_BENCH_RESULT ')) continue
    const result = JSON.parse(line.slice('SOCIAL_BENCH_RESULT '.length))
    if (result.pass === 0) {
      console.log(`${result.name}: first query ${result.explain[0]['Execution Time']} ms`)
    }
  }
})
child.stderr.on('data', (chunk) => errors.push(chunk))
child.stdin.on('error', () => {})
child.stdin.end(statements.join('\n'))
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', resolve)
})
const stderr = Buffer.concat(errors).toString()
if (flag('plans')) await writeFile(flag('plans'), stderr)
if (exitCode !== 0) {
  console.error(stderr.slice(-12000))
  throw new Error(
    `Local benchmark failed with exit code ${exitCode}; its transaction was rolled back`,
  )
}

const lines = Buffer.concat(output).toString().split('\n')
const metadata = JSON.parse(
  lines.find((line) => line.startsWith('SOCIAL_BENCH_META ')).slice('SOCIAL_BENCH_META '.length),
)
const results = lines
  .filter((line) => line.startsWith('SOCIAL_BENCH_RESULT '))
  .map((line) => JSON.parse(line.slice('SOCIAL_BENCH_RESULT '.length)))
if (results.length !== cases.length * repeat)
  throw new Error('The benchmark returned incomplete samples')
for (const result of results) {
  const expectedRows = result.name.startsWith('suggestions/')
    ? 12
    : result.name.startsWith('profile/') ||
        result.name.startsWith('post/') ||
        result.name.endsWith('/unread_count')
      ? 1
      : result.name === 'following/sparse/10'
        ? 10
        : 21
  if (result.explain[0].Plan['Actual Rows'] !== expectedRows) {
    throw new Error(
      `${result.name} returned an incomplete page; fast missing rows are not a valid benchmark`,
    )
  }
}
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const summary = cases.map(({ name }) => {
  const samples = results.filter((result) => result.name === name)
  const times = samples.slice(1).map((result) => result.explain[0]['Execution Time'])
  const plans = samples.map((result) => result.explain[0].Plan)
  return {
    name,
    firstMs: samples[0].explain[0]['Execution Time'],
    warmP50Ms: percentile(times, 0.5),
    warmP95Ms: percentile(times, 0.95),
    maxSharedHitBlocks: Math.max(...plans.map((plan) => plan['Shared Hit Blocks'] ?? 0)),
    maxSharedReadBlocks: Math.max(...plans.map((plan) => plan['Shared Read Blocks'] ?? 0)),
    rows: samples[0].explain[0].Plan['Actual Rows'],
  }
})
const report = {
  measuredAt: new Date().toISOString(),
  repeat,
  metadata,
  summary,
  results,
  notes:
    'First pass is a first query after fixture load, not a cold OS cache. Later passes share warmed buffers. Rollback removes rows; PostgreSQL can retain relation pages for reuse. Opaque RPC plans report aggregate buffers; --plans records nested plans. These are local single-session reads, not production CPU or concurrent throughput measurements.',
}
console.table(summary)
if (summary.some((row) => row.warmP95Ms > 300)) {
  console.warn(
    'A social query exceeded the 300 ms operating target. Inspect plans before claiming capacity.',
  )
}
if (flag('save')) await writeFile(flag('save'), `${JSON.stringify(report, null, 2)}\n`)
console.log('Fixture transaction rolled back.')
