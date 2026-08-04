-- The JSON catalogue loader: public.import_foods(jsonb, boolean), plus the
-- normalization rule it dedupes on, lifted out of foods_set_search so the
-- loader and the trigger cannot drift apart.
--
-- Declarative source: apps/supabase/schemas/02_functions.sql and 95_import_foods.sql

-- The rule itself is a function rather than the trigger's own arithmetic,
-- because `import_foods` has to apply it BEFORE inserting: it dedupes a payload
-- against `foods.name_norm`, and a second copy of this expression would
-- eventually disagree with the column it is being compared to.
--
-- The brand is prepended only when the name does not already carry it.
-- Catalogue names often do ("KFC Chicken Rice" with brand "KFC"), and
-- concatenating unconditionally produced "kfc kfc chicken rice" — a longer
-- string that scores every trigram comparison lower for no added meaning.
create or replace function public.food_name_norm(p_name text, p_brand text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when b <> '' and n not like b || '%' then b || ' ' || n
    else n
  end
  from (
    select public.search_normalize(p_name)                as n,
           public.search_normalize(coalesce(p_brand, '')) as b
  ) t;
$$;

comment on function public.food_name_norm is
  'The value foods_set_search writes to name_norm for a given (name, brand). '
  'Exposed so the JSON loader can dedupe on the same rule the index uses.';

-- Only the roles that can write `foods` need it: the trigger runs as its
-- invoker, and the loader is the only other caller.
revoke execute on function public.food_name_norm from public, anon, authenticated;
grant execute on function public.food_name_norm to service_role;

create or replace function public.foods_set_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_norm := public.food_name_norm(new.name, new.brand);
  if coalesce(trim(new.search_text), '') = '' then
    new.search_text := new.name_norm;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- The JSON catalogue loader.
--
-- `scripts/import-catalogue.sql` loads the half-million-row CSV export from the
-- sibling `ricecal-food-database` project, in one psql session, against a local
-- stack. This is the other shape: a few hundred rows at a time, arriving as
-- JSON from a researcher (human or model) who wrote down a dish, its portion
-- and its macros — and arriving over whatever connection is to hand, which for
-- a machine with no Docker and no psql is an HTTP call.
--
-- So the validation, the dedup and the upsert all live IN THE DATABASE rather
-- than in the caller. A client-side loader has to fetch the catalogue to know
-- what is already in it, and two loaders running at once would each decide a
-- new dish was new. Here the check and the write are one statement.
--
-- WHAT IT REFUSES
--
-- A row is REJECTED when it breaks a constraint the table would have raised on
-- anyway — but one row at a time, with a reason, instead of aborting the batch.
-- A payload of 300 researched dishes with one bad `place` should import 299 and
-- name the one it dropped; `insert ... select` would import none of them and
-- report a column type.
--
-- A row is SKIPPED when the catalogue already has it. That is the whole point:
-- this runs repeatedly over overlapping research, and "already there" is the
-- expected outcome for most of what it is handed. Two identities are checked,
-- because they fail differently:
--
--   slug       the stable handle. A second payload naming `nasi-lemak` means
--              the same dish, and re-importing it must not raise on the unique
--              index. With `p_update` it refreshes the row in place instead.
--   name_norm  the same dish under a different slug — `char-kway-teow` against
--              an existing `char-kuey-teow`. This is the one that matters for
--              a catalogue filled by search: two rows spelling one dish split
--              its logs and make the search screen look broken.
--
-- Estimate rows are excluded from the name check. A tier-4 row is a guess the
-- cascade wrote and search already hides; a curated row for the same dish is
-- exactly what should replace it, and blocking it would make the catalogue
-- permanently worse for having once guessed.
--
-- WHAT IT REPORTS BUT DOES NOT REFUSE
--
-- The duplicate that matters most in a Malaysian catalogue is the one exact
-- matching cannot see: `char kway teow` against `char kuey teow`, `apam balik`
-- against `apom balik`. The obvious fix is a trigram threshold, and it does not
-- work — measured over real pairs, the romanization variants land at 0.57–0.71
-- while genuinely different dishes land above them:
--
--     0.714  bak kut teh            | bah kut teh              same dish
--     0.621  nasi lemak ayam goreng | nasi lemak ayam rendang  different dishes
--     0.579  char kway teow         | char kuey teow           same dish
--     0.524  nasi lemak ayam        | nasi lemak ikan          different dishes
--
-- There is no cut that keeps the first and third while dropping the second and
-- fourth, so refusing on similarity would block real coverage to catch some of
-- the duplicates and miss the rest anyway. Instead every inserted row comes
-- back with its nearest existing neighbour, and deciding is left to whoever is
-- running the round — a handful of pairs per batch, and a judgement rather than
-- a threshold.
-- ---------------------------------------------------------------------------

-- The normalized name this loader dedupes on is `public.food_name_norm`, in
-- 02_functions.sql beside `search_normalize` — the same function the trigger
-- writing `foods.name_norm` calls, rather than a second copy of the rule. A
-- dedup rule that disagrees with the index it is checking against is a
-- duplicate-shaped bug nobody can see: the loader says "new", the unique index
-- says "conflict", and the row that lands is neither.


-- ---------------------------------------------------------------------------
-- The loader itself.
--
-- `payload` is a JSON array of dish objects; see scripts/import-foods.mjs for
-- the contract and for the client that normalizes into it. Every optional field
-- may be absent or null. `servings` is an array of {slug,label,factor,
-- is_default,position} and must contain exactly one default at factor 1.
--
-- Returns one row per input dish, in input order, so the caller can report
-- what happened without a second query.
-- ---------------------------------------------------------------------------
create or replace function public.import_foods(
  payload   jsonb,
  -- Off by default. A research batch is additive: it proposes dishes and the
  -- catalogue keeps the first answer it was given, so re-running yesterday's
  -- payload cannot quietly move numbers a user has already been shown. Turn it
  -- on to deliberately correct rows this loader wrote.
  p_update  boolean default false
)
returns table (
  idx      integer,
  slug     text,
  outcome  text,   -- inserted | updated | skipped_slug | skipped_name | rejected
  detail   text,
  -- The closest existing dish to a row that was just inserted, when there is
  -- one within reach. Null is the common answer and means "nothing like it".
  nearest  text
)
language plpgsql
set search_path = ''
as $$
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
    nullif(btrim(t.e ->> 'search_text'), '')               as search_text,
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
             then 'duplicate serving slugs' end
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

  -- Write. `search_text` falls back to the trigger's default (the normalized
  -- name) when the payload gave none, so a row with no aliases is still found.
  insert into public.foods as f (
    slug, name, brand, icon_set, icon_name, place,
    kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
    verified, source, search_text
  )
  select
    i.slug, i.name, i.brand, i.icon_set::public.icon_set, i.icon_name,
    i.place::public.food_place,
    round(i.kcal)::integer,
    round(coalesce(i.carbs_g, 0), 1),
    round(coalesce(i.protein_g, 0), 1),
    round(coalesce(i.fat_g, 0), 1),
    round(i.fibre_g, 1), round(i.sugar_g, 1), round(i.sodium_mg)::integer,
    i.verified, i.source, coalesce(i.search_text, '')
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
  insert into public.food_servings as sv (food_id, slug, label, factor, is_default, position)
  select
    i.food_id,
    s ->> 'slug',
    btrim(s ->> 'label'),
    (s ->> 'factor')::numeric,
    coalesce((s ->> 'is_default')::boolean, false),
    coalesce((s ->> 'position')::smallint, 0)
  from _in i, jsonb_array_elements(i.servings) s
  where i.verdict in ('inserted', 'updated') and i.food_id is not null
  order by coalesce((s ->> 'is_default')::boolean, false)
  on conflict (food_id, slug) do update set
    label      = excluded.label,
    factor     = excluded.factor,
    is_default = excluded.is_default,
    position   = excluded.position;

  -- `operator(extensions.%)` rather than `similarity(...) > x` alone, for the
  -- same reason `search_foods` uses it: only the operator form reaches the GIN
  -- trigram index, and the function form would scan the catalogue once per
  -- imported row. `place <> 'packaged'` is the partial index's own predicate
  -- and has to be repeated for the planner to use it — which is also the right
  -- filter here, since a hawker dish is never a near-miss of a supermarket SKU.
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
$$;

comment on function public.import_foods is
  'Bulk-loads a JSON array of dishes into foods + food_servings. Validates, '
  'dedupes on slug and on normalized name, and reports one outcome per input '
  'row. Additive by default; pass p_update to refresh rows that already exist.';

-- Grants are the outer gate, and this one writes the catalogue. `service_role`
-- only — the same role the CSV loader sets before its COPY. The revoke is not
-- redundant: a function is executable by PUBLIC on creation, and `db diff`
-- does not notice when it stays that way (see the note in CLAUDE.md).
revoke execute on function public.import_foods from public, anon, authenticated;
grant execute on function public.import_foods to service_role;
