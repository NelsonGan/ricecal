-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.social_auto_post_food()
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

CREATE CONSTRAINT TRIGGER social_auto_post_food
  AFTER INSERT ON public.food_logs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.social_auto_post_food();

ALTER TABLE public.profiles
  ADD COLUMN auto_post_foods boolean DEFAULT false NOT NULL;

REVOKE UPDATE
  (activity_level, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex, target_weight_kg, timezone)
  ON public.profiles FROM authenticated;

GRANT UPDATE
  (activity_level, auto_post_foods, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex, target_weight_kg,
  timezone) ON public.profiles TO authenticated;

-- db diff does not preserve function grants.
REVOKE EXECUTE ON FUNCTION private.social_auto_post_food() FROM PUBLIC, anon, authenticated;
