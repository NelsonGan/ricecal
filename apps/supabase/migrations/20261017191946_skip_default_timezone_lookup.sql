-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.profiles_valid_timezone()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' and new.timezone = 'Asia/Kuala_Lumpur' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;

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
$function$;
-- `create or replace` keeps the function's grants, so this changes nothing on a
-- database that already has the revoke. Restated so the migration says it too:
-- `supabase db diff` never carries a revoke.
REVOKE EXECUTE ON FUNCTION public.profiles_valid_timezone() FROM PUBLIC, anon, authenticated;
