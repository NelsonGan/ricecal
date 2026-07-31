-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

-- Loads pg_trgm's shared library into this session, so the
-- SET "pg_trgm.similarity_threshold" clause below is settable. See
-- 20260730162520 for the full explanation — any migration that recreates
-- search_foods needs this line first.
SELECT extensions.similarity('load', 'pg_trgm');

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
  -- full-text arm's sort key and is re-evaluated once per candidate row — 20,530
  -- times for "milk", turning a 76 ms scan into a 525 ms one. Computing both
  -- forms of the query exactly once is the whole job of this CTE.
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

COMMENT ON FUNCTION public.search_foods(text,public.food_place,integer,boolean) IS 'Fuzzy, multilingual food search over the catalogue. Fuses exact, full-text and trigram arms with Reciprocal Rank Fusion. Returns `food_details` rows in relevance order; an empty or all-stopword query returns nothing, which the client reads as "browse instead". `p_fuzzy => false` drops the trigram arm and requires every term to match: two orders of magnitude faster, for callers whose queries are machine-written and therefore correctly spelled.';

CREATE FUNCTION public.search_tsquery_all (
  txt text
)
  RETURNS tsquery
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select to_tsquery('pg_catalog.simple', string_agg(quote_literal(tok), ' & '))
  from unnest(string_to_array(public.search_normalize(txt), ' ')) as tok
  where tok <> ''
    and length(tok) >= 2
    and tok <> all (array[
      'a','an','the','of','with','and','or','in','on','at','to','for','some',
      'this','that','it','is','are','plus','served','side','plate','bowl','cup',
      'glass','serving','portion','piece','pieces','order','dish','meal','food'
    ]);
$function$;

COMMENT ON FUNCTION public.search_tsquery_all(text) IS 'AND-semantics tsquery over the same terms as search_tsquery. Every term has to appear: precise, and cheap enough for a caller making one query per ingredient. Null when the query holds no usable term.';