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
  'Lowercase, accent-folded, punctuation-stripped form of a name or a query. '
  'Apostrophes elide rather than split, so "McDonald''s" normalizes to '
  '"mcdonalds" — what a user actually types.';


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


-- Keeps the two search columns on `foods` in step with the row.
--
-- `name_norm` is always derived. `search_text` is not: the catalogue loader
-- supplies it with aliases, romanizations and translations the name itself does
-- not contain ("char koay teow", "炒粿條", "CKT"), and clobbering that on every
-- update would throw the alias coverage away. It is only filled in when a writer
-- left it empty, which is what a hand-inserted dish does.
create or replace function public.foods_set_search()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;


-- ---------------------------------------------------------------------------
-- The calorie budget.
--
-- Mifflin-St Jeor, an activity multiplier, then a goal delta. The same
-- arithmetic as `computeTargets` in apps/mobile/src/lib/nutrition.ts, which
-- exists only because onboarding shows a budget before the account that would
-- store it. Change one and change the other; there is a test asserting they
-- agree, and the numbers below are the reason it is worth having.
--
-- `stable`, not `immutable`: age depends on `current_date`.
--
-- Every constant here is somebody's published guidance rather than a taste:
--
--   * Loss at 0.5 kg/week, the gentle end of the 0.5–1 kg NHS and CDC both call
--     safe. Gain at 0.25 kg/week, the lean-gain rate — muscle has a ceiling on
--     how fast it can be built and quicker is mostly fat. 7700 kcal per kg of
--     tissue turns either into a daily figure.
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
  p_sex           public.sex,
  p_birth_date    date,
  p_height_cm     numeric,
  p_weight_kg     numeric,
  p_activity      public.activity_level,
  p_goal          public.weight_goal
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
    end as tdee
  ),
  delta as (
    select
      tdee,
      case p_goal
        -- 0.5 kg/week over 7700 kcal/kg, or a fifth of maintenance, whichever
        -- asks for less.
        when 'lose' then -least(0.5 * 7700 / 7, tdee * 0.2)
        when 'gain' then  least(0.25 * 7700 / 7, tdee * 0.15)
        else 0
      end as goal_delta
    from maintenance
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
  'Daily calorie and macro budget from body stats. Loss targets 0.5 kg/week and '
  'gain 0.25 kg/week, each capped as a share of maintenance; protein is 1.6 g '
  'per kg of body weight rather than a share of energy; the budget is floored at '
  '1200 kcal for women and 1500 for men. Mirrors computeTargets() in '
  'apps/mobile/src/lib/nutrition.ts — change both together.';
