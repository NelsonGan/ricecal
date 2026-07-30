-- ---------------------------------------------------------------------------
-- Food search.
--
-- The catalogue is ~460,000 rows. `ilike '%needle%'` was honest over 28 mock
-- dishes and is not honest over this: it has no notion of better or worse, so
-- the fifty rows PostgREST happens to return first are the fifty the user sees,
-- and "kopi" surfaces "Non-Dairy Coffee Whitener" ahead of "Kopi O".
--
-- Three retrieval arms run in parallel and are fused. None of them is
-- sufficient alone:
--
--   exact     the query IS a food's normalized name
--   full text multi-word queries, word order, and every alias in `search_text`
--   trigram   misspellings and romanizations nobody indexed
--
-- Fusion is Reciprocal Rank Fusion — each arm contributes `weight / (k + rank)`
-- — rather than a blend of the arms' own scores, because `ts_rank_cd` and
-- `similarity` are on incomparable scales and normalizing one against the other
-- is guesswork. Ranks are comparable by construction.
--
-- The exact arm carries three times the weight of the others. Without it RRF
-- lets a near neighbour beat a literal hit: "kopi o" loses to "Kopi C" and
-- "curry puff" to "Curry Mee", because between two short names the trigram
-- similarity is nearly identical and full text sees the same token count. A
-- query that IS a food's name should never lose to one that merely resembles it.
-- ---------------------------------------------------------------------------

create or replace function public.search_foods(
  q            text,
  p_place      public.food_place default null,
  match_limit  integer           default 50
)
returns setof public.food_details
language sql
stable
set search_path = ''
-- Trigram matching is the expensive arm: at 0.3, pg_trgm's default, a GIN scan
-- for "char kuey teow" hands back 4,624 candidate rows to recheck and keeps 3,
-- costing ~190 ms of a ~200 ms query. At 0.4 it hands back 570 and the whole
-- search runs in ~20 ms, while still reaching "char kway teow", "nasi lemk",
-- "teh tarek" and "ayam gorng" — the misspellings this arm exists for.
set "pg_trgm.similarity_threshold" = '0.4'
as $$
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
$$;

comment on function public.search_foods is
  'Fuzzy, multilingual food search over the catalogue. Fuses exact, full-text '
  'and trigram arms with Reciprocal Rank Fusion. Returns `food_details` rows in '
  'relevance order; an empty or all-stopword query returns nothing, which the '
  'client reads as "browse instead".';

-- `security invoker` by default, so the caller's RLS on `foods` still applies —
-- the function widens what can be asked, not what can be seen.
grant execute on function public.search_foods to authenticated;
