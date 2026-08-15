-- A per-account hourly rate limit for the barcode edge function.
--
-- The barcode lookup is the one model-adjacent path with no throttle: it spends
-- no AI budget, so `claim_ai_inference` never sees it, and a signed-in caller
-- could loop distinct codes to drive a live Open Food Facts fetch and a
-- `barcode_misses` write on every one. This is the AI meter's shape applied to
-- that path: one row per hour, an atomic claim, no client write grant.
--
-- Hand-written in full (not only the grants) because it is applied without a
-- local Docker stack to `db diff` against; the function bodies are copied
-- verbatim from schemas/32_food_scans.sql so a future diff sees no change.

create table public.barcode_scan_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  scans        integer not null default 0 check (scans >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, window_start)
);

create trigger barcode_scan_usage_set_updated_at
  before update on public.barcode_scan_usage
  for each row execute function public.set_updated_at();

alter table public.barcode_scan_usage enable row level security;

grant select on public.barcode_scan_usage to authenticated;
grant select, insert, update, delete on public.barcode_scan_usage to service_role;

create policy "barcode_scan_usage: read own"
  on public.barcode_scan_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.barcode_hourly_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 120;
$$;

revoke execute on function public.barcode_hourly_limit from public, anon;
grant execute on function public.barcode_hourly_limit to authenticated, service_role;

create or replace function public.claim_barcode_scan(p_user uuid)
returns table (
  allowed       boolean,
  used          integer,
  hourly_limit  integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  integer     := public.barcode_hourly_limit();
  v_window timestamptz := date_trunc('hour', (now() at time zone 'utc')) at time zone 'utc';
  v_used   integer;
begin
  insert into public.barcode_scan_usage as u (user_id, window_start, scans)
  values (p_user, v_window, 1)
  on conflict (user_id, window_start) do update
     set scans = u.scans + 1
   where u.scans + 1 <= v_limit
  returning u.scans into v_used;

  if v_used is null then
    select u.scans into v_used
      from public.barcode_scan_usage u
     where u.user_id = p_user and u.window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit;
    return;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

revoke execute on function public.claim_barcode_scan from public, anon, authenticated;
grant execute on function public.claim_barcode_scan to service_role;
