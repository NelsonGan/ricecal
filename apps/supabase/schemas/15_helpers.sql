-- ---------------------------------------------------------------------------
-- Helpers that read `profiles`, so they cannot live in 02_functions.sql.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- What day it is where the user is.
--
-- The server clock is UTC. Kuala Lumpur is UTC+8, so between 00:00 and 08:00
-- local, `current_date` on the server is still yesterday — a supper logged at
-- 00:30 would land on the previous day's total and quietly ruin both days.
-- Every server-side date decision goes through here instead.
--
-- The client still sends `log_date` explicitly on writes it initiates; this is
-- the default for the paths that do not, and the basis for the reminder and
-- report jobs that have no client at all.
-- ---------------------------------------------------------------------------
create or replace function public.local_today(p_user_id uuid default auth.uid())
returns date
language sql
stable
set search_path = ''
as $$
  select (
    now() at time zone coalesce(
      (select p.timezone from public.profiles p where p.id = p_user_id),
      'Asia/Kuala_Lumpur'
    )
  )::date;
$$;

comment on function public.local_today is
  'The calling user''s current calendar date, in their own timezone. Falls '
  'back to Asia/Kuala_Lumpur when there is no profile yet, which is only true '
  'between the auth row and the onboarding write.';
