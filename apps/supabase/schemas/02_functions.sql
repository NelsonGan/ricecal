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
-- Mifflin-St Jeor, then an activity multiplier, then a goal delta — the same
-- arithmetic as `computeTargets` in src/mock/derive.ts, moved here so there is
-- one implementation rather than two that drift. The client stops computing it
-- and reads `daily_goals` instead.
--
-- `stable`, not `immutable`: age depends on `current_date`.
--
-- The macro split is 47/22/31 by energy — carbohydrate high enough for a rice
-- based diet, protein landing near 1.7 g per kg. kcal is rounded to the
-- nearest 10 so the number on screen reads as a target and not as the output
-- of a formula.
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
  with basal as (
    select
      10 * p_weight_kg
      + 6.25 * p_height_cm
      - 5 * extract(year from age(current_date, p_birth_date))
      + case when p_sex = 'male' then 5 else -161 end as bmr
  ),
  budget as (
    select round(
      (
        bmr * case p_activity
          when 'sedentary'   then 1.2
          when 'light'       then 1.375
          when 'on_feet'     then 1.55
          when 'very_active' then 1.725
        end
        + case p_goal
          when 'lose'     then -400
          when 'gain'     then  300
          else 0
        end
      ) / 10
    ) * 10 as kcal
    from basal
  )
  select
    greatest(kcal, 1000)::integer,
    round(greatest(kcal, 1000) * 0.47 / 4)::integer,
    round(greatest(kcal, 1000) * 0.22 / 4)::integer,
    round(greatest(kcal, 1000) * 0.31 / 9)::integer
  from budget;
$$;

comment on function public.compute_targets is
  'Daily calorie and macro budget from body stats. Floored at 1000 kcal: the '
  'inputs are user-entered and an implausible combination should produce a '
  'conservative target, not one that is unsafe to eat to.';
