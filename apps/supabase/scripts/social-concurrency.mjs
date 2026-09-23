/**
 * Independent local database sessions exercise locks the single-transaction
 * pgTAP suite cannot. Fixtures are committed for session visibility, then their
 * exact auth IDs are deleted in finally. No hosted connection is configurable.
 */
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

const runId = randomUUID()
const id = (kind, number) => {
  const hex = createHash('md5')
    .update(`social-concurrency/${runId}/${kind}/${number}`)
    .digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const alice = id('user', 1)
const bob = id('user', 2)
const carol = id('user', 3)
const capped = id('user', 4)
const post = id('post', 1)
const entry = id('entry', 1)
const secondEntry = id('entry', 2)
const allIds = Array.from({ length: 5007 }, (_, index) => id('user', index + 1))

async function sql(query, { user, allowDenied = false } = {}) {
  const child = spawn('docker', [
    'exec',
    '-i',
    'supabase_db_ricecal',
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=sqlstate',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ])
  const output = []
  const errors = []
  child.stdout.on('data', (chunk) => output.push(chunk))
  child.stderr.on('data', (chunk) => errors.push(chunk))
  child.stdin.on('error', () => {})
  const prefix = user
    ? `begin; set local lock_timeout = '8s'; set local statement_timeout = '20s';
       select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: user, role: 'authenticated' }))}, true);
       set local role authenticated;`
    : ''
  child.stdin.end(`${prefix}\n${query}\n${user ? 'commit;' : ''}`)
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  const stderr = Buffer.concat(errors).toString()
  const stdout = Buffer.concat(output).toString()
  if (exitCode && !(allowDenied && /ERROR:\s+(42501|P0001)\b/.test(stderr))) {
    throw new Error(`Local SQL failed (${exitCode}): ${stderr}`)
  }
  return { ok: exitCode === 0, stdout, stderr }
}

let assertions = 0
async function assertSql(expression, message) {
  const result = await sql(`select (${expression})::text;`)
  if (result.stdout.trim() !== 'true')
    throw new Error(`Assertion failed: ${message}\n${result.stdout}`)
  assertions++
  console.log(`ok ${assertions} - ${message}`)
}
const as = (user, query, allowDenied = false) => sql(query, { user, allowDenied })

try {
  console.log(`Preparing isolated committed local fixtures (${runId}).`)
  await sql(`begin;
    set local session_replication_role = replica;
    insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
    select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           u::text || '@concurrency.example.test', '{}', '{}'
    from unnest(array[${allIds.map(quote).join(',')}]::uuid[]) u;
    insert into public.social_profiles(user_id, handle, display_name, review_status)
    select u, 'cc_' || substr(replace(u::text, '-', ''), 1, 20), 'Concurrent fixture', 'approved'
    from unnest(array[${allIds.map(quote).join(',')}]::uuid[]) u;
    set local session_replication_role = origin;
    insert into public.food_logs
      (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
    values (${quote(entry)}, ${quote(alice)}, 'Race rice', 200, 44, 4, 1, '1 bowl', 1),
           (${quote(secondEntry)}, ${quote(alice)}, 'Retry rice', 200, 44, 4, 1, '1 bowl', 1);
    insert into public.social_posts(id, author_id, source_entry_id, food_name, review_status)
    values (${quote(post)}, ${quote(alice)}, ${quote(entry)}, 'Race rice', 'approved');
    commit;`)

  await Promise.all(
    Array.from({ length: 8 }, () =>
      as(bob, `select public.set_social_follow(${quote(alice)}, true);`),
    ),
  )
  await assertSql(
    `(select count(*) from public.social_follows where follower_id = ${quote(bob)} and followed_id = ${quote(alice)}) = 1`,
    'eight concurrent follow retries create one edge',
  )
  await assertSql(
    `(select sum(value) from public.social_counters where entity_id = ${quote(alice)} and metric = 'followers') = 1`,
    'concurrent follow retries increment follower counters once',
  )
  await assertSql(
    `(select count(*) from public.social_notifications where recipient_id = ${quote(alice)} and actor_id = ${quote(bob)} and kind = 'follow') = 1`,
    'concurrent follow retries create one activity row',
  )

  await Promise.all(
    Array.from({ length: 8 }, () =>
      as(bob, `select public.set_social_like(${quote(post)}, true);`),
    ),
  )
  await assertSql(
    `(select count(*) from public.social_likes where post_id = ${quote(post)} and user_id = ${quote(bob)}) = 1`,
    'eight concurrent like retries create one edge',
  )
  await assertSql(
    `(select sum(value) from public.social_counters where entity_id = ${quote(post)} and metric = 'likes') = 1`,
    'concurrent likes increment the post counter once',
  )
  await assertSql(
    `(select count(*) from public.social_notifications where post_id = ${quote(post)} and actor_id = ${quote(bob)} and kind = 'like') = 1`,
    'concurrent likes create one activity row',
  )

  const commentRequest = id('comment-request', 1)
  await Promise.all(
    Array.from({ length: 8 }, () =>
      as(
        bob,
        `select public.create_social_comment(${quote(post)}, 'Concurrent comment', ${quote(commentRequest)});`,
      ),
    ),
  )
  await assertSql(
    `(select count(*) from public.social_comments where author_id = ${quote(bob)} and request_id = ${quote(commentRequest)}) = 1`,
    'eight concurrent comment retries create one pending comment',
  )
  await assertSql(
    `not exists(select 1 from public.social_notifications where actor_id = ${quote(bob)} and kind = 'comment')`,
    'pending concurrent comments do not expose activity before review',
  )

  await Promise.all(
    Array.from({ length: 6 }, () =>
      as(alice, `select public.create_social_post(${quote(secondEntry)}, 'One lunch', 'public');`),
    ),
  )
  await assertSql(
    `(select count(*) from public.social_posts where source_entry_id = ${quote(secondEntry)}) = 1`,
    'concurrent publish retries preserve one snapshot per source',
  )

  // Each ordering races the legacy INSERT block path against a new follow RPC.
  // A follow may finish before the block or be denied after it; neither may
  // leave an edge after both transactions have completed.
  for (let round = 0; round < 4; round++) {
    await sql(`delete from public.blocked_authors where (user_id = ${quote(alice)} and author_id = ${quote(bob)})
      or (user_id = ${quote(bob)} and author_id = ${quote(alice)});
      delete from public.social_follows where (follower_id = ${quote(alice)} and followed_id = ${quote(bob)})
      or (follower_id = ${quote(bob)} and followed_id = ${quote(alice)});`)
    const blocker = round % 2 ? alice : bob
    const blocked = round % 2 ? bob : alice
    const races = [
      () =>
        as(
          blocker,
          `insert into public.blocked_authors(user_id, author_id) values (${quote(blocker)}, ${quote(blocked)});`,
        ),
      () => as(alice, `select public.set_social_follow(${quote(bob)}, true);`, true),
      () => as(bob, `select public.set_social_follow(${quote(alice)}, true);`, true),
    ]
    if (round >= 2) races.reverse()
    await Promise.all(races.map((race) => race()))
    await assertSql(
      `not exists(select 1 from public.social_follows where
      (follower_id = ${quote(alice)} and followed_id = ${quote(bob)}) or
      (follower_id = ${quote(bob)} and followed_id = ${quote(alice)}))`,
      `block/follow race ${round + 1} leaves neither follow direction`,
    )
  }

  const targets = allIds.slice(7)
  await sql(`insert into public.social_follows(follower_id, followed_id)
    select ${quote(capped)}, u from unnest(array[${targets.slice(0, 4999).map(quote).join(',')}]::uuid[]) u;`)
  const capResults = await Promise.all([
    as(capped, `select public.set_social_follow(${quote(targets[4999])}, true);`, true),
    as(capped, `select public.set_social_follow(${quote(carol)}, true);`, true),
  ])
  if (capResults.filter((result) => result.ok).length !== 1) {
    throw new Error('Exactly one concurrent 5,000th follow must win')
  }
  await assertSql(
    `(select count(*) from public.social_follows where follower_id = ${quote(capped)}) = 5000`,
    'two concurrent follows at 4,999 cannot exceed the 5,000 cap',
  )
  await assertSql(
    `(select sum(value) from public.social_counters where entity_id = ${quote(capped)} and metric = 'following') = 5000`,
    'the concurrent cap decision preserves counter reconciliation',
  )

  await Promise.all(
    Array.from({ length: 6 }, () =>
      as(carol, `select public.report_social_content('post', ${quote(post)}, 'spam');`),
    ),
  )
  await assertSql(
    `(select count(*) from public.social_reports where kind = 'post' and content_id = ${quote(post)} and reporter_id = ${quote(carol)}) = 1`,
    'concurrent report retries count as one reporter',
  )
  await assertSql(
    `(select used from public.social_rate_limits where user_id = ${quote(carol)} and action = 'report') = 1`,
    'concurrent report retries consume one rate-limit claim',
  )
  await assertSql(
    `(select quarantined from public.social_posts where id = ${quote(post)}) = false`,
    'one concurrent reporter cannot quarantine a post',
  )
  await Promise.all([
    as(capped, `select public.report_social_content('post', ${quote(post)}, 'spam');`),
    as(allIds[4], `select public.report_social_content('post', ${quote(post)}, 'spam');`),
  ])
  await assertSql(
    `(select count(*) from public.social_reports where kind = 'post' and content_id = ${quote(post)}) = 3`,
    'simultaneous distinct reporters preserve every canonical report',
  )
  await assertSql(
    `(select quarantined from public.social_posts where id = ${quote(post)}) = true`,
    'simultaneous reports crossing the threshold cannot miss quarantine',
  )
  await assertSql(
    `public.review_social_content('post', ${quote(post)}, 1, 'approved', null) = false`,
    'a review started before concurrent reports cannot reopen quarantined content',
  )
  console.log(`${assertions} local concurrency assertions passed.`)
} finally {
  await sql(`delete from auth.users where id = any(array[${allIds.map(quote).join(',')}]::uuid[]);`)
  await assertSql(
    `not exists(select 1 from public.social_profiles where user_id = any(array[${allIds.map(quote).join(',')}]::uuid[]))`,
    'the exact temporary fixture identities have been removed',
  )
}
