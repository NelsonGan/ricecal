-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP VIEW public.daily_nutrition;

DROP VIEW public.food_log_details;

CREATE FUNCTION public.estimate_food_backlog (
  p_limit integer DEFAULT 100
)
  RETURNS TABLE (
    food_id   uuid,
    name      text,
    kcal      integer,
    log_count bigint,
    last_used timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    f.id,
    f.name,
    f.kcal,
    count(e.id) as log_count,
    max(e.logged_at) as last_used
  from public.foods f
  left join public.food_logs e on e.food_id = f.id
  where f.is_estimate
  group by f.id, f.name, f.kcal
  order by count(e.id) desc, max(e.logged_at) desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$function$;

COMMENT ON FUNCTION public.estimate_food_backlog(integer) IS 'Estimate rows ranked by referencing log count — the catalogue-widening backlog. service_role only.';

GRANT ALL ON FUNCTION public.estimate_food_backlog(integer) TO service_role;

-- Loads pg_trgm's shared library into this session. Without it, the
-- SET "pg_trgm.similarity_threshold" clause below fails on hosted Supabase
-- with "permission denied to set parameter": before the library loads, an
-- extension GUC is a reserved-prefix placeholder no non-superuser may set;
-- once loaded it is an ordinary user-settable parameter.
SELECT extensions.similarity('load', 'pg_trgm');

CREATE OR REPLACE FUNCTION public.search_foods (
  q           text,
  p_place     public.food_place DEFAULT NULL::public.food_place,
  match_limit integer           DEFAULT 50
)
  RETURNS SETOF public.food_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  SET "pg_trgm.similarity_threshold" TO '0.4'
  AS $function$
  -- `materialized` matters. Inlined, `search_tsquery(q)` ends up inside the
  -- full-text arm's sort key and is re-evaluated once per candidate row — 20,530
  -- times for "milk", turning a 76 ms scan into a 525 ms one. Computing both
  -- forms of the query exactly once is the whole job of this CTE.
  with params as materialized (
    select public.search_normalize(q) as qn, public.search_tsquery(q) as tsq
  ),
  -- Each arm is capped before fusion, not after. A post-filter would let two
  -- hundred irrelevant candidates crowd out the handful that survive it.
  -- Every arm skips estimate and archetype rows. They are catalogue rows so
  -- that `food_logs.food_id` can reference them, not so that search can offer
  -- a guess next to a curated dish.
  exact as (
    select f.id, 1 as rank
    from public.foods f, params p
    where p.qn <> ''
      and f.name_norm = p.qn
      and not f.is_estimate and not f.is_archetype
      and (p_place is null or f.place = p_place)
    limit 200
  ),
  -- Ranked inside the subquery and numbered outside it, rather than with one
  -- window function over the lot. A bare `order by` under a `limit` lets
  -- Postgres keep a 200-row heap; a window function makes it sort every match
  -- first, and a common word does not match a handful of rows. "chicken" alone
  -- matches tens of thousands, and full-sorting them cost 870 ms.
  fts as (
    select id, row_number() over () as rank
    from (
      select f.id
      from public.foods f, params p
      where p.tsq is not null
        and f.search_tsv @@ p.tsq
        and not f.is_estimate and not f.is_archetype
        and (p_place is null or f.place = p_place)
      order by ts_rank_cd(f.search_tsv, p.tsq) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  -- `operator(extensions.%)` rather than `similarity(...) > 0.4`: only the
  -- operator form reaches the GIN trigram index, and the function form would
  -- sequentially scan the whole catalogue on every keystroke.
  --
  -- `place <> 'packaged'` is not a filter on what the user may find — it is the
  -- predicate of the partial index this arm rides, and it has to be repeated
  -- here for the planner to use it. Packaged goods are still reached by the
  -- exact and full-text arms; what they do not get is fuzzy matching. See the
  -- index comment in 20_foods.sql for why that is the right trade.
  trgm as (
    select id, row_number() over () as rank
    from (
      select f.id
      from public.foods f, params p
      where p.qn <> ''
        and f.place <> 'packaged'
        and f.name_norm operator(extensions.%) p.qn
        and not f.is_estimate and not f.is_archetype
        and (p_place is null or f.place = p_place)
      order by extensions.similarity(f.name_norm, p.qn) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  fused as (
    select id, sum(w) as score
    from (
      select id, 3.0 / (50 + rank) as w from exact
      union all
      select id, 1.0 / (50 + rank)      from fts
      union all
      select id, 0.8 / (50 + rank)      from trgm
    ) arms
    group by id
  )
  select d.*
  from fused
  join public.food_details d on d.id = fused.id
  -- `verified` breaks ties: between a laboratory measurement and a
  -- manufacturer's label for the same thing, prefer the measurement. It is a
  -- tiebreak and not a term, so it can never outrank relevance.
  order by fused.score desc, d.verified desc, d.name
  limit greatest(1, least(coalesce(match_limit, 50), 200));
$function$;

CREATE FUNCTION public.seed_archetype_foods()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  r record;
  v_food_id uuid;
begin
  for r in
    select * from (values
      -- The terminal row. Its id is hardcoded in the scan edge function; if it
      -- ever changes, change it there too.
      ('a0000000-0000-4000-8000-000000000000'::uuid, 'archetype-mixed-meal',      'Mixed meal',              600, 70.0, 20.0, 25.0),
      (null::uuid, 'archetype-mixed-meal-light',     'Mixed meal, light',         400, 45.0, 15.0, 16.0),
      (null::uuid, 'archetype-mixed-meal-large',     'Mixed meal, large',         850, 95.0, 30.0, 36.0),

      -- Rice
      (null::uuid, 'archetype-fried-rice',           'Fried rice',                640, 82.0, 18.0, 26.0),
      (null::uuid, 'archetype-steamed-rice',         'Steamed rice',              205, 45.0,  4.0,  0.5),
      (null::uuid, 'archetype-nasi-lemak',           'Nasi lemak',                650, 75.0, 18.0, 30.0),
      (null::uuid, 'archetype-rice-with-dishes',     'Rice with dishes',          620, 75.0, 25.0, 24.0),
      (null::uuid, 'archetype-biryani',              'Biryani rice',              700, 90.0, 25.0, 26.0),
      (null::uuid, 'archetype-porridge',             'Rice porridge',             220, 40.0, 10.0,  3.0),

      -- Noodles and pasta
      (null::uuid, 'archetype-fried-noodles',        'Fried noodles',             660, 80.0, 20.0, 28.0),
      (null::uuid, 'archetype-noodle-soup',          'Noodle soup',               400, 55.0, 20.0, 10.0),
      (null::uuid, 'archetype-laksa',                'Laksa',                     550, 60.0, 22.0, 25.0),
      (null::uuid, 'archetype-pasta-tomato',         'Pasta, tomato sauce',       450, 70.0, 15.0, 12.0),
      (null::uuid, 'archetype-pasta-creamy',         'Pasta, cream sauce',        620, 65.0, 20.0, 32.0),
      (null::uuid, 'archetype-instant-noodles',      'Instant noodles',           380, 52.0,  8.0, 15.0),

      -- Bread and wraps
      (null::uuid, 'archetype-sandwich',             'Sandwich',                  350, 40.0, 15.0, 14.0),
      (null::uuid, 'archetype-burger',               'Burger',                    550, 45.0, 25.0, 29.0),
      (null::uuid, 'archetype-pizza-slice',          'Pizza slice',               285, 33.0, 12.0, 11.0),
      (null::uuid, 'archetype-bread-roll',           'Bread roll',                180, 32.0,  5.0,  3.0),
      (null::uuid, 'archetype-roti-canai',           'Roti canai',                300, 40.0,  6.0, 12.0),
      (null::uuid, 'archetype-naan',                 'Naan / flatbread',          260, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-toast',                'Toast with spread',         200, 26.0,  4.0,  9.0),
      (null::uuid, 'archetype-pau',                  'Steamed bun',               280, 45.0,  9.0,  6.0),
      (null::uuid, 'archetype-kebab-wrap',           'Kebab / wrap',              550, 50.0, 28.0, 26.0),

      -- Small plates
      (null::uuid, 'archetype-dumplings',            'Dumplings',                 320, 40.0, 14.0, 11.0),
      (null::uuid, 'archetype-sushi-roll',           'Sushi roll',                300, 55.0, 10.0,  4.0),
      (null::uuid, 'archetype-spring-rolls',         'Spring rolls',              250, 28.0,  8.0, 12.0),
      (null::uuid, 'archetype-satay',                'Satay skewers',             350, 12.0, 28.0, 21.0),

      -- Protein mains
      (null::uuid, 'archetype-fried-chicken',        'Fried chicken',             430, 15.0, 30.0, 27.0),
      (null::uuid, 'archetype-grilled-chicken',      'Grilled chicken',           300,  2.0, 40.0, 14.0),
      (null::uuid, 'archetype-chicken-curry',        'Chicken curry',             450, 12.0, 30.0, 30.0),
      (null::uuid, 'archetype-beef-stew',            'Beef stew / rendang',       400, 15.0, 35.0, 22.0),
      (null::uuid, 'archetype-steak',                'Steak',                     450,  2.0, 40.0, 30.0),
      (null::uuid, 'archetype-grilled-fish',         'Grilled fish',              250,  2.0, 35.0, 11.0),
      (null::uuid, 'archetype-fried-fish',           'Fried fish',                350, 12.0, 28.0, 20.0),
      (null::uuid, 'archetype-seafood-dish',         'Seafood dish',              300, 10.0, 30.0, 15.0),
      (null::uuid, 'archetype-tofu-dish',            'Tofu dish',                 250, 12.0, 15.0, 16.0),
      (null::uuid, 'archetype-egg-dish',             'Egg dish',                  180,  2.0, 12.0, 14.0),
      (null::uuid, 'archetype-curry-dish',           'Curry dish',                400, 20.0, 20.0, 26.0),

      -- Vegetables, soups, salads
      (null::uuid, 'archetype-stir-fried-vegetables','Stir-fried vegetables',     120, 10.0,  4.0,  8.0),
      (null::uuid, 'archetype-steamed-vegetables',   'Steamed vegetables',         60, 10.0,  3.0,  1.0),
      (null::uuid, 'archetype-salad',                'Salad with dressing',       180, 12.0,  5.0, 12.0),
      (null::uuid, 'archetype-clear-soup',           'Clear soup',                120, 10.0,  8.0,  5.0),
      (null::uuid, 'archetype-creamy-soup',          'Creamy soup',               250, 20.0,  8.0, 15.0),

      -- Drinks
      (null::uuid, 'archetype-teh-tarik',            'Milk tea',                  130, 20.0,  3.0,  4.0),
      (null::uuid, 'archetype-kopi',                 'Coffee with milk',          120, 18.0,  3.0,  4.0),
      (null::uuid, 'archetype-black-coffee-tea',     'Black coffee / plain tea',    5,  1.0,  0.0,  0.0),
      (null::uuid, 'archetype-soft-drink',           'Soft drink',                140, 35.0,  0.0,  0.0),
      (null::uuid, 'archetype-fruit-juice',          'Fruit juice',               120, 28.0,  1.0,  0.2),
      (null::uuid, 'archetype-bubble-tea',           'Bubble tea',                350, 60.0,  5.0, 10.0),
      (null::uuid, 'archetype-beer',                 'Beer',                      150, 12.0,  1.0,  0.0),
      (null::uuid, 'archetype-protein-shake',        'Protein shake',             200, 15.0, 25.0,  4.0),

      -- Sweets and snacks
      (null::uuid, 'archetype-cake-slice',           'Cake slice',                350, 45.0,  5.0, 17.0),
      (null::uuid, 'archetype-cookies',              'Cookies / biscuits',        150, 20.0,  2.0,  7.0),
      (null::uuid, 'archetype-ice-cream',            'Ice cream',                 250, 28.0,  4.0, 13.0),
      (null::uuid, 'archetype-kuih',                 'Local kuih',                180, 30.0,  2.0,  6.0),
      (null::uuid, 'archetype-donut-pastry',         'Donut / pastry',            300, 35.0,  5.0, 16.0),
      (null::uuid, 'archetype-chocolate',            'Chocolate bar',             250, 28.0,  3.0, 14.0),
      (null::uuid, 'archetype-chips',                'Chips / crisps',            270, 26.0,  3.0, 17.0),
      (null::uuid, 'archetype-fried-snack',          'Fried snack',               250, 28.0,  4.0, 14.0),
      (null::uuid, 'archetype-nuts',                 'Nuts, a handful',           180,  6.0,  6.0, 15.0),
      (null::uuid, 'archetype-yoghurt',              'Yoghurt',                   120, 15.0,  6.0,  4.0),
      (null::uuid, 'archetype-cereal',               'Cereal with milk',          250, 45.0,  8.0,  5.0),
      (null::uuid, 'archetype-pancakes',             'Pancakes / waffles',        350, 50.0,  8.0, 13.0),
      (null::uuid, 'archetype-fruit',                'Fruit, one serving',         90, 22.0,  1.0,  0.5)
    ) as t (id, slug, name, kcal, carbs_g, protein_g, fat_g)
  loop
    insert into public.foods (id, slug, name, place, kcal, carbs_g, protein_g, fat_g,
                              verified, is_archetype, source)
    values (coalesce(r.id, pg_catalog.gen_random_uuid()), r.slug, r.name, 'home',
            r.kcal, r.carbs_g, r.protein_g, r.fat_g,
            false, true, 'archetype median')
    on conflict (slug) do update set
      name       = excluded.name,
      kcal       = excluded.kcal,
      carbs_g    = excluded.carbs_g,
      protein_g  = excluded.protein_g,
      fat_g      = excluded.fat_g,
      is_archetype = true
    returning id into v_food_id;

    -- Portion is the largest error source, so even a fallback row offers the
    -- one-tap half / large the portion sheet renders.
    insert into public.food_servings (food_id, slug, label, factor, is_default, position)
    values
      (v_food_id, 'serving', '1 serving', 1.0,  true,  0),
      (v_food_id, 'half',    'Half',      0.5,  false, 1),
      (v_food_id, 'large',   'Large',     1.5,  false, 2)
    on conflict (food_id, slug) do update set
      label = excluded.label, factor = excluded.factor;
  end loop;
end;
$function$;

COMMENT ON FUNCTION public.seed_archetype_foods() IS 'Upserts the ~60 tier-5 archetype rows and their portions. Idempotent; called from a data migration and safe to re-run to correct a figure.';

GRANT ALL ON FUNCTION public.seed_archetype_foods() TO service_role;

ALTER TABLE public.food_logs
  ADD COLUMN scan_id uuid;

ALTER TABLE public.food_logs
  ADD COLUMN display_label text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_display_label_check CHECK (char_length(display_label) >= 1 AND char_length(display_label) <= 120);

CREATE INDEX food_logs_scan_idx ON public.food_logs (scan_id)
  WHERE scan_id IS NOT NULL;

CREATE TABLE public.food_scan_items (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid                     NOT NULL,
  scan_id          uuid                     NOT NULL,
  item_index       smallint                 DEFAULT 0 NOT NULL,
  scene            text,
  specific_query   text,
  generic_query    text,
  components       jsonb,
  serving_hint     text,
  llm_kcal_low     integer,
  llm_kcal_high    integer,
  confidence       numeric(3,2),
  resolved_tier    smallint,
  resolved_food_id uuid,
  catalogue_kcal   integer,
  quantity         numeric(6,2),
  food_log_id      uuid,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_scan_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_food_log_id_fkey FOREIGN KEY (food_log_id) REFERENCES public.food_logs(id) ON DELETE SET NULL;

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_pkey PRIMARY KEY (id);

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_resolved_food_id_fkey FOREIGN KEY (resolved_food_id) REFERENCES public.foods(id) ON DELETE SET NULL;

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_resolved_tier_check CHECK (resolved_tier >= 1 AND resolved_tier <= 5);

ALTER TABLE public.food_scan_items
  ADD CONSTRAINT food_scan_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_items TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_items TO authenticated;

GRANT ALL ON public.food_scan_items TO service_role;

CREATE INDEX food_scan_items_scan_idx ON public.food_scan_items (scan_id);

CREATE INDEX food_scan_items_tier_idx ON public.food_scan_items (resolved_tier);

CREATE TABLE public.food_scan_misses (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  scan_id    uuid,
  query      text                     NOT NULL,
  place      public.food_place,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_scan_misses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_scan_misses
  ADD CONSTRAINT food_scan_misses_pkey PRIMARY KEY (id);

ALTER TABLE public.food_scan_misses
  ADD CONSTRAINT food_scan_misses_query_check CHECK (char_length(query) >= 1 AND char_length(query) <= 200);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_misses TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_scan_misses TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_scan_misses TO service_role;

ALTER TABLE public.foods
  ADD COLUMN is_estimate boolean DEFAULT false NOT NULL;

ALTER TABLE public.foods
  ADD COLUMN is_archetype boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX foods_estimate_name_norm_idx ON public.foods (name_norm)
  WHERE is_estimate;

CREATE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.meal,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    e.scan_id,
    COALESCE(e.display_label, f.name) AS food_name,
    f.brand AS food_brand,
    f.verified AS food_verified,
    f.is_estimate,
    f.is_archetype,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_set, f.icon_set)
            ELSE NULL::public.icon_set
        END AS icon_set,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_name, f.icon_name)
            ELSE NULL::text
        END AS icon_name,
    f.place,
    e.serving_id,
    s.label AS serving_label,
    s.factor AS serving_factor,
    (round((((f.kcal)::numeric * s.factor) * e.quantity)))::integer AS kcal,
    round(((f.carbs_g * s.factor) * e.quantity), 1) AS carbs_g,
    round(((f.protein_g * s.factor) * e.quantity), 1) AS protein_g,
    round(((f.fat_g * s.factor) * e.quantity), 1) AS fat_g,
    round(((f.fibre_g * s.factor) * e.quantity), 1) AS fibre_g,
    round(((f.sugar_g * s.factor) * e.quantity), 1) AS sugar_g
   FROM ((public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
     JOIN public.food_servings s ON ((s.id = e.serving_id)));

CREATE VIEW public.daily_nutrition WITH (security_invoker=on) AS SELECT user_id,
    log_date,
    (sum(kcal))::integer AS kcal,
    sum(carbs_g) AS carbs_g,
    sum(protein_g) AS protein_g,
    sum(fat_g) AS fat_g,
    sum(fibre_g) AS fibre_g,
    sum(sugar_g) AS sugar_g,
    (count(*))::integer AS entry_count
   FROM public.food_log_details d
  GROUP BY user_id, log_date;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.daily_nutrition TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO service_role;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_details TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO service_role;

CREATE OR REPLACE VIEW public.user_food_stats WITH (security_invoker=on) AS SELECT e.user_id,
    e.food_id,
    (count(*))::integer AS times_logged,
    max(e.logged_at) AS last_logged_at,
    array_agg(DISTINCT e.meal) AS meals
   FROM (public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
  WHERE ((NOT f.is_estimate) AND (NOT f.is_archetype))
  GROUP BY e.user_id, e.food_id;