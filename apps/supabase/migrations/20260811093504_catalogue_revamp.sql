-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.search_foods(q text, p_place public.food_place, match_limit integer, p_fuzzy boolean);

DROP INDEX public.foods_name_norm_trgm_idx;

DROP VIEW public.food_details;

CREATE FUNCTION public.food_aliases_set_norm()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.alias_norm := public.search_normalize(new.alias);
  return new;
end;
$function$;

CREATE FUNCTION public.gtin14 (
  code text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select case
    when d is null or length(d) < 8 or length(d) > 14 then null
    -- All zeros is what a failed read produces, and it is not a product.
    when d ~ '^0+$' then null
    else lpad(d, 14, '0')
  end
  from (select nullif(regexp_replace(coalesce(code, ''), '[^0-9]', '', 'g'), '') as d) t;
$function$;

COMMENT ON FUNCTION public.gtin14(text) IS 'Any barcode spelling (UPC-E, EAN-8, UPC-A, EAN-13) as a zero-padded GTIN-14, or null when the input is not a usable code. The check digit is deliberately not validated: real packets and Open Food Facts both carry codes that fail it, and a lookup that refuses to try is worse than one that misses.';

CREATE OR REPLACE FUNCTION public.import_foods (
  payload  jsonb,
  p_update boolean DEFAULT false
)
  RETURNS TABLE (
    idx     integer,
    slug    text,
    outcome text,
    detail  text,
    nearest text
  )
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- The output columns are named `idx`, `slug`, `outcome` and `detail`, which are
-- also the names of the staging table's columns — and a RETURNS TABLE column is
-- a plpgsql variable, so every reference to one inside a query is ambiguous.
-- Resolving in favour of the column is right for all four: they are only ever
-- read from the table, and written by the closing `return query`.
#variable_conflict use_column
declare
  n_in integer;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array, got %', jsonb_typeof(payload);
  end if;

  select jsonb_array_length(payload) into n_in;
  if n_in = 0 then
    return;
  end if;

  create temp table _in on commit drop as
  select
    (t.ordinality)::integer                                as idx,
    nullif(btrim(t.e ->> 'slug'), '')                      as slug,
    nullif(btrim(t.e ->> 'name'), '')                      as name,
    nullif(btrim(t.e ->> 'brand'), '')                     as brand,
    nullif(btrim(t.e ->> 'icon_set'), '')                  as icon_set,
    nullif(btrim(t.e ->> 'icon_name'), '')                 as icon_name,
    nullif(btrim(t.e ->> 'place'), '')                     as place,
    (t.e ->> 'kcal')::numeric                              as kcal,
    (t.e ->> 'carbs_g')::numeric                           as carbs_g,
    (t.e ->> 'protein_g')::numeric                         as protein_g,
    (t.e ->> 'fat_g')::numeric                             as fat_g,
    (t.e ->> 'fibre_g')::numeric                           as fibre_g,
    (t.e ->> 'sugar_g')::numeric                           as sugar_g,
    (t.e ->> 'sodium_mg')::numeric                         as sodium_mg,
    coalesce((t.e ->> 'verified')::boolean, false)         as verified,
    nullif(btrim(t.e ->> 'source'), '')                    as source,
    nullif(btrim(t.e ->> 'source_id'), '')                  as source_id,
    nullif(btrim(t.e ->> 'search_text'), '')               as search_text,
    -- Normalized on the way in, so the payload may spell a barcode however the
    -- packet does and two payloads cannot disagree about one product. Null
    -- covers both "no barcode" and "not a usable code"; the validation below
    -- tells those apart by looking at the raw field again.
    public.gtin14(t.e ->> 'barcode')                       as barcode,
    lower(coalesce(nullif(btrim(t.e ->> 'barcode'), ''), '')) as barcode_raw,
    coalesce((t.e ->> 'popularity')::integer, 0)           as popularity,
    coalesce(
      (select array_agg(lower(btrim(c.value #>> '{}')))
       from jsonb_array_elements(coalesce(t.e -> 'countries', '[]'::jsonb)) c
       where btrim(c.value #>> '{}') ~ '^[A-Za-z]{2}$'),
      '{}'::text[]
    )                                                      as countries,
    -- One string per other name the dish goes by. Written as rows in
    -- `food_aliases` rather than folded into `search_text`, which is what makes
    -- typing a dish's second name an exact hit rather than one token in a bag.
    coalesce(t.e -> 'aliases', '[]'::jsonb)                as aliases,
    coalesce(t.e -> 'servings', '[]'::jsonb)               as servings
  from jsonb_array_elements(payload) with ordinality as t(e, ordinality);

  alter table _in add column name_norm text;
  alter table _in add column verdict   text;
  alter table _in add column reason    text;
  alter table _in add column food_id   uuid;

  update _in set name_norm = public.food_name_norm(name, brand) where name is not null;

  -- Everything a constraint on `foods` or `food_servings` would have raised,
  -- checked here so the batch survives the row. Ordered cheapest-first only for
  -- readability; the first reason to fire is the one reported.
  update _in set verdict = 'rejected', reason = r.reason
  from (
    select idx, reason from (
      select idx, unnest(array[
        case when name is null then 'name is required' end,
        case when char_length(btrim(coalesce(name, ''))) > 120 then 'name longer than 120 characters' end,
        case when slug is null then 'slug is required' end,
        case when slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then 'slug is not kebab-case' end,
        case when place is null then 'place is required' end,
        case when place not in (select unnest(enum_range(null::public.food_place))::text)
             then 'place "' || coalesce(place, '') || '" is not a food_place' end,
        case when kcal is null then 'kcal is required' end,
        case when kcal is not null and (kcal < 0 or kcal > 10000) then 'kcal outside 0..10000' end,
        case when coalesce(carbs_g, 0) < 0 or coalesce(protein_g, 0) < 0 or coalesce(fat_g, 0) < 0
             then 'a macro is negative' end,
        case when fibre_g < 0 or sugar_g < 0 or sodium_mg < 0 then 'fibre, sugar or sodium is negative' end,
        case when (icon_set is null) <> (icon_name is null) then 'half an icon' end,
        case when icon_set is not null
              and icon_set not in (select unnest(enum_range(null::public.icon_set))::text)
             then 'icon_set "' || icon_set || '" is not an icon_set' end,
        case when jsonb_array_length(servings) = 0 then 'no servings' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where (s ->> 'is_default')::boolean) <> 1
             then 'not exactly one default serving' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where (s ->> 'is_default')::boolean
                      and coalesce((s ->> 'factor')::numeric, 0) <> 1) > 0
             then 'the default serving is not factor 1' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where coalesce((s ->> 'factor')::numeric, 0) <= 0
                       or (s ->> 'factor')::numeric > 100) > 0
             then 'a serving factor is outside (0, 100]' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where coalesce(btrim(s ->> 'label'), '') = ''
                       or char_length(btrim(s ->> 'label')) > 40) > 0
             then 'a serving label is empty or longer than 40 characters' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where coalesce(s ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$') > 0
             then 'a serving slug is not kebab-case' end,
        case when (select count(distinct s ->> 'slug') from jsonb_array_elements(servings) s)
                <> jsonb_array_length(servings)
             then 'duplicate serving slugs' end,
        -- A code was written down and it is not one. Silently dropping it would
        -- ship a packaged product that no scanner can ever reach, which looks
        -- from the outside exactly like a product we do not have.
        case when barcode_raw <> '' and barcode is null
             then 'barcode "' || barcode_raw || '" is not a usable code' end,
        case when (select count(*) from jsonb_array_elements(servings) s
                    where (s ? 'grams')
                      and (coalesce((s ->> 'grams')::numeric, 0) <= 0
                        or (s ->> 'grams')::numeric > 100000)) > 0
             then 'a serving weight is outside (0, 100000] grams' end,
        case when source_id is not null
              and not exists (select 1 from public.food_sources fs where fs.id = source_id)
             then 'source_id "' || source_id || '" is not in the source registry' end
      ]) as reason
      from _in
    ) t where reason is not null
  ) r
  where _in.idx = r.idx and _in.verdict is null;

  -- Within the payload: the first spelling of a dish wins and the rest are
  -- skipped, rather than the batch aborting on its own duplicate. Research runs
  -- overlap by design, and two agents handed adjacent topics will both write
  -- down teh tarik.
  update _in set verdict = 'skipped_slug', reason = 'duplicate slug earlier in this payload'
  where verdict is null
    and exists (select 1 from _in p where p.verdict is null and p.slug = _in.slug and p.idx < _in.idx);

  update _in set verdict = 'skipped_name', reason = 'duplicate name earlier in this payload'
  where verdict is null
    and exists (select 1 from _in p where p.verdict is null and p.name_norm = _in.name_norm and p.idx < _in.idx);

  -- A barcode is the strongest identity in the payload: two rows carrying one
  -- means one product written down twice, whatever they called it. Checked
  -- before the catalogue pass so that a payload's own duplicate is reported as
  -- the payload's problem.
  update _in set verdict = 'skipped_barcode', reason = 'duplicate barcode earlier in this payload'
  where verdict is null and barcode is not null
    and exists (select 1 from _in p where p.verdict is null and p.barcode = _in.barcode and p.idx < _in.idx);

  -- Against the catalogue. Slug first: a slug hit is the same row, so it is an
  -- update candidate. A name hit under a different slug is a second row for one
  -- dish and is never written.
  update _in set
    verdict = case when p_update then 'updated' else 'skipped_slug' end,
    reason  = case when p_update then null else 'slug already in the catalogue' end,
    food_id = f.id
  from public.foods f
  where f.slug = _in.slug and _in.verdict is null;

  update _in set verdict = 'skipped_name', reason = 'catalogue already has "' || f.name || '"'
  from public.foods f
  where f.name_norm = _in.name_norm
    and not f.is_estimate
    and _in.verdict is null;

  -- The catalogue already holds this exact product under another slug. Never
  -- written, even with `p_update`: `foods_barcode_idx` is unique, so the insert
  -- would abort the whole batch, and the honest resolution is to correct the
  -- existing row rather than to add a second one for the same packet.
  update _in set verdict = 'skipped_barcode',
                 reason  = 'barcode already on "' || f.name || '"'
  from public.foods f
  where f.barcode = _in.barcode
    and _in.barcode is not null
    and _in.verdict is null;

  -- Write. `search_text` falls back to the trigger's default (the normalized
  -- name) when the payload gave none, so a row with no aliases is still found.
  insert into public.foods as f (
    slug, name, brand, icon_set, icon_name, place,
    kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
    verified, source, source_id, barcode, popularity, countries, search_text
  )
  select
    i.slug, i.name, i.brand, i.icon_set::public.icon_set, i.icon_name,
    i.place::public.food_place,
    round(i.kcal)::integer,
    round(coalesce(i.carbs_g, 0), 1),
    round(coalesce(i.protein_g, 0), 1),
    round(coalesce(i.fat_g, 0), 1),
    round(i.fibre_g, 1), round(i.sugar_g, 1), round(i.sodium_mg)::integer,
    i.verified, i.source, i.source_id, i.barcode, i.popularity, i.countries,
    coalesce(i.search_text, '')
  from _in i
  where i.verdict is null
  order by i.idx;

  update _in set verdict = 'inserted', food_id = f.id
  from public.foods f
  where f.slug = _in.slug and _in.verdict is null;

  update public.foods f set
    name        = i.name,
    brand       = i.brand,
    icon_set    = i.icon_set::public.icon_set,
    icon_name   = i.icon_name,
    place       = i.place::public.food_place,
    kcal        = round(i.kcal)::integer,
    carbs_g     = round(coalesce(i.carbs_g, 0), 1),
    protein_g   = round(coalesce(i.protein_g, 0), 1),
    fat_g       = round(coalesce(i.fat_g, 0), 1),
    fibre_g     = round(i.fibre_g, 1),
    sugar_g     = round(i.sugar_g, 1),
    sodium_mg   = round(i.sodium_mg)::integer,
    verified    = i.verified,
    source      = i.source,
    source_id   = i.source_id,
    -- Only ever filled in, never cleared. A payload that omits the barcode is
    -- one written by somebody researching the dish, not somebody holding the
    -- packet; blanking a code already in the catalogue would make a product
    -- unscannable to correct a figure.
    barcode     = coalesce(i.barcode, f.barcode),
    popularity  = greatest(i.popularity, f.popularity),
    countries   = case when cardinality(i.countries) > 0 then i.countries else f.countries end,
    search_text = coalesce(i.search_text, '')
  from _in i
  where f.id = i.food_id and i.verdict = 'updated';

  -- Portions, for every row that now exists. `(food_id, slug)` is the handle,
  -- so a re-import moves a factor rather than orphaning the entries pointing at
  -- the old serving's id.
  --
  -- Servings are written non-default-first. Postgres checks
  -- `food_servings_one_default_idx` per row, and re-importing a dish whose
  -- default moved to a different slug would otherwise hold two defaults for the
  -- length of the statement.
  insert into public.food_servings as sv (food_id, slug, label, factor, grams, is_default, position)
  select
    i.food_id,
    s ->> 'slug',
    btrim(s ->> 'label'),
    (s ->> 'factor')::numeric,
    -- What this portion weighs, when the payload said. Null stays null: a
    -- weight nobody wrote down is not a weight, and `_shared/portion.ts` has a
    -- documented fallback for exactly that case.
    (s ->> 'grams')::numeric,
    coalesce((s ->> 'is_default')::boolean, false),
    coalesce((s ->> 'position')::smallint, 0)
  from _in i, jsonb_array_elements(i.servings) s
  where i.verdict in ('inserted', 'updated') and i.food_id is not null
  order by coalesce((s ->> 'is_default')::boolean, false)
  on conflict (food_id, slug) do update set
    label      = excluded.label,
    factor     = excluded.factor,
    grams      = coalesce(excluded.grams, sv.grams),
    is_default = excluded.is_default,
    position   = excluded.position;

  -- The other names. Upserted per (food, normalized alias) rather than replaced
  -- wholesale, because two rounds researching one dish each know a spelling the
  -- other does not — the Chinese name from one, the Penang romanization from
  -- another — and a replace would make the last round to run the only one that
  -- counted. `alias_norm` is written by the table's own trigger.
  --
  -- An alias equal to the dish's own name is dropped: it would add an arm's
  -- worth of weight to a row for matching itself twice.
  insert into public.food_aliases as al (food_id, alias)
  select distinct i.food_id, btrim(a.value #>> '{}')
  from _in i, jsonb_array_elements(i.aliases) a
  where i.verdict in ('inserted', 'updated')
    and i.food_id is not null
    and btrim(a.value #>> '{}') <> ''
    and char_length(btrim(a.value #>> '{}')) <= 120
    and public.search_normalize(a.value #>> '{}') <> ''
    and public.search_normalize(a.value #>> '{}') <> i.name_norm
  on conflict (food_id, alias_norm) do nothing;

  -- `operator(extensions.%)` rather than `similarity(...) > x` alone, for the
  -- same reason `search_foods` uses it: only the operator form reaches the GIN
  -- trigram index, and the function form would scan the catalogue once per
  -- imported row. `place <> 'packaged'` used to be repeated here because it was
  -- the partial index's predicate; the index covers the whole table now, and
  -- the clause stays only because it is still the right FILTER — a researched
  -- hawker dish is never a near-miss of a supermarket SKU, and reporting one as
  -- its nearest neighbour would bury the pair that matters.
  --
  -- The operator matches at pg_trgm's session default of 0.3, and the explicit
  -- comparison then cuts to 0.5 — the level that shows the romanization
  -- variants without reporting every dish sharing a word. `search_foods` raises
  -- the default with a function-level `set` instead; that is not available here
  -- because this function is applied over a connection where the pg_trgm GUC is
  -- not loaded, and a loader that cannot be deployed is worse than one that
  -- filters twice.
  return query
    select
      i.idx,
      i.slug,
      coalesce(i.verdict, 'rejected'),
      i.reason,
      case when i.verdict = 'inserted' then (
        select f.name
        from public.foods f
        where f.id is distinct from i.food_id
          and f.place <> 'packaged'
          and not f.is_estimate and not f.is_archetype
          and f.name_norm operator(extensions.%) i.name_norm
          and extensions.similarity(f.name_norm, i.name_norm) >= 0.5
        order by extensions.similarity(f.name_norm, i.name_norm) desc
        limit 1
      ) end
    from _in i order by i.idx;

  drop table _in;
end;
$function$;

COMMENT ON FUNCTION public.import_foods(jsonb,boolean) IS 'Bulk-loads a JSON array of dishes into foods + food_servings + food_aliases. Validates, dedupes on slug, on normalized name and on barcode, and reports one outcome per input row. Additive by default; pass p_update to refresh rows that already exist.';

CREATE OR REPLACE FUNCTION public.seed_archetype_foods()
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
                              verified, is_archetype, source, source_id)
    values (coalesce(r.id, pg_catalog.gen_random_uuid()), r.slug, r.name, 'home',
            r.kcal, r.carbs_g, r.protein_g, r.fat_g,
            false, true, 'archetype median', 'archetype')
    on conflict (slug) do update set
      name       = excluded.name,
      kcal       = excluded.kcal,
      carbs_g    = excluded.carbs_g,
      protein_g  = excluded.protein_g,
      fat_g      = excluded.fat_g,
      source_id  = excluded.source_id,
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

CREATE FUNCTION public.seed_food_sources()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  n integer;
begin
  insert into public.food_sources (id, name, url, licence, attribution, priority)
  values
    ('myfcd_current',   'Malaysian Food Composition Database (2015+)',
     'https://myfcd.moh.gov.my/', 'unclear', 'Malaysian Food Composition Database, Ministry of Health Malaysia', 100),
    ('myfcd_1997',      'Malaysian Food Composition Table (1997)',
     'https://myfcd.moh.gov.my/', 'unclear', 'Malaysian Food Composition Database, Ministry of Health Malaysia', 95),
    ('myfcd_industri',  'MyFCD Industri (Malaysian branded products)',
     'https://myfcd.moh.gov.my/', 'unclear', 'Malaysian Food Composition Database, Ministry of Health Malaysia', 90),
    ('usda_fdc',        'USDA FoodData Central',
     'https://fdc.nal.usda.gov/', 'public_domain', null, 85),
    ('hawker_my',       'RiceCal hawker recipes',
     null, 'proprietary', null, 80),
    ('chain_menu_my',   'Malaysian chain menus',
     null, 'proprietary', null, 70),
    ('brand_drinks_my', 'Malaysian chain drinks',
     null, 'proprietary', null, 70),
    -- Researched rounds: a model wrote the figure down and a human read it.
    -- Below every measured source and above the crowd.
    ('research',        'RiceCal researched dishes',
     null, 'proprietary', null, 60),
    ('open_food_facts', 'Open Food Facts',
     'https://world.openfoodfacts.org/', 'odbl',
     'Data from Open Food Facts, available under the Open Database License', 40),
    -- Rows the cascade wrote for itself. Lowest, and they are hidden from
    -- search anyway; the row exists so that `source_id` is never null for
    -- something the app produced.
    ('scan_estimate',   'RiceCal scan estimate',
     null, 'proprietary', null, 10),
    ('archetype',       'RiceCal archetypes',
     null, 'proprietary', null, 5)
  on conflict (id) do update set
    name        = excluded.name,
    url         = excluded.url,
    licence     = excluded.licence,
    attribution = excluded.attribution,
    priority    = excluded.priority;

  get diagnostics n = row_count;
  return n;
end;
$function$;

COMMENT ON FUNCTION public.seed_food_sources() IS 'Upserts the source registry. Idempotent, and the only writer of it outside the factory. Called from a data migration, not from a schema file.';

GRANT ALL ON FUNCTION public.seed_food_sources() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_estimate_food (
  p_name      text,
  p_kcal      integer,
  p_carbs_g   numeric,
  p_protein_g numeric,
  p_fat_g     numeric,
  p_fibre_g   numeric DEFAULT NULL::numeric,
  p_sugar_g   numeric DEFAULT NULL::numeric,
  p_sodium_mg integer DEFAULT NULL::integer
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_name text := left(trim(p_name), 120);
  v_norm text := public.search_normalize(p_name);
  -- The bucket a size-tagged name rounds to, scaled to what is being priced:
  -- 50 kcal is a rounding error on a plate and most of a satay stick, and a
  -- flat step meant a 64 kcal skewer reusing an 85 kcal row.
  v_step  integer := case when p_kcal < 200 then 10 when p_kcal < 500 then 25 else 50 end;
  -- Half a bucket: inside this the reused figure and the requested one round
  -- to the same tag, so the entry above can stay at exactly one portion.
  v_slack integer := greatest(5, v_step / 2);
  v_id   uuid;
  v_kcal integer;
begin
  if v_norm = '' then
    raise exception 'estimate name normalizes to nothing usable';
  end if;

  select f.id, f.kcal into v_id, v_kcal from public.foods f
  where f.is_estimate and f.name_norm = v_norm;

  -- The row that owns this name is for a different-sized plate. Move to a
  -- size-tagged name, rounded to the bucket so that the same plate
  -- photographed twice lands on one row rather than two a few calories apart.
  if v_id is not null and abs(v_kcal - p_kcal) > v_slack then
    v_name := left(v_name, 108) || ' (' ||
              (greatest(1, round(p_kcal::numeric / v_step)) * v_step) || ' kcal)';
    v_norm := public.search_normalize(v_name);

    select f.id, f.kcal into v_id, v_kcal from public.foods f
    where f.is_estimate and f.name_norm = v_norm;
  end if;

  if v_id is null then
    insert into public.foods
      (slug, name, place, kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g,
       sodium_mg, verified, is_estimate, source, source_id)
    values
      ('estimate-' || replace(v_norm, ' ', '-'),
       v_name, 'home',
       p_kcal, p_carbs_g, p_protein_g, p_fat_g, p_fibre_g, p_sugar_g,
       p_sodium_mg, false, true, 'llm estimate', 'scan_estimate')
    on conflict (name_norm) where is_estimate do nothing
    returning id into v_id;

    -- Lost the race, or the slug collided with a differently-spelled name that
    -- normalizes the same: either way the row exists now, so reuse it.
    if v_id is null then
      select f.id into v_id from public.foods f
      where f.is_estimate and f.name_norm = v_norm;
    end if;

    if v_id is not null then
      insert into public.food_servings (food_id, slug, label, factor, is_default, position)
      values (v_id, 'serving', '1 serving', 1.0, true, 0)
      on conflict (food_id, slug) do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE TABLE public.barcode_misses (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  code       text                     NOT NULL,
  found      boolean                  DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.barcode_misses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.barcode_misses
  ADD CONSTRAINT barcode_misses_code_check CHECK (code ~ '^[0-9]{14}$'::text);

ALTER TABLE public.barcode_misses
  ADD CONSTRAINT barcode_misses_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_misses TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.barcode_misses TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.barcode_misses TO service_role;

CREATE INDEX barcode_misses_code_idx ON public.barcode_misses (code);

CREATE TABLE public.food_aliases (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  food_id    uuid                     NOT NULL,
  alias      text                     NOT NULL,
  alias_norm text                     DEFAULT ''::text NOT NULL,
  lang       text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_aliases
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_aliases
  ADD CONSTRAINT food_aliases_alias_check CHECK (char_length(TRIM(BOTH FROM alias)) >= 1 AND char_length(TRIM(BOTH FROM alias)) <= 120);

ALTER TABLE public.food_aliases
  ADD CONSTRAINT food_aliases_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

ALTER TABLE public.food_aliases
  ADD CONSTRAINT food_aliases_food_norm_key UNIQUE (food_id, alias_norm);

ALTER TABLE public.food_aliases
  ADD CONSTRAINT food_aliases_lang_check CHECK (lang IS NULL OR lang ~ '^[a-z]{2}(-[a-zA-Z0-9]+)*$'::text);

ALTER TABLE public.food_aliases
  ADD CONSTRAINT food_aliases_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_aliases TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_aliases TO authenticated;

GRANT ALL ON public.food_aliases TO service_role;

CREATE INDEX food_aliases_norm_trgm_idx ON public.food_aliases USING gin (alias_norm extensions.gin_trgm_ops);

CREATE INDEX food_aliases_food_idx ON public.food_aliases (food_id);

CREATE INDEX food_aliases_norm_idx ON public.food_aliases (alias_norm);

CREATE TRIGGER food_aliases_set_norm
  BEFORE INSERT OR UPDATE ON public.food_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.food_aliases_set_norm();

CREATE POLICY "food_aliases: read with food" ON public.food_aliases
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.food_servings
  ADD COLUMN grams numeric(9,2);

ALTER TABLE public.food_servings
  ADD CONSTRAINT food_servings_grams_check CHECK (grams > 0::numeric AND grams <= 100000::numeric);

CREATE TABLE public.food_sources (
  id          text                     NOT NULL,
  name        text                     NOT NULL,
  url         text,
  licence     text                     NOT NULL,
  attribution text,
  priority    smallint                 DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.food_sources
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_sources
  ADD CONSTRAINT food_sources_id_check CHECK (id ~ '^[a-z0-9_]+$'::text);

ALTER TABLE public.food_sources
  ADD CONSTRAINT food_sources_name_check CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 80);

ALTER TABLE public.food_sources
  ADD CONSTRAINT food_sources_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_sources TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_sources TO authenticated;

GRANT ALL ON public.food_sources TO service_role;

CREATE TRIGGER food_sources_set_updated_at
  BEFORE UPDATE ON public.food_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "food_sources: read registry" ON public.food_sources
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.foods
  ADD COLUMN source_id text;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.food_sources(id) ON DELETE SET NULL;

ALTER TABLE public.foods
  ADD COLUMN barcode text;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_barcode_check CHECK (barcode ~ '^[0-9]{14}$'::text);

ALTER TABLE public.foods
  ADD COLUMN popularity integer DEFAULT 0 NOT NULL;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_popularity_check CHECK (popularity >= 0);

ALTER TABLE public.foods
  ADD COLUMN countries text[] DEFAULT '{}'::text[] NOT NULL;

CREATE UNIQUE INDEX foods_barcode_idx ON public.foods (barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX foods_name_norm_trgm_idx ON public.foods USING gin (name_norm extensions.gin_trgm_ops);

CREATE VIEW public.food_details WITH (security_invoker=on) AS SELECT f.id,
    f.slug,
    f.name,
    f.brand,
    f.icon_set,
    f.icon_name,
    f.place,
    f.kcal,
    f.carbs_g,
    f.protein_g,
    f.fat_g,
    f.fibre_g,
    f.sugar_g,
    f.sodium_mg,
    f.verified,
    d.id AS default_serving_id,
    d.label AS serving_label,
    COALESCE(sv.servings, '[]'::jsonb) AS servings,
    d.grams AS serving_g,
    f.barcode,
    f.popularity,
    f.countries,
    f.source_id,
    src.name AS source_name,
    src.attribution AS source_attribution,
    src.priority AS source_priority
   FROM (((public.foods f
     LEFT JOIN public.food_servings d ON (((d.food_id = f.id) AND d.is_default)))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'label', s.label, 'factor', s.factor, 'default', s.is_default) ORDER BY s."position", s.label) AS servings
           FROM public.food_servings s
          WHERE (s.food_id = f.id)) sv ON (true))
     LEFT JOIN public.food_sources src ON ((src.id = f.source_id)));

CREATE FUNCTION public.lookup_barcode (
  p_code text
)
  RETURNS SETOF public.food_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select d.*
  from public.food_details d
  where d.barcode is not null
    and d.barcode = public.gtin14(p_code)
  limit 1;
$function$;

COMMENT ON FUNCTION public.lookup_barcode(text) IS 'One product by its barcode, in any symbology — both the stored column and the argument are normalized to GTIN-14. Zero rows means the catalogue has never seen this code, which the client answers by asking the `barcode` edge function to fetch it from Open Food Facts live.';

GRANT ALL ON FUNCTION public.lookup_barcode(text) TO authenticated;

GRANT ALL ON FUNCTION public.lookup_barcode(text) TO service_role;

-- Loads pg_trgm into THIS session before the `set
-- "pg_trgm.similarity_threshold"` below is parsed. Until the library is loaded
-- the parameter is an unrecognized placeholder, and setting one of those is
-- superuser-only — which the hosted `postgres` role is not, so a push of this
-- file alone fails with SQLSTATE 42501 and rolls the whole migration back while
-- CI stays green (it applies the baseline's `create extension` in the same
-- run). See 20260807104259_recipes.sql, which is the migration that learnt it.
-- Any future migration restating `search_foods` owes itself this line.
select extensions.similarity('', '');

CREATE OR REPLACE FUNCTION public.search_foods (
  q           text,
  p_place     public.food_place DEFAULT NULL::public.food_place,
  match_limit integer           DEFAULT 50,
  p_fuzzy     boolean           DEFAULT true
)
  RETURNS SETOF public.food_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  SET "pg_trgm.similarity_threshold" TO '0.4'
  AS $function$
  -- `materialized` matters. Inlined, `search_tsquery(q)` ends up inside the
  -- full-text arm's sort key and is re-evaluated once per candidate row — tens
  -- of thousands of times for a common word, turning a 76 ms scan into a 525 ms
  -- one. Computing both forms of the query exactly once is the whole job of
  -- this CTE.
  with params as materialized (
    select
      public.search_normalize(q) as qn,
      case
        when p_fuzzy then public.search_tsquery(q)
        else public.search_tsquery_all(q)
      end as tsq
  ),
  -- Each arm is capped before fusion, not after. A post-filter would let two
  -- hundred irrelevant candidates crowd out the handful that survive it.
  -- Every arm skips estimate, archetype and recipe rows. They are catalogue
  -- rows so that `food_logs.food_id` can reference them, not so that search can
  -- offer a guess next to a curated dish — and in the recipe case the exclusion
  -- is what keeps one user's cooking out of everybody else's results.
  exact_name as (
    select f.id, 1 as rank
    from public.foods f
    cross join params p
    where p.qn <> ''
      and f.name_norm = p.qn
      and not f.is_estimate and not f.is_archetype and not f.is_recipe
      and (p_place is null or f.place = p_place)
    limit 200
  ),
  -- `distinct` because a dish can hold two aliases that normalize alike in
  -- different scripts, and a food appearing twice in one arm would be ranked
  -- twice and fused as if two arms had agreed about it.
  exact_alias as (
    select id, row_number() over () as rank
    from (
      select distinct f.id
      from public.food_aliases a
      join public.foods f on f.id = a.food_id
      cross join params p
      where p.qn <> ''
        and a.alias_norm = p.qn
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      limit 200
    ) t
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
      from public.foods f
      cross join params p
      where p.tsq is not null
        and f.search_tsv @@ p.tsq
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      order by ts_rank_cd(f.search_tsv, p.tsq) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  -- `operator(extensions.%)` rather than `similarity(...) > 0.4`: only the
  -- operator form reaches the GIN trigram index, and the function form would
  -- sequentially scan the whole catalogue on every keystroke.
  --
  -- There used to be a `place <> 'packaged'` here, and it was not a filter on
  -- what the user may find — it was the predicate of a PARTIAL index, repeated
  -- so the planner would use it, and it made packaged goods unreachable by
  -- fuzzy matching. Both are gone: the 450,000 American branded rows that made
  -- fuzzy matching unaffordable are not in the catalogue any more, and what
  -- replaced them for packaged goods is `lookup_barcode` below, which is exact.
  trgm_name as (
    select id, row_number() over () as rank
    from (
      select f.id
      from public.foods f
      cross join params p
      where p_fuzzy
        and p.qn <> ''
        and f.name_norm operator(extensions.%) p.qn
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      order by extensions.similarity(f.name_norm, p.qn) desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  trgm_alias as (
    select id, row_number() over () as rank
    from (
      select f.id, max(extensions.similarity(a.alias_norm, p.qn)) as sim
      from public.food_aliases a
      join public.foods f on f.id = a.food_id
      cross join params p
      where p_fuzzy
        and p.qn <> ''
        and a.alias_norm operator(extensions.%) p.qn
        and not f.is_estimate and not f.is_archetype and not f.is_recipe
        and (p_place is null or f.place = p_place)
      -- Grouped, for the reason `exact_alias` is distinct: one dish matching on
      -- three of its spellings is one candidate, ranked by its best one.
      group by f.id, f.verified
      order by sim desc, f.verified desc, f.id
      limit 200
    ) t
  ),
  fused as (
    select id, sum(w) as score
    from (
      select id, 3.0 / (50 + rank) as w from exact_name
      union all
      select id, 2.5 / (50 + rank)      from exact_alias
      union all
      select id, 1.0 / (50 + rank)      from fts
      union all
      select id, 0.8 / (50 + rank)      from trgm_name
      union all
      select id, 0.7 / (50 + rank)      from trgm_alias
    ) arms
    group by id
  )
  select d.*
  from fused
  join public.food_details d on d.id = fused.id
  -- The prior. Three terms, each capped, summing to at most 0.35 — so the worst
  -- it can do is promote a row by a third of its relevance, which reorders
  -- neighbours and cannot rewrite the ranking.
  --
  --   locale      the app is used in Malaysia. Additive for `my` and never a
  --               penalty for the rest, because an empty `countries` means
  --               nobody said where a food is sold, not that it is sold nowhere.
  --   popularity  logarithmic, because the underlying counts are outlet counts
  --               and scan counts and both are power-law. Linear, KFC would
  --               have outranked relevance itself.
  --   verified    a laboratory measurement over a manufacturer's label.
  order by
    fused.score * (
      1
      + case when 'my' = any(d.countries) then 0.20 else 0 end
      + least(0.10, 0.025 * ln(1 + greatest(d.popularity, 0)))
      + case when d.verified then 0.05 else 0 end
    ) desc,
    -- Beyond the prior, prefer the better-sourced row, then the shorter name:
    -- between "Nasi Lemak" and "Nasi Lemak with Fried Chicken and Extra Sambal"
    -- for the query "nasi lemak", the plain one is what was asked for.
    coalesce(d.source_priority, 0) desc,
    length(d.name),
    d.name
  limit greatest(1, least(coalesce(match_limit, 50), 200));
$function$;

COMMENT ON FUNCTION public.search_foods(text,public.food_place,integer,boolean) IS 'Fuzzy, multilingual food search over the catalogue. Fuses five arms — exact name, exact alias, full text, name trigram, alias trigram — with Reciprocal Rank Fusion, then multiplies a bounded locale/popularity/verified prior that can settle a near-tie and cannot outrank relevance. Returns `food_details` rows in relevance order; an empty or all-stopword query returns nothing, which the client reads as "browse instead". `p_fuzzy => false` drops the two trigram arms and requires every term to match: two orders of magnitude faster, for callers whose queries are machine-written and therefore correctly spelled.';

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_details TO service_role;

-- ---------------------------------------------------------------------------
-- Data, which a diff never emits.
--
-- `foods.source_id` references `food_sources`, so the registry has to exist
-- before anything can cite it — and the registry is rows, which `supabase db
-- diff` only ever shapes the shadow database with and never writes out. Same
-- exception the archetype seed is, for the same reason; see
-- README.md.
-- ---------------------------------------------------------------------------

select public.seed_food_sources();

-- Rows that already exist get the citation they were always entitled to. The
-- catalogue rows imported from the CSV loader carry the factory's own source id
-- in `source` verbatim, so most of this is an exact match; anything else keeps
-- a null `source_id` and reads as "unattributed", which is honest.
update public.foods f
   set source_id = s.id
  from public.food_sources s
 where f.source_id is null
   and f.source = s.id;

update public.foods set source_id = 'archetype'
 where source_id is null and is_archetype;

update public.foods set source_id = 'scan_estimate'
 where source_id is null and is_estimate;
