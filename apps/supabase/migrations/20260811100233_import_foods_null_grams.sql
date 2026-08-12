-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
        -- `(s ->> 'grams') is not null` rather than `s ? 'grams'`: a payload
        -- writes the key with a null value for every portion whose label states
        -- no weight, which is most of them, and `s ? 'grams'` is true for those.
        -- Read through `coalesce(..., 0)` that null then failed a `<= 0` test
        -- and rejected the entire round.
        case when (select count(*) from jsonb_array_elements(servings) s
                    where (s ->> 'grams') is not null
                      and ((s ->> 'grams')::numeric <= 0
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