-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.social_post_food (
  p_post_id uuid
)
  RETURNS TABLE (
    food_name  text,
    icon_set   public.icon_set,
    icon_name  text,
    photo_path text,
    kcal       integer,
    carbs_g    numeric,
    protein_g  numeric,
    fat_g      numeric
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entry_id uuid;
  v_author_id uuid;
  v_photo_path text;
begin
  select p.source_entry_id, p.author_id, p.photo_path
    into v_entry_id, v_author_id, v_photo_path
  from public.social_posts p
  where p.id = p_post_id and private.social_can_view_post(p.id);
  if not found then return; end if;

  -- Look up the one entry by primary key. Joining the expanded diary view to
  -- posts made Postgres scan every logged meal belonging to a busy author.
  return query select left(d.food_name, 160), d.icon_set, d.icon_name,
    -- A replacement photo must pass the existing review and signing path.
    case when d.photo_path = v_photo_path then d.photo_path end,
    d.kcal, d.carbs_g, d.protein_g, d.fat_g
  from public.food_log_details d
  where d.id = v_entry_id and d.user_id = v_author_id;
end;
$function$;

REVOKE ALL ON FUNCTION private.social_post_food(uuid) FROM PUBLIC, anon;

GRANT ALL ON FUNCTION private.social_post_food(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_post_food(uuid) TO service_role;

CREATE OR REPLACE VIEW public.social_post_details WITH (security_invoker=true) AS SELECT p.id,
    p.author_id,
    a.handle,
    a.display_name,
    a.avatar_path,
    food.food_name,
    food.icon_set,
    food.icon_name,
    food.photo_path,
    food.kcal,
    food.carbs_g,
    food.protein_g,
    food.fat_g,
    p.caption,
    p.audience,
    p.review_status,
    p.review_reason,
    p.revision,
    p.quarantined,
    p.created_at,
    p.published_at,
    private.social_count(p.id, 'likes'::public.social_counter_metric) AS like_count,
    private.social_count(p.id, 'comments'::public.social_counter_metric) AS comment_count,
    COALESCE(( SELECT true
           FROM public.social_likes l
          WHERE ((l.post_id = p.id) AND (l.user_id = ( SELECT auth.uid() AS uid)))
         LIMIT 1), false) AS is_liked,
    COALESCE(( SELECT true
           FROM public.social_follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_id = p.author_id))
         LIMIT 1), false) AS is_following
   FROM ((public.social_posts p
     JOIN public.social_profiles a ON ((a.user_id = p.author_id)))
     JOIN LATERAL private.social_post_food(p.id) food(food_name, icon_set, icon_name, photo_path, kcal, carbs_g, protein_g, fat_g) ON (true));
