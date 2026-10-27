-- ---------------------------------------------------------------------------
-- What happens the moment an account exists.
--
-- Every screen after sign-in assumes a profile row and a settings row. Making the
-- client create them means the app is one failed request away from a user who is
-- authenticated but has nothing to read, and it means every future client
-- reimplementing the same three inserts. The database does it once, in the same
-- transaction that creates the user, so the two cannot come apart.
--
-- Both the function and the trigger are declarative. See the note at the bottom
-- of this file for why that is worth stating.
--
-- `security definer` is required rather than decorative. This runs inside
-- GoTrue's transaction as `supabase_auth_admin`, a role with no rights on
-- `public` at all, and as an invoker the insert fails and signup fails with it.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''));
  v_local text;
  v_base text;
  v_handle text;
begin
  -- Whatever the identity provider told us. Apple gives a name on the first
  -- sign-in only, Google gives one every time, email/password gives none.
  -- Without one, the address's local part is made into a name ("nelson.gan"
  -- becomes "Nelson Gan"), and the handle gets four random characters after
  -- it, since a handle that was exactly the local part published the address.
  -- Anything after a "+" is dropped from both. An empty name is filled in by
  -- the onboarding name step.
  if v_name is null then
    v_local := split_part(split_part(coalesce(new.email, ''), '@', 1), '+', 1);
    v_name := btrim(initcap(regexp_replace(v_local, '[._+-]+', ' ', 'g')));
    v_base := lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_local));
    v_base := regexp_replace(v_base, '[^a-z0-9.]+', '.', 'g');
    v_base := trim(both '.' from regexp_replace(v_base, '[.]+', '.', 'g'));
    v_base := trim(both '.' from left(v_base, 19));
    if char_length(v_base) < 3 then v_base := 'user'; end if;
    -- 36^4 suffixes; asked again on the rare one already taken.
    loop
      v_handle := v_base || '.' || (
        select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
        from generate_series(1, 4));
      perform pg_advisory_xact_lock(hashtextextended('profile.handle:' || v_handle, 0));
      exit when not exists (select 1 from public.profiles p where p.handle = v_handle);
    end loop;
  end if;

  insert into public.profiles (id, display_name, handle)
  values (new.id, coalesce(v_name, ''), v_handle)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Sensible Malaysian defaults, reminders off. A notification the user never
  -- asked for on the day they sign up is how an app gets its permission
  -- revoked; the reminders screen turns them on.
  insert into public.meal_times (user_id, meal, at, reminder_enabled)
  values
    (new.id, 'breakfast', time '08:00', false),
    (new.id, 'lunch',     time '13:00', false),
    (new.id, 'dinner',    time '19:30', false),
    (new.id, 'snack',     time '16:00', false)
  on conflict (user_id, meal) do nothing;

  -- No `daily_goals` row. It cannot be computed before onboarding has
  -- collected a body, and a placeholder budget is worse than none: the Today
  -- screen would render a ring against a number nobody chose.
  return new;
end;
$$;

revoke execute on function public.handle_new_user from public, anon, authenticated;
grant execute on function public.handle_new_user to service_role;

comment on function public.handle_new_user is
  'Creates the rows every signed-in screen assumes exist. Deliberately '
  'strict: if it raises, signup fails, which is louder and more fixable than '
  'an account that exists with nothing behind it.';


-- ---------------------------------------------------------------------------
-- The attachment.
--
-- This is declarative after all. The first attempt put it in a hand-written
-- migration on the assumption that `supabase db diff` ignores the `auth` schema.
-- It ignores `storage`, but it very much does track triggers on `auth.users`, and
-- proved it by generating `DROP TRIGGER on_auth_user_created ON auth.users` as
-- its first act. Left that way, the nightly drift check fails and the next
-- generated migration deletes the trigger.
-- ---------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
