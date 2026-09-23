-- Loaded only by social-scale.mjs into the named local Docker database. All
-- fixture rows, helper functions and measurements are inside one rollback.
begin;
set local statement_timeout = '180s';
set local lock_timeout = '5s';

create function pg_temp.social_bench_id(p_kind text, p_number integer)
returns uuid language sql immutable as $$
  select md5('ricecal-social-benchmark/' || p_kind || '/' || p_number)::uuid
$$;
grant execute on function pg_temp.social_bench_id(text, integer) to authenticated;

do $$ begin
  if exists(select 1 from public.social_profiles where handle like 'zz_bench_%') then
    raise exception 'Unexpected persistent benchmark fixtures; refusing to overwrite them';
  end if;
end $$;

create temp table social_bench_size as
select sum(pg_total_relation_size(c.oid))::bigint as bytes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'social_%';

-- Skip irrelevant private-profile/onboarding side effects during bulk fixture
-- creation. Canonical social edges and counters are populated explicitly below.
set local session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select pg_temp.social_bench_id('user', n), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'zz-bench-' || n || '@social.example.test', '{}', '{}'
from generate_series(1, 15050) n;

insert into public.social_profiles (user_id, handle, display_name, review_status)
select pg_temp.social_bench_id('user', n), 'zz_bench_' || lpad(n::text, 5, '0'),
       'Benchmark cook ' || n, 'approved'
from generate_series(1, 15050) n;

create temp table social_bench_sources as
select n,
  case when n <= 100000 then (n - 1) % 5000 + 1
       when n <= 105000 then n - 100000 + 5000
       else (n - 105001) % 5 + 10001 end as author_number,
  '2026-01-15 12:00:00+00'::timestamptz - n * interval '1 second' as created_at
from generate_series(1, 110000) n;

insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
select pg_temp.social_bench_id('entry', n), pg_temp.social_bench_id('user', author_number),
       'Benchmark rice', 200, 44, 4, 1, '1 bowl', 1
from social_bench_sources;
insert into public.social_posts
  (id, author_id, source_entry_id, food_name, caption, audience, review_status, created_at, published_at)
select pg_temp.social_bench_id('post', n), pg_temp.social_bench_id('user', author_number),
       pg_temp.social_bench_id('entry', n),
       'Benchmark rice', 'A local benchmark fixture', 'public', 'approved', created_at, created_at
from social_bench_sources;

create temp table social_bench_cases as
select (cohort - 1) * 4 + ordinal as case_number,
       (array['dense', 'sparse', 'few_posting'])[cohort] as cohort,
       follows, (cohort - 1) * 5000 as author_offset,
       pg_temp.social_bench_id('user', (15000 + (cohort - 1) * 4 + ordinal)::int) as viewer_id
from generate_series(1, 3) cohort
cross join unnest(array[10,100,1000,5000]) with ordinality counts(follows, ordinal);
insert into public.social_follows (follower_id, followed_id)
select viewer_id, pg_temp.social_bench_id('user', author_offset + n)
from social_bench_cases cross join lateral generate_series(1, follows) n;
insert into public.social_follows (follower_id, followed_id)
select pg_temp.social_bench_id('user', 15040), pg_temp.social_bench_id('user', seed)
from generate_series(14001,14064) seed;
insert into public.social_follows (follower_id, followed_id)
select pg_temp.social_bench_id('user', seed), pg_temp.social_bench_id('user', target)
from generate_series(14001,14064) seed cross join generate_series(1,64) target;

-- Publication cost for this author must not depend on its 15,000 followers.
insert into public.social_follows (follower_id, followed_id)
select pg_temp.social_bench_id('user', n), pg_temp.social_bench_id('user', 15020)
from generate_series(1,15000) n;
insert into public.social_notifications (id, recipient_id, actor_id, kind, created_at)
select pg_temp.social_bench_id('notification', n), pg_temp.social_bench_id('user', 15020),
       pg_temp.social_bench_id('user', n), 'follow',
       '2026-01-15 12:00:00+00'::timestamptz - n * interval '1 second'
