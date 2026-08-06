-- ---------------------------------------------------------------------------
-- Functions with no table dependencies.
--
-- Anything that reads a table lives in a file numbered after that table:
-- `language sql` bodies are parsed and validated at CREATE time, so a function
-- here that referenced `public.profiles` would fail when the shadow database
-- builds the schema files in order. (`language plpgsql` bodies are not
-- validated, which is a trap rather than a workaround — the failure just moves
-- to the first call at runtime.)
--
-- Every function sets `search_path = ''` and schema-qualifies every name.
-- Without it a caller can prepend a schema of their own and have a function
-- resolve to their table instead of ours; Supabase's security advisor flags
-- the omission as "Function Search Path Mutable".
-- ---------------------------------------------------------------------------


-- Keeps `updated_at` honest. Attached to every table that has the column, so
-- no write path has to remember to set it, including writes from the SQL
-- editor and from service_role jobs.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Search text.
--
-- The query reaching `search_foods` is whatever the user typed, or whatever a
-- vision model wrote after looking at a photo: "char kuey teow with prawns",
-- "nasi lemak bungkus", mixing English with Malay and misspelling both. These
-- two functions are what make that comparable to a catalogue row.
-- ---------------------------------------------------------------------------

-- Canonical form for matching: lowercase, accent-folded, punctuation collapsed
-- to single spaces.
--
-- `immutable`, honestly: the two-argument `unaccent` names its dictionary
-- explicitly instead of resolving it through the search path. That is what lets
-- the result be stored in a column and indexed.
create or replace function public.search_normalize(txt text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(txt, ''))),
        '[^[:alnum:]]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

comment on function public.search_normalize is
  'Lowercase, accent-folded form of a name or a query, with every run of '
  'non-alphanumerics collapsed to one space. Apostrophes SPLIT rather than '
  'elide: "McDonald''s" normalizes to "mcdonald s", not "mcdonalds". Both ends '
  'of every comparison go through here, so the split is harmless — but anything '
  'building a search_text or a slug outside the database has to split too, or '
  'it writes a token the query form can never produce.';


