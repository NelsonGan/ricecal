-- The in-app news announcements this account has been shown, by id.
--
-- On the account rather than the phone because showing one can change a
-- setting: the feed announcement switches Auto post foods on. Kept per install,
-- a reinstall or a second phone would show it again and switch it back on for
-- somebody who had turned it off. The ids are the app's own
-- (`features/news/announcements.ts`).
--
-- Written only through `see_announcements`, never through a column grant. A
-- grant that a store binary writes can never be taken back, and the claim has
-- to add to the list and switch the setting in one statement, which PostgREST
-- cannot express against an array.
alter table public.profiles
  add column seen_announcements text[] not null default '{}'
    check (cardinality(seen_announcements) <= 200);

create or replace function public.see_announcements(
  p_ids text[], p_auto_post_foods boolean default null
)
returns setof public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 50
     or exists (select 1 from unnest(p_ids) i where i is null or i !~ '^[a-z0-9_]{1,64}$') then
    raise exception 'Between 1 and 50 announcement ids are required' using errcode = '22023';
  end if;
  -- No row comes back when every id was already seen. That is how the caller
  -- knows nothing was switched, and why two phones end with one change.
  return query
    update public.profiles p
    set seen_announcements = p.seen_announcements || array(
          select distinct i from unnest(p_ids) i
          where not (i = any(p.seen_announcements)) order by 1),
        auto_post_foods = coalesce(p_auto_post_foods, p.auto_post_foods)
    where p.id = v_user and not (p.seen_announcements @> p_ids)
    returning p.*;
end;
$$;

revoke execute on function public.see_announcements from public, anon;
grant execute on function public.see_announcements to authenticated, service_role;