from generate_series(1,15000) n;

-- The dense viewer follows every author of the newest 100,000 posts. This
-- deliberately exposes the cost of Discover excluding mostly followed content.
insert into public.social_reports (kind, content_id, content_revision, reporter_id, reason)
select 'post', pg_temp.social_bench_id('post', n), 1, pg_temp.social_bench_id('user', 15004), 'spam'
from generate_series(100001,100500) n;
insert into public.blocked_authors (user_id, author_id)
select pg_temp.social_bench_id('user', 15004), pg_temp.social_bench_id('user', n)
from generate_series(5501,5600) n;
insert into public.blocked_authors (user_id, author_id)
select pg_temp.social_bench_id('user', viewer), p.user_id
from generate_series(15001,15050) viewer cross join public.social_profiles p
where p.handle not like 'zz_bench_%';

-- A popular post exercises bounded sharded sums instead of full edge counts.
insert into public.social_likes (post_id, user_id)
select pg_temp.social_bench_id('post', 1), pg_temp.social_bench_id('user', n)
from generate_series(2,15000) n;

-- The exact shard choice is internal. Distribution here is intentionally even;
-- role-executed correctness tests independently verify trigger reconciliation.
insert into public.social_counters (entity_id, metric, shard, value)
select followed_id, 'followers'::public.social_counter_metric, (hashtextextended(follower_id::text, 0) & 31)::int, count(*)
from public.social_follows where followed_id in (select user_id from public.social_profiles where handle like 'zz_bench_%')
group by followed_id, (hashtextextended(follower_id::text, 0) & 31)::int
union all
select follower_id, 'following'::public.social_counter_metric, (hashtextextended(followed_id::text, 0) & 31)::int, count(*)
from public.social_follows where follower_id in (select user_id from public.social_profiles where handle like 'zz_bench_%')
group by follower_id, (hashtextextended(followed_id::text, 0) & 31)::int
union all
select author_id, 'posts'::public.social_counter_metric, (hashtextextended(id::text, 0) & 31)::int, count(*)
from public.social_posts where id in (select pg_temp.social_bench_id('post', n) from social_bench_sources)
group by author_id, (hashtextextended(id::text, 0) & 31)::int
union all
select post_id, 'likes'::public.social_counter_metric, (hashtextextended(user_id::text, 0) & 31)::int, count(*)
from public.social_likes where post_id = pg_temp.social_bench_id('post', 1)
group by post_id, (hashtextextended(user_id::text, 0) & 31)::int;
set local session_replication_role = origin;

analyze public.social_profiles;
analyze public.social_posts;
analyze public.social_follows;
analyze public.social_likes;
analyze public.social_counters;
analyze public.social_reports;
analyze public.blocked_authors;
analyze public.social_notifications;

select 'SOCIAL_BENCH_META ' || json_build_object(
  'users', 15050, 'posts', 110000, 'follows', (select count(*) from public.social_follows),
  'socialBytesBefore', (select bytes from social_bench_size),
  'socialBytesDuring', (select sum(pg_total_relation_size(c.oid)) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    and c.relkind = 'r' and c.relname like 'social_%')
)::text;

create function pg_temp.social_bench_measure(p_name text, p_sql text, p_pass integer)
returns text language plpgsql security invoker as $$
declare result json;
begin
  execute 'explain (analyze, buffers, format json) ' || p_sql into result;
  return 'SOCIAL_BENCH_RESULT ' || jsonb_build_object('name', p_name, 'pass', p_pass, 'explain', result)::text;
end;
$$;
grant execute on function pg_temp.social_bench_measure(text, text, integer) to authenticated;

-- The harness appends authenticated RPC measurements and ROLLBACK. EXPLAIN
-- executes the actual API and records all nested buffers even for opaque RPCs.
