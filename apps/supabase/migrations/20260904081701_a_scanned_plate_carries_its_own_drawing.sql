-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.day_plates (
  p_from    date,
  p_to      date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at         date,
    food_name  text,
    icon_set   public.icon_set,
    icon_name  text,
    photo_path text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The view alone, which it was not always. `food_log_details` used to null an
  -- entry's icons whenever it had a photograph, so this grid joined back to
  -- `food_logs` for the drawing it still wanted on the day a sweep takes the
  -- picture away. The view coalesces the two icon columns and stops there now,
  -- which is the same expression this was writing out by hand.
  select distinct on (e.log_date)
    e.log_date,
    e.food_name,
    e.icon_set,
    e.icon_name,
    e.photo_path
  from public.food_log_details e
  where e.user_id = p_user_id
    and e.log_date between p_from and p_to
  -- The tie-break is the timestamp rather than nothing at all: two plates of
  -- the same size on one day would otherwise pick whichever the planner
  -- happened to read first, and the cell would change picture between
  -- renders of the same month.
  order by e.log_date, e.kcal desc nulls last, e.logged_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.review_meals (
  p_kind    text,
  p_start   date,
  p_limit   integer DEFAULT 5,
  p_user_id uuid    DEFAULT auth.uid()
)
  RETURNS TABLE (
    name          text,
    icon_set      public.icon_set,
    icon_name     text,
    photo_path    text,
    kcal_avg      integer,
    carbs_g_avg   numeric,
    protein_g_avg numeric,
    fat_g_avg     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  entries as (
    -- The view alone, which it was not always. It used to null both icon
    -- columns whenever an entry had a photograph, and this screen wants BOTH:
    -- the plate somebody actually photographed, and a drawing to fall back on
    -- when nobody did. So this joined back to `food_logs` and wrote the
    -- coalesce out by hand, under an `own_icon_*` alias to keep it clear of the
    -- view's own nulls. The view does exactly that coalesce now, so the join,
    -- the alias and the reason for both are gone.
    select e.*
    from public.food_log_details e
    cross join span s
    where e.user_id = p_user_id and e.log_date between s.from_date and s.to_date
  )
  select
    -- The most recent spelling wins. Two entries differing only in case are one
    -- dish, and the newer one is the one the user last saw on their diary.
    (array_agg(e.food_name order by e.logged_at desc))[1],
    -- The newest entry that HAS a drawing, which is not the same as the newest
    -- entry's: one logged by hand under a name two others were photographed
    -- under is the only one of the three carrying an icon.
    (array_agg(e.icon_set  order by e.logged_at desc) filter (where e.icon_set  is not null))[1],
    (array_agg(e.icon_name order by e.logged_at desc) filter (where e.icon_name is not null))[1],
    -- The newest plate anybody photographed under this name, which is not
    -- necessarily the entry the icon came from: a dish logged twice by camera
    -- and once by hand has a photograph and a drawing, and the screen prefers
    -- the photograph exactly as the diary does.
    (array_agg(e.photo_path order by e.logged_at desc) filter (where e.photo_path is not null))[1],
    round(avg(e.kcal))::integer,
    round(avg(e.carbs_g), 1),
    round(avg(e.protein_g), 1),
    round(avg(e.fat_g), 1)
  from entries e
  group by lower(e.food_name)
  -- The dearest plate first. A tie goes to the one eaten more often, which is
  -- the difference between a heavy meal and a heavy habit.
  order by avg(e.kcal) desc, count(*) desc
  limit greatest(p_limit, 0);
$function$;

CREATE OR REPLACE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT id,
    user_id,
    log_date,
    quantity,
    logged_at,
    note,
    source,
    photo_path,
    food_id,
    scan_id,
    suggested_edits,
    COALESCE(display_label, item_name) AS food_name,
    item_brand AS food_brand,
    COALESCE(icon_set, item_icon_set) AS icon_set,
    COALESCE(icon_name, item_icon_name) AS icon_name,
    item_place AS place,
    serving_id,
    serving_label,
    serving_factor,
    override_kcal,
    override_carbs_g,
    override_protein_g,
    override_fat_g,
    COALESCE(override_kcal, ( SELECT (round(sum((((i.base_kcal)::numeric * i.serving_factor) * i.quantity))))::integer AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), (round((((base_kcal)::numeric * serving_factor) * quantity)))::integer) AS kcal,
    COALESCE(override_carbs_g, ( SELECT round(sum(((i.base_carbs_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_carbs_g * serving_factor) * quantity), 1)) AS carbs_g,
    COALESCE(override_protein_g, ( SELECT round(sum(((i.base_protein_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_protein_g * serving_factor) * quantity), 1)) AS protein_g,
    COALESCE(override_fat_g, ( SELECT round(sum(((i.base_fat_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_fat_g * serving_factor) * quantity), 1)) AS fat_g,
    round(((base_fibre_g * serving_factor) * quantity), 1) AS fibre_g,
    round(((base_sugar_g * serving_factor) * quantity), 1) AS sugar_g,
    (round((((base_sodium_mg)::numeric * serving_factor) * quantity)))::integer AS sodium_mg,
    round((serving_grams * quantity), 1) AS grams,
    recipe_id,
    item_name,
    item_brand,
    base_kcal,
    base_carbs_g,
    base_protein_g,
    base_fat_g,
    base_fibre_g,
    base_sugar_g,
    base_sodium_mg,
    serving_grams AS base_serving_grams
   FROM public.food_logs e;