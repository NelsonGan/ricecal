-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.social_auto_post_food()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_private boolean;
  v_entry public.food_logs;
  v_totals record;
begin
  -- Lock the profile before the rate row, as manual sharing does.
  select p.is_private into v_private
  from public.profiles p
  where p.id = new.user_id and p.auto_post_foods and not p.quarantined
  for update;
  if not found then return null; end if;
  select * into v_entry from public.food_logs f where f.id = new.id;
  if not found then return null; end if;
  -- Only today's and yesterday's meals: a day filled in after the fact is not
  -- news, and it would top everyone's feed as if just eaten. Workouts have the
  -- same rule (save_workout).
  if v_entry.log_date < public.local_today(new.user_id) - 1 then return null; end if;
  if exists (select 1 from public.social_posts p where p.source_entry_id = new.id) then
    return null;
  end if;
  -- Apply the same posting budget as Share without failing the diary write.
  if not private.social_claim(new.user_id, 'post', 30) then return null; end if;
  update public.profiles set social_joined_at = coalesce(social_joined_at, now()),
    review_status = 'approved', review_reason = null
  where id = new.user_id and (social_joined_at is null or review_status = 'pending');

  select d.kcal, d.carbs_g, d.protein_g, d.fat_g into v_totals
  from public.food_log_details d where d.id = new.id;
  if not found then return null; end if;

  insert into public.social_posts (
    author_id, source_entry_id, food_name, icon_set, icon_name, photo_path,
    kcal, carbs_g, protein_g, fat_g, caption, audience, review_status, published_at
  ) values (
    new.user_id, new.id, left(coalesce(v_entry.display_label, v_entry.item_name), 160),
    coalesce(v_entry.icon_set, v_entry.item_icon_set), coalesce(v_entry.icon_name, v_entry.item_icon_name),
    case when v_entry.photo_path like 'meals/' || new.user_id::text || '/%' then v_entry.photo_path end,
    v_totals.kcal, v_totals.carbs_g, v_totals.protein_g, v_totals.fat_g,
    '', case when v_private then 'followers'::public.social_audience
             else 'public'::public.social_audience end,
    'approved', now()
  ) on conflict (source_entry_id) do nothing;
  return null;
end;
$function$;

CREATE FUNCTION public.see_announcements (
  p_ids             text[],
  p_auto_post_foods boolean DEFAULT NULL::boolean
)
  RETURNS SETOF public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.see_announcements(text[], boolean) TO authenticated;

GRANT ALL ON FUNCTION public.see_announcements(text[], boolean) TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN seen_announcements text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_seen_announcements_check CHECK (cardinality(seen_announcements) <= 200);
-- db diff does not preserve function grants.
REVOKE EXECUTE ON FUNCTION public.see_announcements(text[], boolean) FROM PUBLIC, anon;
