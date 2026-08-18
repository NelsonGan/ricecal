-- A timezone this database can actually use.
--
-- `authenticated` holds a table-wide update grant on `profiles`, and
-- `local_today` does `now() at time zone <that text>`, which RAISES
-- `invalid_parameter_value` for anything that is not an IANA name. A single
-- PATCH setting the column to "x" therefore turns a function half the server
-- depends on into one that throws for that account.
--
-- THE EXPENSIVE CASE IS THE SCAN QUOTA that 20260818170000_freemium_tiers.sql
-- introduced. `claim_scan` resolves the day through `local_today`, and the edge
-- function reads any error from that claim as "allow uncounted" — deliberately,
-- because a database blip must not tell a paying user they are cut off. Put
-- together, one junk write buys an account unlimited scans for ever, and the
-- only trace is a log line. The meter cannot be the thing that fixes it, so it
-- is fixed where a timezone gets in.
--
-- Hand-written because it is applied without a local Docker stack to `db diff`
-- against; the function body is copied verbatim from schemas/10_profiles.sql so
-- a future diff sees no change.

create or replace function public.profiles_valid_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (
       select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone
     ) then
    -- `old` only exists on an update, and on an insert there is nothing to keep
    -- but the column's own default.
    new.timezone := case
      when tg_op = 'UPDATE' then coalesce(old.timezone, 'Asia/Kuala_Lumpur')
      else 'Asia/Kuala_Lumpur'
    end;
  end if;
  return new;
end;
$$;

-- Stated here and applied by a hand-written migration: `db diff` does not carry
-- grants, so a revoke that only lives in a schema file never happens.
revoke execute on function public.profiles_valid_timezone from public, anon, authenticated;

create trigger profiles_valid_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_valid_timezone();
