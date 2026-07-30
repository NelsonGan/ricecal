-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE EXTENSION unaccent WITH SCHEMA extensions;

CREATE FUNCTION public.foods_set_search()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  n text := public.search_normalize(new.name);
  b text := public.search_normalize(coalesce(new.brand, ''));
begin
  -- The brand is prepended only when the name does not already carry it.
  -- Catalogue names often do ("KFC Chicken Rice" with brand "KFC"), and
  -- concatenating unconditionally produced "kfc kfc chicken rice" — a longer
  -- string that scores every trigram comparison lower for no added meaning.
  new.name_norm := case
    when b <> '' and n not like b || '%' then b || ' ' || n
    else n
  end;
  if coalesce(trim(new.search_text), '') = '' then
    new.search_text := new.name_norm;
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.search_foods (
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
  exact as (
    select f.id, 1 as rank
    from public.foods f, params p
    where p.qn <> ''
      and f.name_norm = p.qn
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

COMMENT ON FUNCTION public.search_foods(text,public.food_place,integer) IS 'Fuzzy, multilingual food search over the catalogue. Fuses exact, full-text and trigram arms with Reciprocal Rank Fusion. Returns `food_details` rows in relevance order; an empty or all-stopword query returns nothing, which the client reads as "browse instead".';

GRANT ALL ON FUNCTION public.search_foods(text, public.food_place, integer) TO authenticated;

CREATE FUNCTION public.search_normalize (
  txt text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(txt, ''))),
        '[^[:alnum:]]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$function$;

COMMENT ON FUNCTION public.search_normalize(text) IS 'Lowercase, accent-folded, punctuation-stripped form of a name or a query. Apostrophes elide rather than split, so "McDonald''s" normalizes to "mcdonalds" — what a user actually types.';

CREATE FUNCTION public.search_tsquery (
  txt text
)
  RETURNS tsquery
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select to_tsquery('pg_catalog.simple', string_agg(quote_literal(tok), ' | '))
  from unnest(string_to_array(public.search_normalize(txt), ' ')) as tok
  where tok <> ''
    and length(tok) >= 2
    and tok <> all (array[
      'a','an','the','of','with','and','or','in','on','at','to','for','some',
      'this','that','it','is','are','plus','served','side','plate','bowl','cup',
      'glass','serving','portion','piece','pieces','order','dish','meal','food'
    ]);
$function$;

COMMENT ON FUNCTION public.search_tsquery(text) IS 'OR-semantics tsquery over normalized, stopword-filtered terms. Null when the query holds no usable term.';

ALTER TABLE public.foods
  ADD COLUMN name_norm text DEFAULT ''::text NOT NULL;

ALTER TABLE public.foods
  ADD COLUMN search_text text DEFAULT ''::text NOT NULL;

ALTER TABLE public.foods
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, search_text)) STORED;

CREATE INDEX foods_name_norm_trgm_idx ON public.foods USING gin (name_norm extensions.gin_trgm_ops)
  WHERE place <> 'packaged'::public.food_place;

CREATE INDEX foods_search_tsv_idx ON public.foods USING gin (search_tsv);

CREATE INDEX foods_name_norm_idx ON public.foods (name_norm);

CREATE TRIGGER foods_set_search
  BEFORE INSERT OR UPDATE ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.foods_set_search();