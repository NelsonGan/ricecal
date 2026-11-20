-- Measured portions: kitchen units for diary entries and recipe ingredients.
--
-- `food_logs.serving_ml` is what one base serving holds, beside the existing
-- `serving_grams`, so an entry moved into grams or cups keeps the density its
-- old label carried. `recipe_ingredients.display_unit` is the unit the cook
-- measured in (2 tbsp stored as 29.57 ml). Both nullable and additive: a build
-- already in a store neither reads nor needs them.
--
-- Three functions learn what a measured entry is. `add_ingredient` seeds an
-- entry counted outside a part's quarter-to-twenty range (15 g is 0.15 of
-- "100 g") as one of its whole portion instead of refusing to break it down.
-- `group_board` and `group_post_food` send how much was eaten beside the label,
-- so a friend sees "350 g" rather than "100 g"; an older app ignores the field.
--
-- `food_log_details.grams` gains the serving factor it always lacked, since
-- `serving_grams` is one BASE serving's weight. Nothing read it yet; it would
-- have read 525 g for 150 g of a plate logged in grams.
--
-- Hand-arranged from `pnpm db:diff`, which dropped and recreated both views,
-- and with them `daily_nutrition` (built on `food_log_details`) and
-- `get_shared_recipe_ingredients` (which returns `recipe_ingredient_details`
-- rows). A recreated function comes back executable by PUBLIC and without its
-- comment, because the diff does not carry grants. Each view only gains a
-- column at its end instead, which `create or replace` allows, and everything
-- built on them keeps its grants untouched.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.group_post_food (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_entry uuid; v_author uuid; v_food jsonb;
begin
  select p.source_entry_id, p.author_id into v_entry, v_author
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined;
  if v_entry is null then return null; end if;
  select jsonb_build_object(
    'post_id', p_post_id, 'name', left(d.food_name, 160), 'icon_set', d.icon_set, 'icon_name', d.icon_name,
    'photo_path', d.photo_path,
    'serving_label', d.serving_label, 'quantity', round(d.quantity * d.plate_quantity, 2),
    'logged_at', d.logged_at,
    'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_author;
  return v_food;
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_ingredient (
  p_food_log_id   uuid,
  p_name          text,
  p_kcal          numeric,
  p_carbs_g       numeric,
  p_protein_g     numeric,
  p_fat_g         numeric,
  p_quantity      numeric  DEFAULT 1,
  p_grams         numeric  DEFAULT NULL::numeric,
  p_food_id       uuid     DEFAULT NULL::uuid,
  p_serving_id    text     DEFAULT NULL::text,
  p_serving_label text     DEFAULT NULL::text,
  p_position      smallint DEFAULT NULL::smallint
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entry public.food_logs;
  v_parts integer;
  v_seed_quantity numeric;
  v_seed_factor   numeric;
  v_name  text := left(btrim(coalesce(p_name, '')), 120);
  v_label text := left(btrim(coalesce(p_serving_label, '')), 120);
  v_id    uuid;
begin
  select * into v_entry from public.food_logs where id = p_food_log_id;
  if v_entry.id is null or v_entry.user_id is distinct from auth.uid() then
    raise exception 'entry not found';
  end if;

  if v_name = '' then
    raise exception 'ingredient needs a name';
  end if;
  if p_kcal is null or p_kcal < 0 or p_kcal > 20000 then
    raise exception 'kcal out of range';
  end if;
  if p_quantity is null or p_quantity < 0.25 or p_quantity > 20 then
    raise exception 'quantity out of range';
  end if;
  if p_grams is not null and (p_grams <= 0 or p_grams > 20000) then
    raise exception 'grams out of range';
  end if;

  select count(*) into v_parts
  from public.food_log_ingredients
  where food_log_id = v_entry.id;

  -- A plate is a handful of things. The ceiling is here so a stuck client
  -- cannot grow one row's breakdown without limit.
  if v_parts >= 30 then
    raise exception 'too many ingredients on this entry';
  end if;

  if v_parts = 0 then
    if v_entry.override_kcal is not null then
      raise exception 'entry has typed figures';
    end if;
    if v_entry.quantity between 0.25 and 20 then
      v_seed_quantity := v_entry.quantity;
      v_seed_factor   := v_entry.serving_factor;
    else
      v_seed_quantity := 1;
      v_seed_factor   := round(v_entry.serving_factor * v_entry.quantity, 3);
      if v_seed_factor < 0.001 or v_seed_factor >= 1000 then
        raise exception 'entry portion is too large to break down';
      end if;
    end if;

    insert into public.food_log_ingredients (
      food_log_id, food_id, serving_id, quantity, item_name,
      base_kcal, base_carbs_g, base_protein_g, base_fat_g,
      serving_label, serving_factor, display_label, grams, position
    )
    values (
      v_entry.id, v_entry.food_id,
      -- A folded part is one of the whole amount, not one "100 g": the entry's
      -- portion label and id would name a size the part is not.
      case when v_seed_quantity = v_entry.quantity then v_entry.serving_id end,
      v_seed_quantity,
      -- The two names copied as the two names, not folded into one. A part
      -- coalesces them exactly as the parent does, so keeping them apart is
      -- what makes the seeded row read back as the entry it came from.
      v_entry.item_name,
      v_entry.base_kcal, v_entry.base_carbs_g, v_entry.base_protein_g, v_entry.base_fat_g,
      case when v_seed_quantity = v_entry.quantity then v_entry.serving_label end,
      v_seed_factor,
      v_entry.display_label,
      -- What one of the parent serving weighs, at the factor it was logged at.
      -- Null rather than clamped where that lands outside what the column
      -- accepts: a weight nobody can store is not a weight worth guessing.
      case
        when v_entry.serving_grams is null then null
        when round(v_entry.serving_grams * v_seed_factor, 1) between 0.1 and 20000
          then round(v_entry.serving_grams * v_seed_factor, 1)
      end,
      0
    );

    -- And the new plate starts whole. The seeded part already carries the
    -- entry's quantity, so a portion left over from an earlier breakdown would
    -- count it twice. Nothing multiplied that value while the entry had no
    -- parts; from this row on, something does.
    update public.food_logs set plate_quantity = 1
    where id = v_entry.id and plate_quantity <> 1;
  end if;

  insert into public.food_log_ingredients (
    food_log_id, food_id, serving_id, quantity, item_name,
    base_kcal, base_carbs_g, base_protein_g, base_fat_g,
    serving_label, serving_factor, display_label, grams, position
  )
  values (
    v_entry.id,
    p_food_id,
    nullif(left(btrim(coalesce(p_serving_id, '')), 200), ''),
    -- Four decimals, matching the column. It was two, which is the same bug the
    -- column had: a part added at a typed weight would have been rounded here
    -- instead of there, and a replacement would come back weighing something
    -- else than the part it replaced.
    round(p_quantity, 4),
    v_name,
    round(p_kcal),
    least(2000, greatest(0, round(coalesce(p_carbs_g, 0), 1))),
    least(2000, greatest(0, round(coalesce(p_protein_g, 0), 1))),
    least(2000, greatest(0, round(coalesce(p_fat_g, 0), 1))),
    nullif(v_label, ''),
    -- One, always. The figures above are per ONE of this part, which is what
    -- the caller was shown; a factor as well would be a second place for the
    -- portion to live and a second chance to count it twice.
    1,
    v_name,
    case when p_grams is null then null else round(p_grams, 1) end,
    -- Where the caller asked for, or after whatever is already there. The
    -- fallback is read off the rows rather than off the count: a plate somebody
    -- has removed the middle of has fewer parts than its highest position, and a
    -- new row numbered by the count would land on top of one that is still
    -- there.
    --
    -- A replacement DOES land on top of one that is still there, briefly, and
    -- that is the intent: the row it is replacing is removed a moment later, and
    -- until then the two are simply adjacent.
    -- NOT `coalesce(greatest(0, p_position), ...)`. `greatest` IGNORES nulls, so
    -- `greatest(0, null)` is 0 rather than null, and every part added without a
    -- position would have landed on top of the plate. The pgTAP suite caught it.
    case
      when p_position is not null then greatest(0, p_position)
      else (select coalesce(max(i.position), -1) + 1
            from public.food_log_ingredients i where i.food_log_id = v_entry.id)
    end
  )
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_board (
  p_group_id uuid,
  p_day      date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_result jsonb;
begin
  if p_day is null or p_day not between public.local_today(v_user) - 60 and public.local_today(v_user) + 1 then
    raise exception 'Day unavailable' using errcode = '22023';
  end if;

  with members as materialized (
    select m.user_id, m.joined_at,
      now() at time zone coalesce(p.timezone, 'Asia/Kuala_Lumpur') as local_now,
      p.timezone,
      case when m.user_id = v_user then 0 else 1 end as rank,
      private.group_last_active(m.user_id) as last_active,
      b.at as breakfast_at, l.at as lunch_at, d.at as dinner_at
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    left join public.meal_times b on b.user_id = m.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = m.user_id and l.meal = 'lunch'
    left join public.meal_times d on d.user_id = m.user_id and d.meal = 'dinner'
    where m.group_id = p_group_id
      and (m.user_id = v_user or not private.social_pair_blocked(m.user_id))
  ),
  entries as materialized (
    select fd.user_id, fd.id, fd.food_name, fd.kcal, fd.carbs_g, fd.protein_g, fd.fat_g,
      fd.photo_path, fd.icon_set, fd.icon_name, fd.logged_at, fd.serving_label,
      -- How much of the portion was eaten, plate share folded in, so the sheet
      -- can say "350 g" or "2 × plate" rather than the bare label "100 g".
      round(fd.quantity * fd.plate_quantity, 2) as eaten,
      private.group_entry_meal(fd.logged_at, fd.log_date, mb.timezone, f.board_meal,
        mb.breakfast_at, mb.lunch_at, mb.dinner_at) as meal
    from members mb
    join public.food_log_details fd on fd.user_id = mb.user_id and fd.log_date = p_day
    join public.food_logs f on f.id = fd.id
  ),
  reactions as materialized (
    select r.entry_id,
      count(*) filter (where r.value = 1) as likes,
      count(*) filter (where r.value = -1) as dislikes,
      max(r.value) filter (where r.user_id = v_user) as mine
    from public.group_reactions r
    join entries e on e.id = r.entry_id
    join members mb on mb.user_id = r.user_id
    group by r.entry_id
  ),
  nudges as materialized (
    select distinct on (n.target_id, n.meal) n.target_id, n.meal, n.nudger_id
    from public.group_nudges n
    where n.group_id = p_group_id and n.day = p_day and n.created_at > now() - interval '1 hour'
    order by n.target_id, n.meal, n.created_at desc
  )
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'icon_name', g.icon_name,
        'icon_path', g.icon_path, 'is_public', g.is_public, 'leader_id', g.leader_id, 'member_count', g.member_count)
      from public.groups g where g.id = p_group_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person', private.group_person(mb.user_id),
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'meal', e.meal, 'name', e.food_name, 'kcal', e.kcal,
            'carbs_g', e.carbs_g, 'protein_g', e.protein_g, 'fat_g', e.fat_g,
            'photo_path', e.photo_path, 'icon_set', e.icon_set, 'icon_name', e.icon_name,
            'logged_at', e.logged_at, 'serving_label', e.serving_label, 'quantity', e.eaten,
            'likes', coalesce(r.likes, 0), 'dislikes', coalesce(r.dislikes, 0), 'mine', coalesce(r.mine, 0)
          ) order by e.logged_at, e.id)
          from entries e left join reactions r on r.entry_id = e.id
          where e.user_id = mb.user_id
        ), '[]'::jsonb),
        'nudges', coalesce((
          -- A nudge by someone blocked still holds the cooldown (nudgeable
          -- reads every one), but is not drawn with their face.
          select jsonb_object_agg(n.meal, jsonb_build_object('by', private.group_person(n.nudger_id)))
          from nudges n where n.target_id = mb.user_id and not private.social_pair_blocked(n.nudger_id)
        ), '{}'::jsonb),
        -- The same rule as nudge_group_member, read from what this query
        -- already holds instead of three lookups per member and meal.
        'nudgeable', case when mb.user_id = v_user then '[]'::jsonb else coalesce((
          select jsonb_agg(m.meal order by m.meal) from unnest(enum_range(null::public.group_meal)) m(meal)
          where private.group_meal_due(mb.local_now, p_day, m.meal,
              case m.meal when 'breakfast' then mb.breakfast_at when 'lunch' then mb.lunch_at else mb.dinner_at end)
            and not exists (select 1 from entries e where e.user_id = mb.user_id and e.meal = m.meal)
            and not exists (select 1 from nudges n where n.target_id = mb.user_id and n.meal = m.meal)
        ), '[]'::jsonb) end,
        'workout', (
          -- The day's workouts read once: the first draws the tile, and `all`
          -- lists every one for the tap that opens them (appended, so an older
          -- app reads the rest unchanged).
          select case when w.all_of is not null then
            (w.all_of -> 0) - 'started_at'
              || jsonb_build_object('count', jsonb_array_length(w.all_of),
                   'all', (select jsonb_agg(e - 'started_at') from jsonb_array_elements(w.all_of) e))
          end
          from (
            select jsonb_agg(jsonb_build_object('id', x.id, 'source', x.source, 'name', x.name,
                'kind', x.kind, 'duration_s', x.duration_s, 'started_at', x.started_at) order by x.started_at) as all_of
            from (
              select wo.id, 'workout'::text as source, wo.name, 'strength'::text as kind, wo.duration_s, wo.started_at
              from public.workouts wo where wo.user_id = mb.user_id and wo.log_date = p_day
              union all
              -- A workout saved to Apple Health comes back as a session; the
              -- in-app one already stands for it. Apple writes no label, so the
              -- name is null there and the app names the kind itself.
              select s.id, 'activity', nullif(btrim(s.kind_label), ''), s.kind, s.duration_s, s.started_at
              from public.activity_sessions s
              where s.user_id = mb.user_id and s.log_date = p_day
                and not exists (select 1 from public.workouts wo where wo.user_id = mb.user_id
                  and wo.health_workout_id = s.external_id)
            ) x
          ) w
        )
      ) order by mb.rank, mb.last_active desc nulls last, mb.joined_at, mb.user_id)
      from members mb
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_recipe_copy (
  p_recipe_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  src    public.recipes;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into src
  from public.recipes r
  where r.id = p_recipe_id
    and (
      r.owner_id = v_user
      or r.owner_id is null
      or (r.is_public and r.review_status = 'approved')
    );

  if src.id is null then
    raise exception 'recipe not found';
  end if;

  -- NOT the photograph. An object key names one object under ONE user's prefix,
  -- and `ownsKey` is what stands between two users' diaries — a copy carrying
  -- the original author's key could never be signed for its new owner, so the
  -- tile would be permanently blank. Worse, it would ALIAS: the original author
  -- deleting their recipe deletes that object, and every copy of it goes dark.
  -- The illustration copies, because a drawing belongs to nobody.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, food_id, amount, unit, display_unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new, i.name, i.food_id, i.amount, i.unit, i.display_unit,
    i.kcal_per_unit, i.carbs_g_per_unit, i.protein_g_per_unit, i.fat_g_per_unit,
    i.position
  from public.recipe_ingredients i
  where i.recipe_id = src.id;

  -- Not on a copy of your own recipe: duplicating something to try a variation
  -- is not a vote for it.
  --
  -- And ONCE PER PERSON. The ledger's primary key is what decides that, so a
  -- second save by the same person conflicts, inserts nothing, leaves `found`
  -- false and never reaches the counter. Bumped on every call, the column
  -- counted saves rather than people — and the community shelf is ordered by
  -- it, so saving your own favourite twenty times was a way to the top of it.
  if src.owner_id is distinct from v_user then
    insert into public.recipe_saves (recipe_id, user_id)
    values (src.id, v_user)
    on conflict do nothing;

    if found then
      update public.recipes set saved_count = saved_count + 1 where id = src.id;
    end if;
  end if;

  return v_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_shared_recipe_copy (
  p_share_slug text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  src    public.recipes;
  v_new  uuid;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select * into src
  from public.recipes r
  where r.share_slug = p_share_slug
    and (
      r.owner_id = v_user
      or r.owner_id is null
      or (
        not exists (
          select 1
          from public.blocked_authors b
          where b.user_id = v_user
            and b.author_id = r.owner_id
        )
        and not exists (
          select 1
          from public.recipe_reports p
          where p.recipe_id = r.id
            and p.reporter_id = v_user
        )
      )
    );

  if src.id is null then
    raise exception 'recipe not found';
  end if;

  -- Photographs stay with their owner. See save_recipe_copy for why the icon
  -- can copy and an R2 object key cannot.
  insert into public.recipes (
    owner_id, name, icon_set, icon_name, servings, steps, source_recipe_id
  )
  values (
    v_user, src.name, src.icon_set, src.icon_name, src.servings, src.steps, src.id
  )
  returning id into v_new;

  insert into public.recipe_ingredients (
    recipe_id, name, food_id, amount, unit, display_unit,
    kcal_per_unit, carbs_g_per_unit, protein_g_per_unit, fat_g_per_unit, position
  )
  select
    v_new, i.name, i.food_id, i.amount, i.unit, i.display_unit,
    i.kcal_per_unit, i.carbs_g_per_unit, i.protein_g_per_unit, i.fat_g_per_unit,
    i.position
  from public.recipe_ingredients i
  where i.recipe_id = src.id;

  if src.owner_id is distinct from v_user then
    insert into public.recipe_saves (recipe_id, user_id)
    values (src.id, v_user)
    on conflict do nothing;

    if found then
      update public.recipes set saved_count = saved_count + 1 where id = src.id;
    end if;
  end if;

  return v_new;
end;
$function$;

ALTER TABLE public.food_logs
  ADD COLUMN serving_ml numeric(9,2);

ALTER TABLE public.recipe_ingredients
  ADD COLUMN display_unit text;

ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_check
    CHECK
    (display_unit IS NULL OR unit = 'g'::public.recipe_unit AND (display_unit = ANY (ARRAY['g'::text, 'kg'::text, 'oz'::text, 'lb'::text])) OR unit = 'ml'::public.recipe_unit AND
    (display_unit = ANY (ARRAY['ml'::text, 'l'::text, 'tsp'::text, 'tbsp'::text, 'cup'::text, 'floz'::text])));

CREATE OR REPLACE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    e.scan_id,
    e.suggested_edits,
    COALESCE(e.display_label, e.item_name) AS food_name,
    e.item_brand AS food_brand,
    COALESCE(e.icon_set, e.item_icon_set) AS icon_set,
    COALESCE(e.icon_name, e.item_icon_name) AS icon_name,
    e.item_place AS place,
    e.serving_id,
    e.serving_label,
    e.serving_factor,
    e.override_kcal,
    e.override_carbs_g,
    e.override_protein_g,
    e.override_fat_g,
    COALESCE(e.override_kcal, (round((plate.portion * plate.kcal)))::integer, (round((((e.base_kcal)::numeric * e.serving_factor) * e.quantity)))::integer) AS kcal,
    COALESCE(e.override_carbs_g, round((plate.portion * plate.carbs_g), 1), round(((e.base_carbs_g * e.serving_factor) * e.quantity), 1)) AS carbs_g,
    COALESCE(e.override_protein_g, round((plate.portion * plate.protein_g), 1), round(((e.base_protein_g * e.serving_factor) * e.quantity), 1)) AS protein_g,
    COALESCE(e.override_fat_g, round((plate.portion * plate.fat_g), 1), round(((e.base_fat_g * e.serving_factor) * e.quantity), 1)) AS fat_g,
    round((((e.base_fibre_g * e.serving_factor) * e.quantity) * plate.portion), 1) AS fibre_g,
    round((((e.base_sugar_g * e.serving_factor) * e.quantity) * plate.portion), 1) AS sugar_g,
    (round(((((e.base_sodium_mg)::numeric * e.serving_factor) * e.quantity) * plate.portion)))::integer AS sodium_mg,
    round((((e.serving_grams * e.serving_factor) * e.quantity) * plate.portion), 1) AS grams,
    e.recipe_id,
    e.item_name,
    e.item_brand,
    e.base_kcal,
    e.base_carbs_g,
    e.base_protein_g,
    e.base_fat_g,
    e.base_fibre_g,
    e.base_sugar_g,
    e.base_sodium_mg,
    e.serving_grams AS base_serving_grams,
    plate.parts AS ingredient_count,
    plate.portion AS plate_quantity,
    e.serving_ml AS base_serving_ml
   FROM (public.food_logs e
     CROSS JOIN LATERAL ( SELECT (count(*))::integer AS parts,
                CASE
                    WHEN (count(*) > 0) THEN e.plate_quantity
                    ELSE (1)::numeric
                END AS portion,
            sum((((i.base_kcal)::numeric * i.serving_factor) * i.quantity)) AS kcal,
            sum(((i.base_carbs_g * i.serving_factor) * i.quantity)) AS carbs_g,
            sum(((i.base_protein_g * i.serving_factor) * i.quantity)) AS protein_g,
            sum(((i.base_fat_g * i.serving_factor) * i.quantity)) AS fat_g
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)) plate);

CREATE OR REPLACE VIEW public.recipe_ingredient_details WITH (security_invoker=on) AS SELECT id,
    recipe_id,
    food_id,
    "position",
    name,
    amount,
    unit,
    kcal_per_unit,
    carbs_g_per_unit,
    protein_g_per_unit,
    fat_g_per_unit,
    (round((kcal_per_unit * amount)))::integer AS kcal,
    round((carbs_g_per_unit * amount), 1) AS carbs_g,
    round((protein_g_per_unit * amount), 1) AS protein_g,
    round((fat_g_per_unit * amount), 1) AS fat_g,
    display_unit
   FROM public.recipe_ingredients i;
