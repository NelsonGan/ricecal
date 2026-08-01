-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

-- Loads pg_trgm's shared library into this session. Without it, the
-- SET "pg_trgm.similarity_threshold" clause below fails on hosted Supabase
-- with "permission denied to set parameter": before the library loads, an
-- extension GUC is a reserved-prefix placeholder no non-superuser may set;
-- once loaded it is an ordinary user-settable parameter. Same reason as
-- 20260730162520 — anything that recreates search_foods needs this line.
SELECT extensions.similarity('load', 'pg_trgm');

DROP FUNCTION public.search_foods(q text, p_place public.food_place, match_limit integer);

CREATE FUNCTION public.search_foods (
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
      where p_fuzzy
        and p.qn <> ''
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

COMMENT ON FUNCTION public.search_foods(text,public.food_place,integer,boolean) IS 'Fuzzy, multilingual food search over the catalogue. Fuses exact, full-text and trigram arms with Reciprocal Rank Fusion. Returns `food_details` rows in relevance order; an empty or all-stopword query returns nothing, which the client reads as "browse instead". `p_fuzzy => false` drops the trigram arm: an order of magnitude faster, for callers whose queries are machine-written and therefore correctly spelled.';

GRANT ALL ON FUNCTION public.search_foods(text, public.food_place, integer, boolean) TO authenticated;

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
  -- Half a bucket: inside this the reused figure and the requested one round
  -- to the same 50 kcal, so the entry above can stay at exactly one portion.
  v_slack integer := greatest(25, round(p_kcal * 0.05));
  v_id   uuid;
  v_kcal integer;
begin
  if v_norm = '' then
    raise exception 'estimate name normalizes to nothing usable';
  end if;

  select f.id, f.kcal into v_id, v_kcal from public.foods f
  where f.is_estimate and f.name_norm = v_norm;

  -- The row that owns this name is for a different-sized plate. Move to a
  -- size-tagged name, rounded to 50 kcal so that the same plate photographed
  -- twice lands on one row rather than on two a few calories apart.
  if v_id is not null and abs(v_kcal - p_kcal) > v_slack then
    v_name := left(v_name, 108) || ' (' || (greatest(1, round(p_kcal / 50.0)) * 50) || ' kcal)';
    v_norm := public.search_normalize(v_name);

    select f.id, f.kcal into v_id, v_kcal from public.foods f
    where f.is_estimate and f.name_norm = v_norm;
  end if;

  if v_id is null then
    insert into public.foods
      (slug, name, place, kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g,
       sodium_mg, verified, is_estimate, source)
    values
      ('estimate-' || replace(v_norm, ' ', '-'),
       v_name, 'home',
       p_kcal, p_carbs_g, p_protein_g, p_fat_g, p_fibre_g, p_sugar_g,
       p_sodium_mg, false, true, 'llm estimate')
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

COMMENT ON FUNCTION public.upsert_estimate_food(text,integer,numeric,numeric,numeric,numeric,numeric,integer) IS 'Reuse-or-create an estimate row, deduped on the normalized name AND the portion size it is for. Returns the food id. service_role only.';