-- Free text to a tsquery, ORing the terms.
--
-- `websearch_to_tsquery` ANDs every term, which is wrong here: "a plate of nasi
-- lemak with fried chicken" would require all six words to appear and match
-- nothing at all. ORing them and letting `ts_rank_cd` reward the rows that match
-- more of them is the behaviour wanted — the dish name carries the match and the
-- surrounding narration is free to miss.
--
-- The stopword list deliberately excludes anything that can distinguish a food:
-- "iced", "fried" and "hot" all stay. Returns null when nothing usable is left,
-- which the caller reads as "this arm has no opinion".
create or replace function public.search_tsquery(txt text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsquery('pg_catalog.simple', string_agg(quote_literal(tok), ' | '))
  from unnest(string_to_array(public.search_normalize(txt), ' ')) as tok
  where tok <> ''
    and length(tok) >= 2
    and tok <> all (array[
      'a','an','the','of','with','and','or','in','on','at','to','for','some',
      'this','that','it','is','are','plus','served','side','plate','bowl','cup',
      'glass','serving','portion','piece','pieces','order','dish','meal','food'
    ]);
$$;

comment on function public.search_tsquery is
  'OR-semantics tsquery over normalized, stopword-filtered terms. Null when the '
  'query holds no usable term.';


-- The same query, ANDed.
--
-- ORing terms is right for a person narrating their lunch and wrong for a
-- machine naming an ingredient, where it is also ruinously expensive: "steamed
-- white rice" ORed matches 19,751 rows, and ranking them means pulling 14,463
-- heap blocks — 118ms warm and over nine seconds cold, which on a plate with
-- five components was enough to hit the statement timeout and lose the whole
-- ingredient breakdown. ANDed the same query matches 11 rows in 12 blocks and
-- runs in 44ms, and the rows it returns are the ones that are actually about
-- steamed white rice.
--
-- Same tokens and same stopwords as its OR twin, so the two agree about what
-- the query even is. Null when nothing usable is left.
create or replace function public.search_tsquery_all(txt text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsquery('pg_catalog.simple', string_agg(quote_literal(tok), ' & '))
  from unnest(string_to_array(public.search_normalize(txt), ' ')) as tok
  where tok <> ''
    and length(tok) >= 2
    and tok <> all (array[
      'a','an','the','of','with','and','or','in','on','at','to','for','some',
      'this','that','it','is','are','plus','served','side','plate','bowl','cup',
      'glass','serving','portion','piece','pieces','order','dish','meal','food'
    ]);
$$;

comment on function public.search_tsquery_all is
  'AND-semantics tsquery over the same terms as search_tsquery. Every term has '
  'to appear: precise, and cheap enough for a caller making one query per '
  'ingredient. Null when the query holds no usable term.';


-- Keeps the two search columns on `foods` in step with the row.
--
-- `name_norm` is always derived. `search_text` is not: the catalogue loader
-- supplies it with aliases, romanizations and translations the name itself does
-- not contain ("char koay teow", "炒粿條", "CKT"), and clobbering that on every
-- update would throw the alias coverage away. It is only filled in when a writer
-- left it empty, which is what a hand-inserted dish does.
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
-- The calorie budget.
--
-- Mifflin-St Jeor, an activity multiplier, then a delta for the distance still
-- to run. The same arithmetic as `computeTargets` in
-- apps/mobile/src/lib/nutrition.ts, which exists only because onboarding shows a
-- budget before the account that would store it. Change one and change the
-- other; there is a test asserting they agree, and the numbers below are the
-- reason it is worth having.
--
-- `stable`, not `immutable`: age depends on `current_date`.
--
-- THE GAP BETWEEN THE TWO WEIGHTS IS THE WHOLE PLAN. Its sign says which way,
-- its size says how hard, and equal says neither. There was a `weight_goal`
-- enum here as well — lose/maintain/gain/track, asked for on its own onboarding
-- screen — and a second source of the same fact could only agree with the
-- weights or contradict them. Agreeing it was noise; contradicting, it forced
-- the function to decide which of the user's own answers to ignore, and the
-- answer it ignored was usually the one they had just changed.
--
-- Every constant here is somebody's published guidance rather than a taste:
--
--   * Loss at 0.5 kg/week, the gentle end of the 0.5–1 kg NHS and CDC both call
--     safe. Gain at 0.25 kg/week, the lean-gain rate — muscle has a ceiling on
--     how fast it can be built and quicker is mostly fat. 7700 kcal per kg of
--     tissue turns either into a daily figure.
--   * That pace is the most a direction ever asks for. The distance left decides
--     the rest: inside half a kilo of the target nothing happens at all (body
--     weight swings that far on water inside a day, and it is also how a user
--     says they have no goal), and past that the plan never runs quicker than
--     closing the remaining gap over four weeks — which leaves the pace
--     untouched for anyone more than 2 kg out and tapers the landing for
--     everyone else. Both used to be missing: one deficit was handed to someone
--     30 kg out and someone 1 kg out alike, and it carried on after they
--     arrived, because nothing in the arithmetic could tell that they had.
--   * That figure is then capped at 20% of maintenance for a cut and 15% for a
--     surplus. A flat 550 kcal deficit is a fifth of a large man's day and
--     nearly half a small woman's; the cap is what stops one number being gentle
--     for one body and a crash diet for another.
--   * Protein from BODY WEIGHT at 1.6 g/kg, the point past which the
--     meta-analytic evidence stops improving. Taking it as a share of energy —
--     which this did, at 22% — has it backwards: it hands out less protein
--     exactly when a deficit makes it matter most. Capped at the AMDR's 35% of
--     energy so a floored budget stays inside the range.
--   * Fat at 25% of energy, the low end of the AMDR's 20–35%, because what is
--     left becomes carbohydrate and this is an app for people who eat rice twice
--     a day. Carbohydrate is that remainder, computed last so the macros add up
--     to the budget exactly instead of to a rounding error.
--   * Floored at 1200 kcal for women and 1500 for men, below which the guidance
--     says medical supervision. Mifflin-St Jeor plus a percentage cut reaches
--     those easily for a small, older, sedentary body — the old 1000 was one
--     number for both sexes and lower than either.
--
-- kcal is rounded to the nearest 10 so the number on screen reads as a target
-- and not as the output of a formula.
-- ---------------------------------------------------------------------------
create or replace function public.compute_targets(
  p_sex              public.sex,
  p_birth_date       date,
  p_height_cm        numeric,
  p_weight_kg        numeric,
  p_activity         public.activity_level,
  -- Null when the user has never said, which reads as maintenance. Only rows
  -- written before the target was collected are in that state.
  p_target_weight_kg numeric default null
)
returns table (kcal integer, carbs_g integer, protein_g integer, fat_g integer)
language sql
stable
set search_path = ''
as $$
  with maintenance as (
    select (
      10 * p_weight_kg
      + 6.25 * p_height_cm
      - 5 * extract(year from age(current_date, p_birth_date))
      + case when p_sex = 'male' then 5 else -161 end
    ) * case p_activity
      when 'sedentary'   then 1.2
      when 'light'       then 1.375
      when 'on_feet'     then 1.55
      when 'very_active' then 1.725
    end as tdee,
    -- Signed the way the pace is: negative when there is weight to lose.
    p_target_weight_kg - p_weight_kg as remaining
  ),
  -- The most this direction ever asks for, before the distance is read. Loss at
  -- 0.5 kg/week and gain at 0.25; which one applies is the sign of the gap and
  -- nothing else.
  nominal as (
    select
      tdee,
      remaining,
      case when remaining < 0 then -0.5 else 0.25 end as pace
    from maintenance
  ),
  -- What the plan does, which is that pace read against the distance left.
  intent as (
    select
      tdee,
      case
        -- Nothing to work toward.
        when remaining is null    then 0
        -- Arrived — and also how a user says they have no goal at all, by
        -- putting the target where they already are.
        when abs(remaining) < 0.5 then 0
        -- The taper: never quicker than closing what is left over four weeks.
        else sign(pace) * least(abs(pace), abs(remaining) / 4)
      end as kg_per_week
    from nominal
  ),
  delta as (
    select
      tdee,
      case
        when kg_per_week = 0 then 0
        -- kg/week over 7700 kcal/kg, or a share of maintenance, whichever asks
        -- for less. The cut is allowed a fifth and the surplus 15%, because
        -- overshooting a lean gain just adds fat.
        when kg_per_week < 0 then -least(abs(kg_per_week) * 7700 / 7, tdee * 0.2)
        else                       least(kg_per_week * 7700 / 7, tdee * 0.15)
      end as goal_delta
    from intent
  ),
  budget as (
    select greatest(
      round((tdee + goal_delta) / 10) * 10,
      case when p_sex = 'male' then 1500 else 1200 end
    ) as kcal
    from delta
  ),
  split as (
    select
      kcal,
      round(least(p_weight_kg * 1.6, kcal * 0.35 / 4)) as protein_g,
      round(kcal * 0.25 / 9) as fat_g
    from budget
  )
  select
    kcal::integer,
    -- Whatever energy the other two leave. Floored at zero: the caps above make
    -- that unreachable, but the floor says so rather than relying on it.
    greatest(round((kcal - protein_g * 4 - fat_g * 9) / 4), 0)::integer,
    protein_g::integer,
    fat_g::integer
  from split;
$$;

comment on function public.compute_targets is
  'Daily calorie and macro budget from body stats. The gap between the current '
  'and target weights is the entire plan: losing targets 0.5 kg/week and gaining '
  '0.25, tapered so the last 2 kg are not chased at full pace, and a target '
  'within half a kilo of the current weight asks for nothing at all. That figure '
  'is then capped as a share of maintenance; protein is 1.6 g per kg of body '
  'weight rather than a share of energy; the budget is floored at 1200 kcal for '
  'women and 1500 for men. A null target weight means none was stated, and reads '
  'as maintenance. Mirrors computeTargets() in apps/mobile/src/lib/nutrition.ts '
  '— change both together.';
