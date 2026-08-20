-- ---------------------------------------------------------------------------
-- Functions with no table dependencies.
--
-- Anything that reads a table lives in a file numbered after that table:
-- `language sql` bodies are parsed and validated at CREATE time, so a function
-- here that referenced `public.profiles` would fail when the shadow database
-- builds the schema files in order. (`language plpgsql` bodies are not validated,
-- which is a trap rather than a workaround: the failure just moves to the first
-- call at runtime.)
--
-- Every function sets `search_path = ''` and schema-qualifies every name. Without
-- it a caller can prepend a schema of their own and have a function resolve to
-- their table instead of ours.
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
-- This was the catalogue's, and the catalogue has left. What kept it is the one
-- caller that never searched anything: `recipes_before_insert` mints a share slug
-- out of a recipe's name, and "Ayam Masak Merah" has to become
-- `ayam-masak-merah` by the same rule every time or a link stops opening.
-- ---------------------------------------------------------------------------

-- Canonical form for matching: lowercase, accent-folded, punctuation collapsed to
-- single spaces.
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


-- Where the text-search helpers went.
--
-- `search_tsquery` and `search_tsquery_all` turned free text into an OR-ed and an
-- AND-ed tsquery, and existed for `search_foods` and nothing else. The catalogue
-- is in Cloudflare D1 now, where the equivalent is FTS5. See
-- `apps/cloudflare/workers/catalogue/src/index.ts`, which carries the same
-- stopword list and the same rule about ORing terms, so that a dish name can
-- carry the match while the narration around it is free to miss.
--
-- `food_name_norm` and `foods_set_search` went with them. Both were about keeping
-- columns in step with a row in a table that is not here.

-- ---------------------------------------------------------------------------
-- One barcode, one spelling.
--
-- A packet carries one of four symbologies and a scanner reports what it saw:
-- UPC-E (8), EAN-8 (8), UPC-A (12), EAN-13 (13). The first two are different
-- things of the same length, and a UPC-A is an EAN-13 with a leading zero that
-- American scanners drop. So the same product read twice can hand back two
-- different strings, and matching them literally would put one product in two
-- catalogue rows.
--
-- GTIN-14 is the superset every one of them zero-pads into, so that is what is
-- stored and what a lookup asks for. Both ends of the comparison go through here.
--
-- What it does not do is validate the check digit. It is tempting, since the last
-- digit is a checksum, but Open Food Facts holds hundreds of thousands of codes
-- that fail it: in-store codes, weighted-item codes, and plain typos on real
-- products that are nonetheless the code printed on the packet. Refusing to look
-- those up would be refusing the answer we have. Length is checked, because a
-- 3-digit "barcode" is a misread.
--
-- Returns null for anything unusable, which every caller reads as "not a barcode"
-- rather than as "no such product".
--
create or replace function public.gtin14(code text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when d is null or length(d) < 8 or length(d) > 14 then null
    -- All zeros is what a failed read produces, and it is not a product.
    when d ~ '^0+$' then null
    else lpad(d, 14, '0')
  end
  from (select nullif(regexp_replace(coalesce(code, ''), '[^0-9]', '', 'g'), '') as d) t;
$$;

comment on function public.gtin14 is
  'Any barcode spelling (UPC-E, EAN-8, UPC-A, EAN-13) as a zero-padded GTIN-14, '
  'or null when the input is not a usable code. The check digit is deliberately '
  'not validated: real packets and Open Food Facts both carry codes that fail '
  'it, and a lookup that refuses to try is worse than one that misses.';

-- A pure string formatter with nothing behind it, and the client has a real use
-- for it: normalizing a scanned code before asking. Stated explicitly rather
-- than left at the default, because the default is PUBLIC — and a revoke that
-- only exists in a schema file is a revoke that never happened (see the note on
-- function grants in CLAUDE.md).
revoke execute on function public.gtin14 from public, anon;
grant execute on function public.gtin14 to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The calorie budget.
--
-- Mifflin-St Jeor, an activity multiplier, then a delta for the distance still to
-- run. The same arithmetic as `computeTargets` in
-- apps/mobile/src/lib/nutrition.ts, which exists only because onboarding shows a
-- budget before the account that would store it. Change one and change the other;
-- there is a test asserting they agree.
--
-- `stable`, not `immutable`: age depends on `current_date`.
--
-- The gap between the two weights is the whole plan. Its sign says which way, its
-- size says how hard, and equal says neither. There was a `weight_goal` enum here
-- as well, asked for on its own onboarding screen, and a second source of the
-- same fact could only agree with the weights or contradict them. Agreeing it was
-- noise; contradicting, it forced the function to decide which of the user's own
-- answers to ignore, and the answer it ignored was usually the one they had just
-- changed.
--
-- Every constant here is somebody's published guidance rather than a taste:
--
--   * Loss at 0.5 kg/week, the gentle end of the 0.5 to 1 kg NHS and CDC both
--     call safe. Gain at 0.25 kg/week, the lean-gain rate, because muscle has a
--     ceiling on how fast it can be built and quicker is mostly fat. 7700 kcal
--     per kg of tissue turns either into a daily figure.
--   * That pace is the most a direction ever asks for. The distance left decides
--     the rest: inside half a kilo of the target nothing happens at all (body
--     weight swings that far on water inside a day, and it is also how a user
--     says they have no goal), and past that the plan never runs quicker than
--     closing the remaining gap over four weeks. Both used to be missing: one
--     deficit was handed to someone 30 kg out and someone 1 kg out alike, and it
--     carried on after they arrived.
--   * That figure is capped at 20% of maintenance for a cut and 15% for a
--     surplus. A flat 550 kcal deficit is a fifth of a large man's day and nearly
--     half a small woman's; the cap is what stops one number being gentle for one
--     body and a crash diet for another.
--   * Protein from body weight at 1.6 g/kg, the point past which the
--     meta-analytic evidence stops improving. Taking it as a share of energy has
--     it backwards: that hands out less protein exactly when a deficit makes it
--     matter most. Capped at the AMDR's 35% of energy so a floored budget stays
--     inside the range.
--   * Fat at 25% of energy, the low end of the AMDR's 20 to 35%, because what is
--     left becomes carbohydrate and this is an app for people who eat rice twice
--     a day. Carbohydrate is that remainder, computed last so the macros add up
--     to the budget exactly.
--   * Floored at 1200 kcal for women and 1500 for men, below which the guidance
--     says medical supervision. Mifflin-St Jeor plus a percentage cut reaches
--     those easily for a small, older, sedentary body.
--
-- kcal is rounded to the nearest 10 so the number on screen reads as a target and
-- not as the output of a formula.
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
